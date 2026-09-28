import {
  db, affiliates, affiliateComplianceStatus, affiliatePayoutWorkflow,
  affiliateCommissions, affiliateComplianceAuditLog, affiliatePayoutWorkflowCommissions,
  affiliateInvoicePaymentRisks,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getStripeConnectClient, getStripeConnectLivemode } from "../stripeClient.js";
import { verifyExpressRecipient } from "./affiliate-connect-account.js";
import { affiliateConnectChecklistStatus } from "./affiliate-connect-checklist-status.js";
import { commissionStatusAfterTransferReversal } from "./affiliate-compliance-rules.js";
import {
  invoiceRiskDisposition,
} from "./affiliate-payment-risk-rules.js";

function destinationId(destination: Stripe.Transfer["destination"]): string | null {
  return typeof destination === "string" ? destination : destination?.id ?? null;
}

export async function processAffiliateConnectWebhook(event: Stripe.Event): Promise<void> {
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const affiliateId = account.metadata?.affiliateId;
    if (!affiliateId || event.livemode !== getStripeConnectLivemode()) return;
    const [linkedStatus] = await db.select({
      affiliateId: affiliateComplianceStatus.affiliateId,
      stripeConnectedAccountId: affiliateComplianceStatus.stripeConnectedAccountId,
    }).from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.stripeConnectedAccountId, account.id)).limit(1);
    // Stripe metadata is only a consistency check. It can never bind or rebind
    // an account; the previously persisted account ID is authoritative.
    if (!linkedStatus || linkedStatus.affiliateId !== affiliateId
        || linkedStatus.stripeConnectedAccountId !== account.id) return;
    const stripe = getStripeConnectClient();
    const verifiedAccount = await verifyExpressRecipient(stripe, account, getStripeConnectLivemode());
    if (!verifiedAccount.valid) return;
    const stripeStatus = affiliateConnectChecklistStatus(account, verifiedAccount.transferCapabilityActive);
    const { requirementsDue: due, detailsSubmitted, payoutsEnabled, taxStatus } = stripeStatus;
    const now = new Date();
    const complete = stripeStatus.onboardingComplete;
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
        stripeChargesEnabled: stripeStatus.chargesEnabled,
        stripeRequirementsDue: due,
        stripeOnboardingStatus: complete ? "complete" : "action_required",
        stripeOnboardingCompletedAt: complete ? now : null,
        stripeAccountLastSyncedAt: now,
        taxStatus: currentStatus?.country === "US" && currentStatus.state ? taxStatus : currentStatus?.taxStatus,
        stripeTaxFormLastCheckedAt: now,
        updatedAt: now,
      }).where(eq(affiliateComplianceStatus.affiliateId, affiliateId));
      await tx.insert(affiliateComplianceAuditLog).values({
        affiliateId,
        actorType: "stripe_webhook",
        actorId: null,
        eventType: "stripe_account_updated_verified",
        priorValue: { onboardingStatus: currentStatus.stripeOnboardingStatus },
        newValue: { onboardingStatus: complete ? "complete" : "action_required", taxStatus },
        metadata: { stripeEventId: event.id, detailsSubmitted, payoutsEnabled, requirementsDueCount: due.length },
      });
    });
    // This records Stripe's tax-ID provided/requirements flags, not a signed W-9.
    return;
  }
  if (event.type !== "transfer.created" && event.type !== "transfer.reversed") return;
  if (event.livemode !== getStripeConnectLivemode()) return;
  const eventTransfer = event.data.object as Stripe.Transfer;
  // Retrieve Stripe's current object rather than treating the event's
  // metadata as authority. The event ID must still match that canonical object.
  const stripe = getStripeConnectClient();
  const transfer = await stripe.transfers.retrieve(eventTransfer.id);
  if (transfer.id !== eventTransfer.id || transfer.livemode !== getStripeConnectLivemode()) return;
  const workflowId = transfer.metadata?.affiliatePayoutWorkflowId;
  const metadataAffiliateId = transfer.metadata?.affiliateId;
  if (!workflowId || !metadataAffiliateId) return;
  await db.transaction(async (tx) => {
    // Match the affiliate-first lock order used by accrual and invoice-risk
    // updates so a refund cannot race this reversal into releasing a claim.
    const [payoutReference] = await tx.select({
      id: affiliatePayoutWorkflow.id,
      affiliateId: affiliatePayoutWorkflow.affiliateId,
    }).from(affiliatePayoutWorkflow)
      .where(eq(affiliatePayoutWorkflow.stripeTransferId, transfer.id)).limit(1);
    if (!payoutReference || payoutReference.id !== workflowId
        || payoutReference.affiliateId !== metadataAffiliateId) return;
    await tx.select({ id: affiliates.id }).from(affiliates)
      .where(eq(affiliates.id, payoutReference.affiliateId)).for("update").limit(1);
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
      stripeInvoiceId: affiliateCommissions.stripeInvoiceId,
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
      const invoiceIds = ledgerRows.flatMap((row) => row.stripeInvoiceId ? [row.stripeInvoiceId] : []);
      const risks = invoiceIds.length ? await tx.select().from(affiliateInvoicePaymentRisks)
        .where(inArray(affiliateInvoicePaymentRisks.stripeInvoiceId, invoiceIds))
        .for("update") : [];
      const riskByInvoiceId = new Map(risks.map((risk) => [risk.stripeInvoiceId, risk]));
      await tx.update(affiliatePayoutWorkflow).set({
        payoutStatus: "reversed", updatedAt: now,
      }).where(eq(affiliatePayoutWorkflow.id, payout.id));
      for (const row of ledgerRows) {
        if (row.status !== "paid") continue;
        const risk = row.stripeInvoiceId ? riskByInvoiceId.get(row.stripeInvoiceId) : undefined;
        const disposition = risk ? invoiceRiskDisposition(risk) : "clear";
        const nextStatus = commissionStatusAfterTransferReversal(disposition);
        await tx.update(affiliateCommissions).set({
          status: nextStatus,
          // Preserve the paid timestamp and old payout-claim row as history.
          // Clear only the ledger pointer if the commission is safe to claim
          // through a new, separately reviewed payout.
          ...(nextStatus === "payable" ? { payoutId: null } : {}),
        }).where(and(
          eq(affiliateCommissions.id, row.id),
          eq(affiliateCommissions.affiliateId, payout.affiliateId),
          eq(affiliateCommissions.payoutId, payout.id),
          eq(affiliateCommissions.status, "paid"),
        ));
        if (risk && (nextStatus === "risk_held"
            || (nextStatus === "reversed" && risk.disputeStatus === "lost"
              && risk.cumulativeRefundedMinor < risk.chargeAmountMinor))) {
          await tx.update(affiliateInvoicePaymentRisks).set({
            priorCommissionStatus: "payable",
            updatedAt: now,
          }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, risk.stripeInvoiceId));
        }
      }
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
