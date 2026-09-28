import { db } from "@workspace/db";
import {
  accounts,
  affiliateCommissions,
  affiliateInvoicePaymentRisks,
  affiliatePaymentRiskEvents,
  affiliates,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { normalizeReferralCode } from "./affiliate-commission.js";
import {
  invoiceRiskDisposition,
  type InvoiceRiskDisposition,
} from "./affiliate-payment-risk-rules.js";

export type StripeRiskEventType =
  | "charge.refunded"
  | "charge.dispute.created"
  | "charge.dispute.updated"
  | "charge.dispute.closed"
  | "charge.dispute.funds_reinstated"
  | "charge.dispute.funds_withdrawn";

export async function resolveInvoiceRiskAttribution(stripeCustomerId: string): Promise<{
  accountId: string;
  affiliateId: string | null;
}> {
  const [account] = await db.select({
    id: accounts.id,
    referralCode: accounts.referralCode,
  }).from(accounts)
    .where(eq(accounts.stripeCustomerId, stripeCustomerId))
    .limit(1);
  if (!account) {
    throw new Error(`Affiliate payment-risk mapping failed: Stripe customer ${stripeCustomerId} has no account.`);
  }

  const code = normalizeReferralCode(account.referralCode ?? "");
  if (!code) return { accountId: account.id, affiliateId: null };
  const [affiliate] = await db.select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.referralCode, code))
    .limit(1);
  if (!affiliate) {
    throw new Error(`Affiliate payment-risk mapping failed: account ${account.id} has an unknown referral code.`);
  }
  return { accountId: account.id, affiliateId: affiliate.id };
}

