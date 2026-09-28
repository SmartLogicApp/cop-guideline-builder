import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  accounts,
  affiliateAgreementAcceptances,
  affiliateAgreements,
  affiliateCommissions,
  affiliateOutOfOrderPaymentReviews,
  affiliateQualifyingReferrals,
  affiliateRateChanges,
  affiliates,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AFFILIATE_AGREEMENT_V4_VERSION } from "./affiliate-agreement-v4.ts";
import { reviewedAffiliateAgreementVersion } from "./affiliate-agreement-state.js";
import { applyPendingAffiliateRateReductions } from "./affiliate-rate-automation.js";
import {
  acceptanceCoversPayment,
  latestQualifyingReferralAt,
  resolveReferralRate,
} from "./affiliate-accrual-rules.js";
import {
  computeCommissionUsd,
  holdbackEndsAt,
  normalizeReferralCode,
  qualifyingRevenueUsdFromInvoice,
  roundUsd,
  type InvoiceRevenueInput,
} from "./affiliate-commission.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TURNING A CUSTOMER PAYMENT INTO A COMMISSION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Called from the Stripe webhook. Everything about it is built around one
 * fact: STRIPE DELIVERS WEBHOOKS MORE THAN ONCE. It retries on its own
 * schedule, and an operator can replay an endpoint by hand. A commission
 * function that assumes one delivery per payment pays the affiliate twice, and
 * nobody finds out until a quarterly payout is wrong.
 *
 * The defence is the unique constraint on affiliate_commissions.stripe_invoice_id,
 * relied on directly rather than through a prior SELECT — two deliveries can
 * race a check-then-insert, and the database is the only thing that can settle
 * that race.
 */

export type AccrualOutcome =
  | { accrued: false; reason: "no-referral-code" | "no-matching-affiliate" | "affiliate-inactive"
        | "zero-rate" | "no-qualifying-revenue" | "already-accrued" | "account-not-found"
        | "agreement-not-accepted" | "out-of-order-payment" }
  | { accrued: true; commissionUsd: number; ratePct: number; affiliateId: string };

export type AccrualInput = {
  /** The account that paid. */
  accountId: string;
  /** Stripe's invoice ID — the idempotency key. */
  stripeInvoiceId: string;
  invoice: InvoiceRevenueInput;
  paidAt: Date;
};

/**
 * Accrue one commission for one paid invoice, or explain why not.
 *
 * Returns a reason rather than throwing when there is nothing to accrue. Most
 * customers have no affiliate, so "no referral code" is the ordinary case, not
 * an error — and a webhook handler that throws on the ordinary case makes
 * Stripe retry a payment that was processed perfectly well.
 */
