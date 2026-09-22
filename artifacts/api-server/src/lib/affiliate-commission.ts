/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AFFILIATE COMMISSION MATH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every rule in the Affiliate Program Agreement that produces a NUMBER lives
 * in this file, and nothing here touches the database, Stripe, Express or the
 * clock. That is deliberate: this is the code that decides what a person is
 * owed, so it has to be readable by someone holding the agreement next to it,
 * and testable without standing up an environment.
 *
 * `now` is always a parameter, never `new Date()` inside a function. A rate
 * reduction that depends on today's date is untestable if the function reads
 * the clock itself.
 *
 * Section numbers refer to the Affiliate Program Agreement.
 */

/** §14 — the schedule has exactly three rungs. Nothing else is a valid rate. */
export const COMMISSION_RATE_LADDER = [20, 10, 0] as const;
export type CommissionRatePct = (typeof COMMISSION_RATE_LADDER)[number];

/** §11, §13 — twelve-month activity period, then a 60-day grace period. */
export const ACTIVITY_PERIOD_MONTHS = 12;
export const GRACE_PERIOD_DAYS = 60;

/** §24 — a commission is pending for 60 days after it accrues. */
export const HOLDBACK_DAYS = 60;

/** §8 — quarterly payouts, $100 minimum, remainder carries forward. */
export const MINIMUM_PAYOUT_USD = 100;

/** §27 — attribution survives a payment interruption for twelve months. */
export const ATTRIBUTION_LAPSE_MONTHS = 12;

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * Round to cents, half away from zero.
 *
 * Commission amounts are money someone will be paid, so they are rounded once,
 * here, to the precision that can actually be transferred. Carrying six
 * decimals into a payout total means the sum of the rows does not equal the
 * cheque.
 *
 * `Math.round` alone rounds -0.005 to -0.00 rather than -0.01, which matters
 * once reversals make negative amounts possible (§25).
 */
export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100)) / 100;
}

/**
 * §7 — commission = qualifying subscription revenue × rate.
 *
 * Negative revenue is clamped to zero rather than producing a negative
 * commission. A refund does not accrue a negative commission; it REVERSES the
 * original row (§25), which is a different operation with a different audit
 * trail. Letting a negative flow through here would create a second,
 * unexplained path to the same money.
 */
export function computeCommissionUsd(qualifyingRevenueUsd: number, ratePct: number): number {
  if (!Number.isFinite(qualifyingRevenueUsd) || qualifyingRevenueUsd <= 0) return 0;
  if (!Number.isFinite(ratePct) || ratePct <= 0) return 0;
  return roundUsd((qualifyingRevenueUsd * ratePct) / 100);
}

// ─── §7.1 Qualifying subscription revenue ────────────────────────────────────

/**
 * The subset of a Stripe invoice that a commission may be calculated on.
 *
 * Only the fields §7.1 actually needs. Typed structurally rather than as
 * Stripe.Invoice so the rule can be tested with a plain object and so a Stripe
 * API version bump cannot quietly change what "revenue" means.
 *
 * All amounts are in the smallest currency unit, as Stripe sends them.
 */
export type InvoiceRevenueInput = {
  /** What the customer actually paid. Zero for an unpaid or void invoice. */
  amountPaid: number;
  /** Sales/use tax collected. Excluded by §7.1. */
  tax?: number | null;
  /** Invoice total, used to apportion tax when only part of the invoice was paid. */
  total?: number | null;
  currency?: string | null;
  /**
   * Line amounts that are NOT subscription revenue — professional services,
   * implementation, consulting (§7.1). The caller identifies these; this
   * function does not guess from descriptions.
   */
  nonSubscriptionAmount?: number | null;
};

/**
 * §7.1 — qualifying subscription revenue, in dollars.
 *
 * Starts from what was ACTUALLY PAID, not what was invoiced: §7.1 says
 * "actually received and retained", so an invoice that was issued but not paid
 * contributes nothing, and a partial payment contributes only its part.
 *
 * Tax is apportioned rather than subtracted whole. On a partly paid invoice,
 * subtracting the full tax would understate the base — and on an invoice paid
 * in full the apportionment is exactly the full tax, so the simple case is
 * unaffected.
 *
 * Processor fees never appear here, by the final line of §7.1: the affiliate
 * is paid on the customer's payment, not on what survives Stripe's cut.
 */
