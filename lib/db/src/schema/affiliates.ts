import { pgTable, uuid, text, timestamp, boolean, integer, doublePrecision, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AFFILIATE PROGRAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These tables implement the Affiliate Program Agreement. Section numbers in
 * the comments below refer to that document — when the agreement is amended,
 * the amended section is the source of truth and this schema follows it, not
 * the other way round.
 *
 * Two rules shape every table here:
 *
 *  1. THE LEDGER IS APPEND-MOSTLY. A commission is never deleted and its
 *     money fields are never rewritten. A commission that turns out to be
 *     wrong is superseded by a reversing row (§25). This is not fastidiousness
 *     — an affiliate who disputes a payout is entitled to see what was accrued
 *     and what happened to it, and a table that can be edited in place cannot
 *     answer that.
 *
 *  2. THE RATE IS FROZEN AT ACCRUAL. §12 and §13 both say commissions
 *     "properly earned" are not retroactively reduced when the rate drops.
 *     So the rate lives on the commission row, not just on the affiliate, and
 *     nothing recalculates an existing row from the affiliate's current rate.
 *
 * NO BANK DETAILS LIVE HERE. See the payout fields on `affiliates`.
 */

// ─── Affiliates ──────────────────────────────────────────────────────────────

export const affiliates = pgTable("affiliates", {
  id: uuid("id").primaryKey().defaultRandom(),

  /**
   * The code that appears in a signup URL as ?ref=CODE, and the only thing
   * that ties an account to an affiliate.
   *
   * Stored and compared UPPER-CASE. accounts.referral_code is normalised the
   * same way at registration (see routes/accounts.ts), because "CODE" and
   * "code" handed out on two different business cards must not become two
   * different affiliates.
   *
   * Unique, and never reused after termination: reissuing a retired code would
   * silently attribute a new customer to whoever printed the old flyer.
   */
  referralCode: text("referral_code").unique().notNull(),

  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  email:       text("email").notNull(),
  phone:       text("phone"),

  /**
   * Set when the affiliate first signs in to the Affiliate Portal. Null until
   * then — an affiliate is enrolled by the operator and may refer customers
   * before ever logging in, so portal access is a later, separate event.
   */
  clerkUserId: text("clerk_user_id").unique(),

  /**
   * "pending" | "active" | "suspended" | "terminated"
   *
   * Only "active" accrues new commissions. The other three keep the row (and
   * therefore the history) while stopping new accrual, which is what §20
   * describes: termination ends future entitlement without erasing what was
   * already earned.
   */
  status: text("status").default("pending").notNull(),

  /**
   * Current rate for FUTURE accruals, as whole percent: 20, 10 or 0 (§14).
   * Integer, not a float — the schedule has exactly three values and a
   * rounding artefact in a commission rate is a dispute waiting to happen.
   *
   * Existing commission rows are unaffected when this changes (§12, §13).
   */
  commissionRatePct: integer("commission_rate_pct").default(20).notNull(),

  /** When the current rate took effect. Drives the "prospectively only" line in §12/§13. */
  rateEffectiveAt: timestamp("rate_effective_at", { withTimezone: true }).defaultNow(),

  /**
   * The date a new Qualifying Customer's subscription first became
   * attributable to this affiliate (§10).
   *
   * This is the ONLY clock for the activity requirement. §10 is explicit that
   * payments from previously referred customers do not restart it, so nothing
   * in the payment path may write to this column — only a new qualifying
   * referral does.
   */
  lastQualifyingReferralAt: timestamp("last_qualifying_referral_at", { withTimezone: true }),

  enrollmentSignedAt:  timestamp("enrollment_signed_at", { withTimezone: true }),
  enrollmentVersion:   text("enrollment_version"),
  agreementVersion:    text("agreement_version"),

  /**
   * §18 — tax information must be on file before Company can pay. A date, not
   * the form: the W-9 itself contains a TIN and does not belong in this
   * database.
   */
  taxInfoReceivedAt: timestamp("tax_info_received_at", { withTimezone: true }),

  /**
   * How the affiliate is paid, and a HUMAN LABEL for the destination —
   * "ACH — Chase ending 4412", "PayPal — a…@example.com", "Check by mail".
   *
   * DELIBERATELY NOT AN ACCOUNT NUMBER. Full bank or card numbers are never
   * stored in this application. The operator keeps payment credentials in
   * whatever system actually moves the money; this column exists only so the
   * payout screen can say which destination was used without anyone having to
   * open that system to find out.
   */
  payoutMethod:    text("payout_method"),
  payoutReference: text("payout_reference"),

  /** §17 — the affiliate's own subscription fee is waived while participating. */
  subscriptionFeeWaived: boolean("subscription_fee_waived").default(false).notNull(),

  /** Operator-only. Never returned by the affiliate portal. */
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("affiliates_status_idx").on(table.status),
  index("affiliates_email_idx").on(table.email),
]);

// ─── Commission ledger ───────────────────────────────────────────────────────

export const affiliateCommissions = pgTable("affiliate_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),

  affiliateId: uuid("affiliate_id").references(() => affiliates.id, { onDelete: "restrict" }).notNull(),

  /**
   * onDelete: "restrict" on both foreign keys, unlike the cascades elsewhere
   * in this schema.
   *
   * A commission row is a financial record. If deleting an account could take
   * its commission history with it, the affiliate's payout history would
   * silently change when an unrelated customer record was cleaned up. Deleting
   * an account that has accrued commissions must be a deliberate act that
   * fails loudly, not a cascade nobody sees.
   */
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "restrict" }).notNull(),

  /**
   * The Stripe invoice this commission was accrued from.
   *
   * UNIQUE, and that uniqueness is the whole duplicate-payment defence.
   * Stripe redelivers webhooks — on its own retry schedule, and again whenever
   * an endpoint is replayed by hand. Without a unique key on the source event,
   * a redelivery pays the affiliate twice and nobody notices until a quarterly
   * payout is wrong. The insert relies on this constraint rather than on a
   * prior SELECT, because two webhook deliveries can race a check-then-insert.
   */
  stripeInvoiceId: text("stripe_invoice_id").unique(),

  /**
   * §7.1 — subscription amounts actually received and retained, excluding tax,
   * refunds, credits, chargebacks, professional services, implementation and
   * consulting fees, and amounts never actually received.
   *
   * Payment-processor fees are NOT deducted (§7.1, final line): the affiliate
   * is paid on the customer's subscription payment, not on what survives
   * Stripe's cut.
   */
  qualifyingRevenueUsd: doublePrecision("qualifying_revenue_usd").notNull().default(0),

  /** The rate in effect WHEN THIS ROW ACCRUED. Frozen. See the header comment. */
  ratePct: integer("rate_pct").notNull(),

  commissionUsd: doublePrecision("commission_usd").notNull().default(0),

  /**
   * "pending"   — accrued, inside the §24 holdback
   * "payable"   — holdback elapsed, awaiting a quarterly payout (§8)
   * "paid"      — included in a completed payout
   * "reversed"  — the underlying payment was refunded or charged back (§25)
   * "cancelled" — accrued in error, or the referral was rejected under §5
   */
  status: text("status").default("pending").notNull(),

  /** When the underlying customer payment became eligible for accrual. */
  accruedAt: timestamp("accrued_at", { withTimezone: true }).defaultNow().notNull(),

  /**
   * §24 — accruedAt + 60 days. Stored rather than computed on read so that a
   * later change to the holdback period cannot silently move the payable date
   * of money that already accrued under the old terms.
   */
  payableAt: timestamp("payable_at", { withTimezone: true }).notNull(),

  payoutId: uuid("payout_id"),
  paidAt:   timestamp("paid_at", { withTimezone: true }),

  reversedAt:     timestamp("reversed_at", { withTimezone: true }),
  reversalReason: text("reversal_reason"),

  /** Free-text provenance, e.g. "stripe:invoice.payment_succeeded" or "manual:adjustment". */
  source: text("source"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("affiliate_commissions_affiliate_idx").on(table.affiliateId),
  index("affiliate_commissions_account_idx").on(table.accountId),
  index("affiliate_commissions_status_idx").on(table.status),
  index("affiliate_commissions_accrued_at_idx").on(table.accruedAt),
  index("affiliate_commissions_payable_at_idx").on(table.payableAt),
]);