export async function accrueCommissionForPayment(input: AccrualInput): Promise<AccrualOutcome> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
  if (!account) return { accrued: false, reason: "account-not-found" };

  const code = normalizeReferralCode(account.referralCode);
  if (!code) return { accrued: false, reason: "no-referral-code" };

  const [affiliate] = await db.select({ id: affiliates.id }).from(affiliates)
    .where(eq(affiliates.referralCode, code)).limit(1);
  if (!affiliate) {
    // The customer signed up through a link whose code matches no affiliate.
    // Worth noticing: it means a customer believes they were referred and an
    // affiliate will eventually ask why they were not credited. The attribution
    // report lists these explicitly rather than dropping them.
    return { accrued: false, reason: "no-matching-affiliate" };
  }
  const qualifyingRevenueUsd = qualifyingRevenueUsdFromInvoice(input.invoice);
  if (qualifyingRevenueUsd <= 0) return { accrued: false, reason: "no-qualifying-revenue" };

  try {
    return await db.transaction(async (tx) => {
      // The same affiliate-row lock serializes invoice accrual, first-referral
      // restoration, and the inactivity sweep. The invoice's unique DB key
      // remains the final duplicate-delivery defense.
      const [lockedAffiliate] = await tx.select().from(affiliates)
        .where(eq(affiliates.id, affiliate.id))
        .for("update")
        .limit(1);
      if (!lockedAffiliate || lockedAffiliate.status !== "active") {
        return { accrued: false, reason: "affiliate-inactive" };
      }
      if (!lockedAffiliate.rateEffectiveAt) {
        throw new Error("Affiliate commission accrual is blocked: active affiliate is missing its rate-effective date.");
      }

      const [duplicate] = await tx.select({ id: affiliateCommissions.id })
        .from(affiliateCommissions)
        .where(eq(affiliateCommissions.stripeInvoiceId, input.stripeInvoiceId))
        .limit(1);
      if (duplicate) return { accrued: false, reason: "already-accrued" };

      if (!await hasCurrentV4Acceptance(tx, lockedAffiliate, input.paidAt)) {
        return { accrued: false, reason: "agreement-not-accepted" };
      }

      const [priorReferral] = await tx.select({ id: affiliateQualifyingReferrals.id })
        .from(affiliateQualifyingReferrals)
        .where(and(
          eq(affiliateQualifyingReferrals.affiliateId, lockedAffiliate.id),
          eq(affiliateQualifyingReferrals.accountId, account.id),
        ))
        .limit(1);
      let firstQualifyingReferral = !priorReferral;
      let shouldInsertReferralHistory = firstQualifyingReferral;
      if (firstQualifyingReferral) {
        // Defensive in addition to migration 0007's backfill: if a deployment
        // has old commission rows without matching referral history, preserve
        // the pair as existing before deciding whether this is a first referral.
        const [legacyCommission] = await tx.select({
          id: affiliateCommissions.id,
          stripeInvoiceId: affiliateCommissions.stripeInvoiceId,
          paidAt: affiliateCommissions.accruedAt,
        })
          .from(affiliateCommissions)
          .where(and(
            eq(affiliateCommissions.affiliateId, lockedAffiliate.id),
            eq(affiliateCommissions.accountId, account.id),
          ))
          .limit(1);
        if (legacyCommission) {
          firstQualifyingReferral = false;
          shouldInsertReferralHistory = !legacyCommission.stripeInvoiceId;
          if (legacyCommission.stripeInvoiceId) {
            await tx.insert(affiliateQualifyingReferrals).values({
              affiliateId: lockedAffiliate.id,
              accountId: account.id,
              stripeInvoiceId: legacyCommission.stripeInvoiceId,
              paidAt: legacyCommission.paidAt,
            }).onConflictDoNothing({
              target: [
                affiliateQualifyingReferrals.affiliateId,
                affiliateQualifyingReferrals.accountId,
              ],
            });
          }
        }
      }
      const now = new Date();

      if (shouldInsertReferralHistory) {
        // This is an actual paid qualifying referral even when no commission
        // can be calculated automatically (0% or out-of-order history).
        await tx.insert(affiliateQualifyingReferrals).values({
          affiliateId: lockedAffiliate.id,
          accountId: account.id,
          stripeInvoiceId: input.stripeInvoiceId,
          paidAt: input.paidAt,
        }).onConflictDoNothing({
          target: [
            affiliateQualifyingReferrals.affiliateId,
            affiliateQualifyingReferrals.accountId,
          ],
        });
      }

      // Never price an old invoice using a rate that became effective after
      // its paidAt. We do not have a reliable historical rate timeline for
      // every legacy record, so such invoices remain available for explicit
      // administrative review instead of risking an incorrect commission.
      if (input.paidAt.getTime() < lockedAffiliate.rateEffectiveAt.getTime()) {
        await recordOutOfOrderPaymentReview(tx, input, lockedAffiliate.id, account.id);
        return { accrued: false, reason: "out-of-order-payment" };
      }

      const clock = {
        currentRatePct: lockedAffiliate.commissionRatePct,
        lastQualifyingReferralAt: lockedAffiliate.lastQualifyingReferralAt,
        rateEffectiveAt: lockedAffiliate.rateEffectiveAt,
      };
      let currentRatePct = clock.currentRatePct;
      let rateEffectiveAt = clock.rateEffectiveAt;
      let lastReferralAt = clock.lastQualifyingReferralAt;

      // The sweep may not have run yet. Calculate every reduction effective by
      // the payment date before deciding the invoice's frozen commission rate.
      await applyPendingAffiliateRateReductions(clock, input.paidAt, async (reduction) => {
        await tx.update(affiliates).set({
          commissionRatePct: reduction.toPct,
          rateEffectiveAt: reduction.effectiveAt,
          updatedAt: now,
        }).where(eq(affiliates.id, lockedAffiliate.id));
        await tx.insert(affiliateRateChanges).values({
          affiliateId: lockedAffiliate.id,
          fromPct: reduction.fromPct,
          toPct: reduction.toPct,
          reason: "inactivity",
          note: "Applied while processing a paid referral event.",
          changedBy: "system:invoice-accrual",
          effectiveAt: reduction.effectiveAt,
          createdAt: now,
        });
        currentRatePct = reduction.toPct;
        rateEffectiveAt = reduction.effectiveAt;
      });

      const decision = resolveReferralRate({
        currentRatePct,
        rateEffectiveAt,
        paidAt: input.paidAt,
        firstQualifyingReferral,
      });
      if (decision.kind === "out-of-order-payment") {
        await recordOutOfOrderPaymentReview(tx, input, lockedAffiliate.id, account.id);
        return { accrued: false, reason: "out-of-order-payment" };
      }
      if (decision.kind === "zero-rate") return { accrued: false, reason: "zero-rate" };

      const ratePct = decision.ratePct;
      const commissionUsd = computeCommissionUsd(qualifyingRevenueUsd, ratePct);

      if (decision.restored) {
        await tx.update(affiliates).set({
          commissionRatePct: 20,
          rateEffectiveAt: decision.rateEffectiveAt,
          updatedAt: now,
        }).where(eq(affiliates.id, lockedAffiliate.id));
        await tx.insert(affiliateRateChanges).values({
          affiliateId: lockedAffiliate.id,
          fromPct: currentRatePct,
          toPct: 20,
          reason: "restoration",
          note: "Restored to 20% following a new Qualifying Referral.",
          changedBy: "system:qualifying-referral",
          effectiveAt: decision.rateEffectiveAt,
          createdAt: now,
        });
        currentRatePct = 20;
        rateEffectiveAt = decision.rateEffectiveAt;
      }

      if (firstQualifyingReferral) {
        lastReferralAt = latestQualifyingReferralAt(lastReferralAt, input.paidAt);
        await tx.update(affiliates).set({
          lastQualifyingReferralAt: lastReferralAt,
          updatedAt: now,
        }).where(eq(affiliates.id, lockedAffiliate.id));
      }

      const [created] = await tx.insert(affiliateCommissions).values({
        affiliateId: lockedAffiliate.id,
        accountId: account.id,
        stripeInvoiceId: input.stripeInvoiceId,
        qualifyingRevenueUsd: roundUsd(qualifyingRevenueUsd),
        ratePct,
        commissionUsd,
        status: "pending",
        accruedAt: input.paidAt,
        payableAt: holdbackEndsAt(input.paidAt),
        source: "stripe:invoice.payment_succeeded",
      }).returning();

      // If webhook delivery is late, bring the mutable current rate forward
      // from the newly restarted activity clock. The commission row remains
      // frozen at the rate in effect on its actual payment date.
      await applyPendingAffiliateRateReductions({
        currentRatePct,
        lastQualifyingReferralAt: lastReferralAt,
        rateEffectiveAt,
      }, now, async (reduction) => {
        await tx.update(affiliates).set({
          commissionRatePct: reduction.toPct,
          rateEffectiveAt: reduction.effectiveAt,
          updatedAt: now,
        }).where(eq(affiliates.id, lockedAffiliate.id));
        await tx.insert(affiliateRateChanges).values({
          affiliateId: lockedAffiliate.id,
          fromPct: reduction.fromPct,
          toPct: reduction.toPct,
          reason: "inactivity",
          note: "Applied while processing a paid referral event.",
          changedBy: "system:invoice-accrual",
          effectiveAt: reduction.effectiveAt,
          createdAt: now,
        });
        currentRatePct = reduction.toPct;
        rateEffectiveAt = reduction.effectiveAt;
      });

      return {
        accrued: true,
        commissionUsd: created!.commissionUsd ?? 0,
        ratePct,
        affiliateId: lockedAffiliate.id,
      };
    });
  } catch (error: any) {
    // 23505 = unique_violation on stripe_invoice_id. This is the redelivery
    // path, and it is a SUCCESS: the commission already exists exactly once.
    if (error?.code === "23505") return { accrued: false, reason: "already-accrued" };
    throw error;
  }
}

