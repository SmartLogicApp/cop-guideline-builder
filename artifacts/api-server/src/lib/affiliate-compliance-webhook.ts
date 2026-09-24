import {
  db, affiliates, affiliateComplianceStatus, affiliatePayoutWorkflow,
  affiliateCommissions, affiliateComplianceAuditLog, affiliatePayoutWorkflowCommissions,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getStripeConnectTestClient } from "../stripeClient.js";
import { isTestExpressRecipient } from "./affiliate-connect-account.js";

function destinationId(destination: Stripe.Transfer["destination"]): string | null {
  return typeof destination === "string" ? destination : destination?.id ?? null;
}

export async function processAffiliateConnectWebhook(event: Stripe.Event): Promise<void> {
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const affiliateId = account.metadata?.affiliateId;
    if (!affiliateId || event.livemode) return;
    const [linkedStatus] = await db.select({
      affiliateId: affiliateComplianceStatus.affiliateId,
      stripeConnectedAccountId: affiliateComplianceStatus.stripeConnectedAccountId,
    }).from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.stripeConnectedAccountId, account.id)).limit(1);
    // Stripe metadata is only a consistency check. It can never bind or rebind
    // an account; the previously persisted account ID is authoritative.
    if (!linkedStatus || linkedStatus.affiliateId !== affiliateId
        || linkedStatus.stripeConnectedAccountId !== account.id) return;
    if (!(await isTestExpressRecipient(getStripeConnectTestClient(), account))) return;
    const due = [...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])]
      .filter((item): item is string => typeof item === "string").slice(0, 50);
    const detailsSubmitted = Boolean(account.details_submitted);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const now = new Date();
    const complete = detailsSubmitted && payoutsEnabled && due.length === 0;
    await db.transaction(async (tx) => {
      await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).for("update").limit(1);
      const [currentStatus] = await tx.select().from(affiliateComplianceStatus)
        .where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).for("update").limit(1);
      if (currentStatus?.stripeConnectedAccountId !== account.id) return;
      const [alreadyProcessed] = await tx.select({ id: affiliateComplianceAuditLog.id })
        .from(affiliateComplianceAuditLog)
        .where(eq(sql`${affiliateComplianceAuditLog.metadata}->>'stripeEventId'`, event.id)).limit(1);
      if (alreadyProcessed) return;
      await tx.update(affiliateComplianceStatus).set({
        stripeAccountType: "express",
        stripeDetailsSubmitted: detailsSubmitted,
        stripePayoutsEnabled: payoutsEnabled,
        stripeChargesEnabled: Boolean(account.charges_enabled),
        stripeRequirementsDue: due,
        stripeOnboardingStatus: complete ? "complete" : "action_required",
        stripeOnboardingCompletedAt: complete ? now : null,
        stripeAccountLastSyncedAt: now,
        updatedAt: now,
      }).where(eq(affiliateComplianceStatus.affiliateId, affiliateId));
      await tx.insert(affiliateComplianceAuditLog).values({
        affiliateId,
        actorType: "stripe_webhook",
        actorId: null,
        eventType: "stripe_account_updated_verified",
        priorValue: { onboardingStatus: currentStatus.stripeOnboardingStatus },
        newValue: { onboardingStatus: complete ? "complete" : "action_required" },
        metadata: { stripeEventId: event.id, detailsSubmitted, payoutsEnabled, requirementsDueCount: due.length },
      });
    });
    // Deliberately do not infer a completed W-9 from account.updated.
    return;
  }
  if (event.type !== "transfer.created" && event.type !== "transfer.reversed") return;
  const eventTransfer = event.data.object as Stripe.Transfer;
  // Retrieve Stripe's current object rather than treating the event's
  // metadata as authority. The event ID must still match that canonical object.
  const stripe = getStripeConnectTestClient();
  const transfer = await stripe.transfers.retrieve(eventTransfer.id);
  if (transfer.id !== eventTransfer.id || transfer.livemode) return;
  const workflowId = transfer.metadata?.affiliatePayoutWorkflowId;
  const metadataAffiliateId = transfer.metadata?.affiliateId;
  if (!workflowId || !metadataAffiliateId) return;
  await db.transaction(async (tx) => {
    // The stored transfer ID is the primary binding. Metadata only confirms
    // the linkage after the row has been located.
    const [payout] = await tx.select().from(affiliatePayoutWorkflow)
      .where(eq(affiliatePayoutWorkflow.stripeTransferId, transfer.id)).for("update").limit(1);
    if (!payout || payout.id !== workflowId || payout.affiliateId !== metadataAffiliateId
        || payout.stripeTransferId !== transfer.id || payout.currency.toLowerCase() !== "usd"
        || transfer.currency.toLowerCase() !== payout.currency.toLowerCase()
        || transfer.amount !== Math.round(Number(payout.netPayoutAmount) * 100)
        || destinationId(transfer.destination) == null) return;
    const [alreadyProcessed] = await tx.select({ id: affiliateComplianceAuditLog.id })
      .from(affiliateComplianceAuditLog)
      .where(eq(sql`${affiliateComplianceAuditLog.metadata}->>'stripeEventId'`, event.id)).limit(1);
    if (alreadyProcessed) return;

    const [status] = await tx.select().from(affiliateComplianceStatus)
      .where(eq(affiliateComplianceStatus.affiliateId, payout.affiliateId)).for("update").limit(1);
    const destination = destinationId(transfer.destination);
    if (!status || status.stripeAccountType !== "express"
        || status.stripeConnectedAccountId !== destination) return;

    const claims = await tx.select().from(affiliatePayoutWorkflowCommissions).where(and(
      eq(affiliatePayoutWorkflowCommissions.payoutWorkflowId, payout.id),
      eq(affiliatePayoutWorkflowCommissions.affiliateId, payout.affiliateId),
    )).for("update");
    if (!claims.length || claims.some((claim) => !["paid", "claimed"].includes(claim.status))) return;
    const ledgerRows = await tx.select({
      id: affiliateCommissions.id,
      affiliateId: affiliateCommissions.affiliateId,
      amount: affiliateCommissions.commissionUsd,
      status: affiliateCommissions.status,
      payoutId: affiliateCommissions.payoutId,
    }).from(affiliateCommissions).where(and(
      eq(affiliateCommissions.affiliateId, payout.affiliateId),
      eq(affiliateCommissions.payoutId, payout.id),
    )).for("update");
    const ledgerById = new Map(ledgerRows.map((row) => [row.id, row]));
    const amountCents = claims.reduce((sum, claim) => sum + Math.round(Number(claim.commissionAmount) * 100), 0);
    const membershipMatches = amountCents === transfer.amount
      && ledgerRows.length === claims.length
      && claims.every((claim) => {
        const row = ledgerById.get(claim.commissionId);
        return row && row.affiliateId === payout.affiliateId && ["paid", "reversed"].includes(row.status)
          && row.payoutId === payout.id
          && Math.round(Number(row.amount) * 100) === Math.round(Number(claim.commissionAmount) * 100);
      });
    if (!membershipMatches) return;

    const target = event.type === "transfer.created" ? "paid"
      : transfer.reversed ? "reversed" : "reversal_review_required";
    const now = new Date();
    if (event.type === "transfer.created") {
      // Payout sending commits the exact claims and verified transfer together.
      // A webhook is an integrity check/replay, never a way to settle new rows.
      if (payout.payoutStatus !== "paid" || !claims.every((claim) => claim.status === "paid")
          || ledgerRows.some((row) => !["paid", "reversed"].includes(row.status))) return;
    } else if (transfer.reversed && transfer.amount_reversed === transfer.amount) {
      if (!["paid", "reversal_review_required"].includes(payout.payoutStatus)
          || !claims.every((claim) => claim.status === "paid")) return;
      await tx.update(affiliatePayoutWorkflow).set({
        payoutStatus: "reversed", updatedAt: now,
      }).where(eq(affiliatePayoutWorkflow.id, payout.id));
      await tx.update(affiliateCommissions).set({ status: "payable", paidAt: null, payoutId: null })
        .where(and(
          eq(affiliateCommissions.affiliateId, payout.affiliateId),
          eq(affiliateCommissions.payoutId, payout.id),
          eq(affiliateCommissions.status, "paid"),
        ));
      await tx.update(affiliatePayoutWorkflowCommissions).set({ status: "reversed", updatedAt: now })
        .where(and(eq(affiliatePayoutWorkflowCommissions.payoutWorkflowId, payout.id), eq(affiliatePayoutWorkflowCommissions.status, "paid")));
    } else {
      // Partial reversals require a human ledger adjustment. Never release the
      // whole claim set for a partial Stripe reversal.
      if (transfer.amount_reversed <= 0 || transfer.amount_reversed >= transfer.amount
          || !["paid", "reversal_review_required"].includes(payout.payoutStatus)) return;
      await tx.update(affiliatePayoutWorkflow).set({
        payoutStatus: "reversal_review_required",
        failureReason: "A partial Stripe transfer reversal requires manual reconciliation.",
        updatedAt: now,
      }).where(eq(affiliatePayoutWorkflow.id, payout.id));
    }
    await tx.insert(affiliateComplianceAuditLog).values({
      affiliateId: payout.affiliateId,
      actorType: "stripe_webhook",
      actorId: null,
      eventType: event.type === "transfer.reversed"
        ? transfer.reversed ? "stripe_transfer_reversed" : "stripe_transfer_partial_reversal"
        : "stripe_transfer_created_verified",
      priorValue: { payoutStatus: payout.payoutStatus },
      newValue: { payoutStatus: target },
      metadata: {
        stripeEventId: event.id, transferId: transfer.id, amount: transfer.amount,
        amountReversed: transfer.amount_reversed, currency: transfer.currency,
        destinationAccountId: destination, commissionClaimCount: claims.length,
      },
    });
  });
}