export async function recordAffiliateInvoiceRisk(input: {
  stripeInvoiceId: string;
  accountId: string;
  affiliateId: string | null;
  stripeChargeId: string;
  stripePaymentIntentId: string | null;
  chargeAmountMinor: number;
  cumulativeRefundedMinor: number;
  stripeEventId: string;
  eventType: StripeRiskEventType;
  eventCreatedAt: Date;
  disputeId: string | null;
  disputeStatus: "none" | "open" | "won" | "lost";
}): Promise<{ duplicate: boolean; disposition: InvoiceRiskDisposition }> {
  if (
    !Number.isSafeInteger(input.chargeAmountMinor) ||
    input.chargeAmountMinor <= 0 ||
    !Number.isSafeInteger(input.cumulativeRefundedMinor) ||
    input.cumulativeRefundedMinor < 0 ||
    input.cumulativeRefundedMinor > input.chargeAmountMinor
  ) {
    throw new Error("Affiliate payment-risk processing failed: invalid charge/refund minor-unit amounts.");
  }

  return db.transaction(async (tx) => {
    // Match payout code's affiliate-first lock order. This serializes risk
    // changes with accrual and payout claim/send transactions for this affiliate.
    const existingCommission = await tx.select({
      affiliateId: affiliateCommissions.affiliateId,
      accountId: affiliateCommissions.accountId,
    }).from(affiliateCommissions)
      .where(eq(affiliateCommissions.stripeInvoiceId, input.stripeInvoiceId))
      .limit(1);
    if (existingCommission[0] && existingCommission[0].accountId !== input.accountId) {
      throw new Error(`Affiliate payment-risk mapping failed: invoice ${input.stripeInvoiceId} maps to a different account than its commission.`);
    }
    const affiliateId = existingCommission[0]?.affiliateId ?? input.affiliateId;
    if (affiliateId) {
      const [lockedAffiliate] = await tx.select({ id: affiliates.id })
        .from(affiliates).where(eq(affiliates.id, affiliateId))
        .for("update").limit(1);
      if (!lockedAffiliate) {
        throw new Error(`Affiliate payment-risk processing failed: affiliate ${affiliateId} no longer exists.`);
      }
    }

    await tx.insert(affiliateInvoicePaymentRisks).values({
      stripeInvoiceId: input.stripeInvoiceId,
      accountId: input.accountId,
      affiliateId,
      stripeChargeId: input.stripeChargeId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      chargeAmountMinor: input.chargeAmountMinor,
      cumulativeRefundedMinor: 0,
      disputeStatus: "none",
    }).onConflictDoNothing();
    const [risk] = await tx.select().from(affiliateInvoicePaymentRisks)
      .where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId))
      .for("update").limit(1);
    if (!risk) throw new Error("Affiliate payment-risk processing failed: invoice risk record could not be persisted.");
    if (risk.accountId !== input.accountId) {
      throw new Error(`Affiliate payment-risk mapping failed: invoice ${input.stripeInvoiceId} is already mapped to a different account.`);
    }

    const [insertedEvent] = await tx.insert(affiliatePaymentRiskEvents).values({
      stripeEventId: input.stripeEventId,
      stripeInvoiceId: input.stripeInvoiceId,
      eventType: input.eventType,
      eventCreatedAt: input.eventCreatedAt,
      chargeAmountMinor: input.chargeAmountMinor,
      cumulativeRefundedMinor: input.cumulativeRefundedMinor,
      disputeId: input.disputeId,
      disputeStatus: input.disputeStatus === "none" ? null : input.disputeStatus,
    }).onConflictDoNothing().returning({ stripeEventId: affiliatePaymentRiskEvents.stripeEventId });
    const duplicate = !insertedEvent;
    if (duplicate) {
      const [priorEvent] = await tx.select({
        stripeInvoiceId: affiliatePaymentRiskEvents.stripeInvoiceId,
      }).from(affiliatePaymentRiskEvents)
        .where(eq(affiliatePaymentRiskEvents.stripeEventId, input.stripeEventId))
        .limit(1);
      if (!priorEvent || priorEvent.stripeInvoiceId !== input.stripeInvoiceId) {
        throw new Error(`Affiliate payment-risk processing failed: Stripe event ${input.stripeEventId} is already mapped to a different invoice.`);
      }
    }

    const sameSecondOlderOpenDispute =
      risk.lastStripeEventCreatedAt?.getTime() === input.eventCreatedAt.getTime() &&
      (risk.disputeStatus === "won" || risk.disputeStatus === "lost") &&
      input.disputeStatus === "open";
    const eventIsStale = (
      risk.lastStripeEventCreatedAt != null &&
      risk.lastStripeEventCreatedAt > input.eventCreatedAt
    ) || sameSecondOlderOpenDispute;
    const disputeStatus = eventIsStale || input.disputeStatus === "none"
      ? risk.disputeStatus
      : input.disputeStatus;
    const nextRefundedMinor = Math.max(
      risk.cumulativeRefundedMinor,
      input.cumulativeRefundedMinor,
    );
    const nextChargeAmountMinor = Math.max(risk.chargeAmountMinor, input.chargeAmountMinor);
    const nextDisputeId = eventIsStale || input.disputeId == null
      ? risk.disputeId
      : input.disputeId;
    const nextRisk = {
      chargeAmountMinor: nextChargeAmountMinor,
      cumulativeRefundedMinor: nextRefundedMinor,
      disputeStatus,
    };
    const disposition = invoiceRiskDisposition(nextRisk);
    await tx.update(affiliateInvoicePaymentRisks).set({
      chargeAmountMinor: nextChargeAmountMinor,
      cumulativeRefundedMinor: nextRefundedMinor,
      disputeId: nextDisputeId,
      disputeStatus,
      lastStripeEventCreatedAt: eventIsStale
        ? risk.lastStripeEventCreatedAt
        : input.eventCreatedAt,
      updatedAt: new Date(),
    }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId));

    const [commission] = await tx.select().from(affiliateCommissions)
      .where(eq(affiliateCommissions.stripeInvoiceId, input.stripeInvoiceId))
      .for("update").limit(1);
    if (!commission) return { duplicate, disposition };

    const now = new Date();
    if (commission.status === "paid") {
      await tx.update(affiliateInvoicePaymentRisks).set({
        manualRecoveryReviewRequired: disposition !== "clear",
        recoveryReviewReason: disposition === "clear"
          ? null
          : `Invoice ${input.stripeInvoiceId} changed to ${disposition}; paid transfer history is preserved for manual review.`,
        updatedAt: now,
      }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId));
      return { duplicate, disposition };
    }

    if (disposition === "full_refund") {
      if (commission.status !== "reversed") {
        await tx.update(affiliateCommissions).set({
          status: "reversed",
          reversedAt: now,
          reversalReason: input.cumulativeRefundedMinor >= input.chargeAmountMinor
            ? "Customer payment fully refunded"
            : "Customer chargeback lost",
        }).where(and(
          eq(affiliateCommissions.id, commission.id),
          isNull(affiliateCommissions.reversedAt),
        ));
      }
    } else if (disposition === "partial_refund_review" || disposition === "dispute_open") {
      if (commission.status === "pending" || commission.status === "payable") {
        await tx.update(affiliateInvoicePaymentRisks).set({
          priorCommissionStatus: commission.status,
          updatedAt: now,
        }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId));
        await tx.update(affiliateCommissions).set({
          status: "risk_held",
        }).where(eq(affiliateCommissions.id, commission.id));
      }
    } else if (commission.status === "risk_held" && risk.priorCommissionStatus) {
      const restoredStatus = risk.priorCommissionStatus === "payable" &&
        commission.payableAt > now
        ? "pending"
        : risk.priorCommissionStatus;
      await tx.update(affiliateCommissions).set({
        status: restoredStatus,
        payoutId: null,
      }).where(eq(affiliateCommissions.id, commission.id));
      await tx.update(affiliateInvoicePaymentRisks).set({
        priorCommissionStatus: null,
        manualRecoveryReviewRequired: false,
        recoveryReviewReason: null,
        updatedAt: now,
      }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId));
    } else if (disposition === "clear" && commission.status === "reversed" && risk.priorCommissionStatus) {
      // A later won dispute can reinstate a commission reversed when Stripe
      // previously reported the dispute lost. Full customer refunds never
      // reach this branch because their cumulative refund remains nonzero.
      const restoredStatus = risk.priorCommissionStatus === "payable" &&
        commission.payableAt > now
        ? "pending"
        : risk.priorCommissionStatus;
      await tx.update(affiliateCommissions).set({
        status: restoredStatus,
        reversedAt: null,
        reversalReason: null,
        payoutId: null,
      }).where(eq(affiliateCommissions.id, commission.id));
      await tx.update(affiliateInvoicePaymentRisks).set({
        priorCommissionStatus: null,
        manualRecoveryReviewRequired: false,
        recoveryReviewReason: null,
        updatedAt: now,
      }).where(eq(affiliateInvoicePaymentRisks.stripeInvoiceId, input.stripeInvoiceId));
    }
    return { duplicate, disposition };
  });
}