export function qualifyingRevenueUsdFromInvoice(invoice: InvoiceRevenueInput): number {
  const paid = Number(invoice.amountPaid) || 0;
  if (paid <= 0) return 0;

  const total = Number(invoice.total) || 0;
  const tax = Number(invoice.tax) || 0;
  const nonSubscription = Number(invoice.nonSubscriptionAmount) || 0;

  // Apportion by how much of the invoice was actually paid.
  const paidFraction = total > 0 ? Math.min(paid / total, 1) : 1;

  const excluded = (tax + nonSubscription) * paidFraction;
  const qualifyingMinorUnits = paid - excluded;
  if (qualifyingMinorUnits <= 0) return 0;

  return roundUsd(qualifyingMinorUnits / 100);
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Add whole months, clamping to the end of the target month.
 *
 * Without the clamp, JavaScript rolls a 31st into the following month, so an
 * affiliate whose anniversary is 31 August would have their twelve-month
 * activity period silently end on 1 September — a day early, in the company's
 * favour. Clamping to 30 September is the reading that does not quietly take a
 * day from the affiliate.
 */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const targetDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, daysInTargetMonth));
  return next;
}

/** §24 — when a commission accrued on `accruedAt` becomes payable. */
export function holdbackEndsAt(accruedAt: Date): Date {
  return addDays(accruedAt, HOLDBACK_DAYS);
}

// ─── §10–§15 Activity requirement and the rate ladder ────────────────────────

export type ActivityClockInput = {
  /** The affiliate's current rate: 20, 10 or 0. */
  currentRatePct: number;
  /**
   * §10 — the date a new Qualifying Customer's subscription first became
   * attributable to this affiliate. Null if they have never referred one.
   */
  lastQualifyingReferralAt: Date | null;
  /**
   * §12 — "a new twelve-month activity period begins" when the rate is
   * reduced. Also the enrollment date for an affiliate who has never referred.
   */
  rateEffectiveAt: Date;
};

/**
 * The date the current activity period is measured from (§10, §12).
 *
 * The later of the last qualifying referral and the current rate's effective
 * date. Both restart the clock, and whichever happened most recently is the
 * one in force.
 */
export function activityAnchor(input: ActivityClockInput): Date {
  const { lastQualifyingReferralAt, rateEffectiveAt } = input;
  if (!lastQualifyingReferralAt) return rateEffectiveAt;
  return lastQualifyingReferralAt.getTime() > rateEffectiveAt.getTime()
    ? lastQualifyingReferralAt
    : rateEffectiveAt;
}

export type ActivityWindow = {
  anchorAt: Date;
  /** §11 — end of the twelve-month activity period. */
  activityPeriodEndsAt: Date;
  /** §11 — end of the 60-day grace period that follows it. */
  graceEndsAt: Date;
};

export function activityWindow(input: ActivityClockInput): ActivityWindow {
  const anchorAt = activityAnchor(input);
  const activityPeriodEndsAt = addMonths(anchorAt, ACTIVITY_PERIOD_MONTHS);
  return {
    anchorAt,
    activityPeriodEndsAt,
    graceEndsAt: addDays(activityPeriodEndsAt, GRACE_PERIOD_DAYS),
  };
}

/** The next rung down the §14 ladder. 20 → 10 → 0, and 0 stays 0. */
export function nextRateDown(ratePct: number): number {
  const index = COMMISSION_RATE_LADDER.indexOf(ratePct as CommissionRatePct);
  if (index < 0) return 0;
  return COMMISSION_RATE_LADDER[Math.min(index + 1, COMMISSION_RATE_LADDER.length - 1)]!;
}

export type PendingRateReduction = {
  fromPct: number;
  toPct: number;
  /** The date the reduction took effect — NOT the date the sweep noticed. */
  effectiveAt: Date;
};

/**
 * The rate reductions that have become due as of `now`, in order (§12, §13).
 *
 * Returns a LIST, not a single new rate, and each entry carries its own
 * effective date. Two things force that:
 *
 *  - §12 says a fresh twelve-month period begins when the rate is reduced, so
 *    a second reduction is measured from the first one's effective date, not
 *    from today. An affiliate inactive for thirty months has had two distinct
 *    reductions on two distinct dates, and collapsing them to "you are at 0%
 *    now" loses the middle one.
 *  - §12 and §13 both protect commissions earned BEFORE a reduction's
 *    effective date. Anything accrued between the two dates was earned at 10%
 *    and must stay at 10%. That is only reconstructible if each step keeps its
 *    own date.
 *
 * So a sweep that runs late produces exactly the same history as one that ran
 * on time. The ledger must not depend on when a scheduled job happened to fire.
 */
export function pendingRateReductions(input: ActivityClockInput, now: Date): PendingRateReduction[] {
  const reductions: PendingRateReduction[] = [];

  let ratePct = input.currentRatePct;
  let rateEffectiveAt = input.rateEffectiveAt;
  const { lastQualifyingReferralAt } = input;

  // Bounded so a bad date can never spin: the ladder has three rungs, so at
  // most two reductions are ever possible.
  for (let step = 0; step < COMMISSION_RATE_LADDER.length; step += 1) {
    if (ratePct <= 0) break;

    const window = activityWindow({ currentRatePct: ratePct, lastQualifyingReferralAt, rateEffectiveAt });
    if (now.getTime() <= window.graceEndsAt.getTime()) break;

    const toPct = nextRateDown(ratePct);
    if (toPct === ratePct) break;

    // §12: the reduction takes effect when the grace period ended.
    const effectiveAt = window.graceEndsAt;
    reductions.push({ fromPct: ratePct, toPct, effectiveAt });

    ratePct = toPct;
    rateEffectiveAt = effectiveAt;
  }

  return reductions;
}