// ─── Quarterly payouts (§8) ──────────────────────────────────────────────────

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").references(() => affiliates.id, { onDelete: "restrict" }).notNull(),

  /** "2026-Q1". The quarter whose payable commissions this batch settles. */
  periodLabel: text("period_label").notNull(),

  /** Sum of the commissions included. */
  grossUsd: doublePrecision("gross_usd").notNull().default(0),

  /**
   * §25/§26 — reversals of previously PAID commissions, and any negative
   * balance carried in from an earlier quarter. Negative or zero.
   */
  adjustmentsUsd: doublePrecision("adjustments_usd").notNull().default(0),

  /**
   * grossUsd + adjustmentsUsd. May be below the $100 minimum in §8, or
   * negative; the payout row still exists in that case with status "carried",
   * because "we owed you $60 and held it" is a fact the affiliate is entitled
   * to see rather than a quarter that simply appears blank.
   */
  netUsd: doublePrecision("net_usd").notNull().default(0),

  /**
   * "draft"    — assembled, not yet approved by the operator
   * "carried"  — below the §8 $100 minimum; rolls into the next quarter
   * "approved" — cleared for payment
   * "paid"     — money sent
   */
  status: text("status").default("draft").notNull(),

  paidAt:    timestamp("paid_at", { withTimezone: true }),
  /** Operator's own reference — check number, ACH batch ID. Not an account number. */
  reference: text("reference"),
  notes:     text("notes"),

  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("affiliate_payouts_affiliate_idx").on(table.affiliateId),
  index("affiliate_payouts_period_idx").on(table.periodLabel),
]);

// ─── Rate-change audit (§12–§15) ─────────────────────────────────────────────

/**
 * Every movement along the 20% → 10% → 0% schedule, and every restoration.
 *
 * The affiliates table holds only the CURRENT rate. §12 and §13 turn on when a
 * reduction took effect, and §15 allows restoration, so "what was this
 * affiliate's rate on the day that invoice was paid?" has to be answerable
 * years later. A single mutable column cannot answer it; this table can.
 */
export const affiliateRateChanges = pgTable("affiliate_rate_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }).notNull(),
  fromPct: integer("from_pct").notNull(),
  toPct:   integer("to_pct").notNull(),
  /** "inactivity" | "restoration" | "manual" | "enrollment" */
  reason:  text("reason").notNull(),
  note:    text("note"),
  /** Who or what made the change: a Clerk user ID, or "system:inactivity-sweep". */
  changedBy:   text("changed_by"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("affiliate_rate_changes_affiliate_idx").on(table.affiliateId),
]);

export type Affiliate            = typeof affiliates.$inferSelect;
export type AffiliateCommission  = typeof affiliateCommissions.$inferSelect;
export type AffiliatePayout      = typeof affiliatePayouts.$inferSelect;
export type AffiliateRateChange  = typeof affiliateRateChanges.$inferSelect;
