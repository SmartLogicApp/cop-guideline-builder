import { db } from "@workspace/db";
import { accounts, affiliates, affiliateCommissions } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
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
        | "zero-rate" | "no-qualifying-revenue" | "already-accrued" | "account-not-found" }
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

  const [affiliate] = await db.select().from(affiliates)
    .where(eq(affiliates.referralCode, code)).limit(1);
  if (!affiliate) {
    // The customer signed up through a link whose code matches no affiliate.
    // Worth noticing: it means a customer believes they were referred and an
    // affiliate will eventually ask why they were not credited. The attribution
    // report lists these explicitly rather than dropping them.
    return { accrued: false, reason: "no-matching-affiliate" };
  }
  if (affiliate.status !== "active") return { accrued: false, reason: "affiliate-inactive" };

  // §13 — at 0% no further commission accrues on future revenue. The row is
  // not written at all, rather than written as zero, so the ledger does not
  // fill with entries that were never worth anything.
  if (affiliate.commissionRatePct <= 0) return { accrued: false, reason: "zero-rate" };

  const qualifyingRevenueUsd = qualifyingRevenueUsdFromInvoice(input.invoice);
  if (qualifyingRevenueUsd <= 0) return { accrued: false, reason: "no-qualifying-revenue" };

  const ratePct = affiliate.commissionRatePct;
  const commissionUsd = computeCommissionUsd(qualifyingRevenueUsd, ratePct);

  try {
    const [created] = await db.insert(affiliateCommissions).values({
      affiliateId: affiliate.id,
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

    await recordQualifyingReferralIfFirst(affiliate.id, account.id, input.paidAt);

    return { accrued: true, commissionUsd: created!.commissionUsd ?? 0, ratePct, affiliateId: affiliate.id };
  } catch (error: any) {
    // 23505 = unique_violation on stripe_invoice_id. This is the redelivery
    // path, and it is a SUCCESS: the commission already exists exactly once.
    if (error?.code === "23505") return { accrued: false, reason: "already-accrued" };
    throw error;
  }
}

/**
 * §10 — move the activity clock, but only for a genuinely NEW qualifying
 * customer.
 *
 * §10 is explicit that "payments received from customers previously referred
 * by Affiliate do not restart, extend, or renew the activity period". So the
 * clock moves on the FIRST qualifying payment from a given account and never
 * again — a customer paying their twelfth monthly invoice must not keep an
 * otherwise inactive affiliate at 20% forever.
 *
 * "First" is decided by counting this account's prior commission rows, which
 * is why this runs after the insert.
 */
async function recordQualifyingReferralIfFirst(
  affiliateId: string,
  accountId: string,
  paidAt: Date,
): Promise<void> {
  const prior = await db.select({ id: affiliateCommissions.id })
    .from(affiliateCommissions)
    .where(and(
      eq(affiliateCommissions.affiliateId, affiliateId),
      eq(affiliateCommissions.accountId, accountId),
    ))
    .limit(2);

  // One row means the insert we just made — this is the account's first
  // qualifying payment, so it is a new Qualifying Customer under §10.
  if (prior.length !== 1) return;

  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!affiliate) return;

  // Only ever move the clock forward. An out-of-order webhook delivering an
  // older invoice must not drag the affiliate's activity date backwards.
  const current = affiliate.lastQualifyingReferralAt;
  if (current && current.getTime() >= paidAt.getTime()) return;

  await db.update(affiliates)
    .set({ lastQualifyingReferralAt: paidAt, updatedAt: new Date() })
    .where(eq(affiliates.id, affiliateId));
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