/**
 * What the rate WILL be once due reductions are applied. A convenience over
 * `pendingRateReductions`; the list is what gets written to the audit table.
 */
export function effectiveRatePct(input: ActivityClockInput, now: Date): number {
  const reductions = pendingRateReductions(input, now);
  return reductions.length > 0 ? reductions[reductions.length - 1]!.toPct : input.currentRatePct;
}

export type ActivityStatus = "active" | "in-grace" | "lapsed" | "zero-rate";

/** How to describe the affiliate's standing on screen, without changing anything. */
export function activityStatus(input: ActivityClockInput, now: Date): ActivityStatus {
  if (input.currentRatePct <= 0) return "zero-rate";
  const window = activityWindow(input);
  if (now.getTime() <= window.activityPeriodEndsAt.getTime()) return "active";
  if (now.getTime() <= window.graceEndsAt.getTime()) return "in-grace";
  return "lapsed";
}

// ─── §27 Attribution lapse ───────────────────────────────────────────────────

/**
 * §27 — attribution survives a payment interruption for twelve months from the
 * customer's last payment; after that it expires unless §28 reactivation
 * applies.
 *
 * Note what this does NOT do: it never touches the activity clock. §27 is
 * explicit that a customer's payment interruption does not reset the
 * affiliate's activity requirement under §10/§11, and §10 is explicit that
 * payments from existing customers do not extend it either. The two clocks are
 * deliberately independent, and wiring one to the other would be the easiest
 * way to get this wrong.
 */
export function attributionHasLapsed(lastCustomerPaymentAt: Date | null, now: Date): boolean {
  if (!lastCustomerPaymentAt) return false;
  return now.getTime() > addMonths(lastCustomerPaymentAt, ATTRIBUTION_LAPSE_MONTHS).getTime();
}

// ─── §8 Quarters and payout assembly ─────────────────────────────────────────

export function quarterOf(date: Date): string {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/** Bounds of a "YYYY-Qn" label. `end` is exclusive, matching the month helpers. */
export function quarterBounds(label: string): { start: Date; end: Date; label: string } | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(label.trim().toUpperCase());
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 1);
  return { start, end, label: `${year}-Q${quarter}` };
}

export type PayoutLine = { commissionUsd: number };

export type PayoutAssembly = {
  grossUsd: number;
  adjustmentsUsd: number;
  netUsd: number;
  /** §8 — below the minimum, the balance carries to the next quarter. */
  meetsMinimum: boolean;
  status: "carried" | "draft";
};

/**
 * §8 + §25/§26 — assemble one quarter's payout.
 *
 * `carriedBalanceUsd` is last quarter's net when it was withheld under the
 * $100 minimum, or a negative balance left by reversals (§26). It is added,
 * not compared: a carried NEGATIVE balance must reduce this quarter, and a
 * carried positive one must count toward clearing the minimum — otherwise a
 * run of $60 quarters would never pay out at all.
 */
export function assemblePayout(
  lines: PayoutLine[],
  reversalsUsd = 0,
  carriedBalanceUsd = 0,
): PayoutAssembly {
  const grossUsd = roundUsd(lines.reduce((sum, line) => sum + (Number(line.commissionUsd) || 0), 0));
  // Reversals arrive as positive magnitudes and are recorded as a negative
  // adjustment, so the sign convention on the stored row is unambiguous.
  const adjustmentsUsd = roundUsd(carriedBalanceUsd - Math.abs(Number(reversalsUsd) || 0));
  const netUsd = roundUsd(grossUsd + adjustmentsUsd);
  const meetsMinimum = netUsd >= MINIMUM_PAYOUT_USD;
  return {
    grossUsd,
    adjustmentsUsd,
    netUsd,
    meetsMinimum,
    status: meetsMinimum ? "draft" : "carried",
  };
}

// ─── Referral codes ──────────────────────────────────────────────────────────

/**
 * The single normalisation rule for referral codes.
 *
 * Used at registration (capturing ?ref=), at lookup (matching an account to an
 * affiliate) and at creation (storing the code). One function, because a code
 * normalised two different ways is a customer attributed to nobody — and that
 * failure is invisible until an affiliate asks where their commission went.
 */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

/** Codes appear on printed material, so the alphabet excludes nothing a human types badly. */
export function isValidReferralCode(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,63}$/.test(value);
}