async function recordOutOfOrderPaymentReview(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: AccrualInput,
  affiliateId: string,
  accountId: string,
): Promise<void> {
  await tx.insert(affiliateOutOfOrderPaymentReviews).values({
    stripeInvoiceId: input.stripeInvoiceId,
    affiliateId,
    accountId,
    paidAt: input.paidAt,
    reason: "payment-predates-rate-effective-date",
  }).onConflictDoNothing({
    target: affiliateOutOfOrderPaymentReviews.stripeInvoiceId,
  });
}

/**
 * New accrual is permitted only after the exact configured reviewed Version
 * 4.0 has been accepted by the active affiliate identity. Missing configuration
 * or a missing/corrupt published row is an operational error, not a fallback
 * to an older version or the development sample.
 */
async function hasCurrentV4Acceptance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  affiliate: typeof affiliates.$inferSelect,
  paidAt: Date,
): Promise<boolean> {
  const configuredVersion = reviewedAffiliateAgreementVersion();
  if (configuredVersion !== AFFILIATE_AGREEMENT_V4_VERSION) {
    throw new Error(
      `Affiliate commission accrual is blocked: configure reviewed agreement version ${AFFILIATE_AGREEMENT_V4_VERSION} before processing payments.`,
    );
  }

  const [agreement] = await tx.select({
    version: affiliateAgreements.version,
    body: affiliateAgreements.body,
    contentSha256: affiliateAgreements.contentSha256,
  }).from(affiliateAgreements)
    .where(eq(affiliateAgreements.version, AFFILIATE_AGREEMENT_V4_VERSION))
    .limit(1);
  if (!agreement) {
    throw new Error(
      `Affiliate commission accrual is blocked: reviewed agreement version ${AFFILIATE_AGREEMENT_V4_VERSION} has not been published.`,
    );
  }

  const computedHash = createHash("sha256").update(agreement.body).digest("hex");
  if (computedHash !== agreement.contentSha256) {
    throw new Error(
      `Affiliate commission accrual is blocked: reviewed agreement version ${AFFILIATE_AGREEMENT_V4_VERSION} failed its integrity check.`,
    );
  }

  const [acceptance] = await tx.select({
    id: affiliateAgreementAcceptances.id,
    acceptedAt: affiliateAgreementAcceptances.acceptedAt,
  })
    .from(affiliateAgreementAcceptances)
    .where(and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliate.id),
      eq(affiliateAgreementAcceptances.agreementVersion, agreement.version),
      eq(affiliateAgreementAcceptances.contentSha256, agreement.contentSha256),
      eq(affiliateAgreementAcceptances.signerEmail, sql`lower(trim(${affiliate.email}))`),
      eq(affiliateAgreementAcceptances.identityEpoch, affiliate.agreementIdentityEpoch),
    ))
    .limit(1);
  return Boolean(acceptance && acceptanceCoversPayment(acceptance.acceptedAt, paidAt));
}

/**
 * §25 — a refund or chargeback cancels the unpaid commission on that payment,
 * and flags an already-paid one for deduction from a future payout.
 *
 * Looks the commission up by its Stripe invoice, so a refund event maps to
 * exactly the accrual it undoes.
 */
export async function reverseCommissionForInvoice(
  stripeInvoiceId: string,
  reason: string,
): Promise<{ reversed: number }> {
  const now = new Date();
  const reversed = await db.update(affiliateCommissions)
    .set({ status: "reversed", reversedAt: now, reversalReason: reason })
    .where(and(
      eq(affiliateCommissions.stripeInvoiceId, stripeInvoiceId),
      // Never re-reverse: a second reversal of a paid commission would deduct
      // the same money from the affiliate's next payout twice.
      isNull(affiliateCommissions.reversedAt),
    ))
    .returning({ id: affiliateCommissions.id });
  return { reversed: reversed.length };
}
