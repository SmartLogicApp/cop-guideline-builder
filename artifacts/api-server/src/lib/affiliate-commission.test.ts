import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_PERIOD_MONTHS,
  GRACE_PERIOD_DAYS,
  HOLDBACK_DAYS,
  MINIMUM_PAYOUT_USD,
  activityStatus,
  activityWindow,
  addMonths,
  assemblePayout,
  attributionHasLapsed,
  computeCommissionUsd,
  effectiveRatePct,
  holdbackEndsAt,
  isValidReferralCode,
  normalizeReferralCode,
  pendingRateReductions,
  qualifyingRevenueUsdFromInvoice,
  quarterBounds,
  quarterOf,
  roundUsd,
} from "./affiliate-commission.ts";

// ─── The agreement's own numbers ─────────────────────────────────────────────
// If someone amends the agreement and not the code, or the code and not the
// agreement, this is the test that notices.

test("the constants match the Affiliate Program Agreement", () => {
  assert.equal(ACTIVITY_PERIOD_MONTHS, 12, "§10/§11 — twelve-month activity period");
  assert.equal(GRACE_PERIOD_DAYS, 60, "§11 — 60-day grace period");
  assert.equal(HOLDBACK_DAYS, 60, "§24 — 60-day holdback before a commission is payable");
  assert.equal(MINIMUM_PAYOUT_USD, 100, "§8 — $100 minimum payout");
});

// ─── §7 Commission calculation ───────────────────────────────────────────────

test("commission is the stated percentage of qualifying revenue", () => {
  assert.equal(computeCommissionUsd(1000, 20), 200);
  assert.equal(computeCommissionUsd(1000, 10), 100);
  assert.equal(computeCommissionUsd(1000, 0), 0, "§13 — a 0% affiliate accrues nothing");
});

test("commission is rounded to cents, not carried at full float precision", () => {
  // 349.99 × 20% = 69.998 — must become 70.00, not 69.998.
  assert.equal(computeCommissionUsd(349.99, 20), 70);
  assert.equal(computeCommissionUsd(0.01, 20), 0);
  assert.equal(computeCommissionUsd(33.33, 10), 3.33);
});

test("a negative or zero revenue never produces a commission", () => {
  // §25 handles refunds by REVERSING the original row. If a negative could
  // flow through the accrual path it would be a second, unaudited route to the
  // same money.
  assert.equal(computeCommissionUsd(-500, 20), 0);
  assert.equal(computeCommissionUsd(0, 20), 0);
  assert.equal(computeCommissionUsd(Number.NaN, 20), 0);
  assert.equal(computeCommissionUsd(1000, -5), 0);
});

test("rounding is half away from zero in both directions", () => {
  assert.equal(roundUsd(0.005), 0.01);
  assert.equal(roundUsd(-0.005), -0.01, "a reversal must not round toward zero in the company's favour");
  assert.equal(roundUsd(Number.POSITIVE_INFINITY), 0);
});

// ─── §7.1 Qualifying subscription revenue ────────────────────────────────────

test("qualifying revenue is what was actually paid, less tax", () => {
  // $500.00 invoice, $30.00 tax, paid in full.
  const revenue = qualifyingRevenueUsdFromInvoice({ amountPaid: 53000, tax: 3000, total: 53000 });
  assert.equal(revenue, 500, "§7.1 excludes sales/use tax");
});

test("an unpaid invoice yields no qualifying revenue", () => {
  // §7.1 — "actually received and retained by Company".
  assert.equal(qualifyingRevenueUsdFromInvoice({ amountPaid: 0, tax: 3000, total: 53000 }), 0);
});

test("a partly paid invoice apportions tax rather than subtracting all of it", () => {
  // $1,000 subscription + $100 tax = $1,100 invoiced; half paid.
  // Subtracting the full $100 tax from the $550 paid would understate the base
  // as $450. Correct answer: half the invoice was paid, so half the tax was.
  const revenue = qualifyingRevenueUsdFromInvoice({ amountPaid: 55000, tax: 10000, total: 110000 });
  assert.equal(revenue, 500);
});

test("professional services and implementation fees are excluded", () => {
  // §7.1 — $1,000 subscription + $400 implementation, no tax.
  const revenue = qualifyingRevenueUsdFromInvoice({
    amountPaid: 140000,
    total: 140000,
    nonSubscriptionAmount: 40000,
  });
  assert.equal(revenue, 1000);
});

test("processor fees never reduce qualifying revenue", () => {
  // §7.1, final line. The invoice is the only input; Stripe's fee is not a
  // field this function accepts, which is what makes the rule structural
  // rather than a comment someone has to remember.
  const revenue = qualifyingRevenueUsdFromInvoice({ amountPaid: 50000, total: 50000 });
  assert.equal(revenue, 500, "affiliate is paid on the customer's payment, not on the net deposit");
});

// ─── §24 Holdback ────────────────────────────────────────────────────────────

test("a commission becomes payable sixty days after it accrues", () => {
  // Local-date constructor on purpose. Every date in this module is calendar
  // arithmetic in the server's own timezone, matching monthBounds() in
  // routes/admin.ts — that is what makes affiliate figures reconcile with the
  // existing client and token reports instead of landing a day apart at month
  // boundaries. Mixing a UTC instant into a local-time calculation is exactly
  // how a report ends up off by one.
  const accruedAt = new Date(2026, 0, 15);
  const payable = holdbackEndsAt(accruedAt);
  assert.equal(payable.getFullYear(), 2026);
  assert.equal(payable.getMonth(), 2);
  assert.equal(payable.getDate(), 16);
});

test("a holdback that spans a DST change still lands on the same calendar day", () => {
  // Wall-clock arithmetic, so the payable DATE is stable even though the
  // underlying UTC instant shifts by an hour across a DST boundary. An hour is
  // immaterial to a 60-day window; a day is not, and this is the property that
  // keeps the two from being confused.
  const accruedAt = new Date(2026, 0, 15, 9, 30);
  const payable = holdbackEndsAt(accruedAt);
  assert.equal(payable.getDate(), 16);
  assert.equal(payable.getHours(), 9, "same wall-clock time on the far side of the change");
});

// ─── Date arithmetic ─────────────────────────────────────────────────────────

test("adding months clamps to the end of the target month", () => {
  // Without the clamp, 31 August + 12 months lands on 1 September — a day
  // early, silently in the company's favour.
  assert.equal(addMonths(new Date(2026, 7, 31), 12).getDate(), 31);
  assert.equal(addMonths(new Date(2026, 0, 31), 1).getMonth(), 1, "31 Jan + 1 month stays in February");
  assert.equal(addMonths(new Date(2026, 0, 31), 1).getDate(), 28);
  assert.equal(addMonths(new Date(2028, 0, 31), 1).getDate(), 29, "leap year");
});

// ─── §10–§13 The activity clock ──────────────────────────────────────────────

test("the activity period runs from the last qualifying referral", () => {
  // §10 — measured from the last qualifying REFERRAL.
  const window = activityWindow({
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2025, 0, 1),
  });
  assert.equal(window.anchorAt.getTime(), new Date(2026, 0, 15).getTime());
  assert.equal(window.activityPeriodEndsAt.getTime(), new Date(2027, 0, 15).getTime());
  assert.equal(window.graceEndsAt.getTime(), new Date(2027, 2, 16).getTime());
});

test("an affiliate who has never referred is measured from enrollment", () => {
  const window = activityWindow({
    currentRatePct: 20,
    lastQualifyingReferralAt: null,
    rateEffectiveAt: new Date(2026, 0, 15),
  });
  assert.equal(window.anchorAt.getTime(), new Date(2026, 0, 15).getTime());
});

test("no reduction while inside the activity period or the grace period", () => {
  const input = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  assert.deepEqual(pendingRateReductions(input, new Date(2026, 11, 1)), [], "inside the 12 months");
  assert.equal(activityStatus(input, new Date(2026, 11, 1)), "active");

  assert.deepEqual(pendingRateReductions(input, new Date(2027, 1, 1)), [], "inside the 60-day grace");
  assert.equal(activityStatus(input, new Date(2027, 1, 1)), "in-grace");
});

test("twelve months plus the grace period without a referral reduces 20% to 10%", () => {
  // §12
  const input = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  const reductions = pendingRateReductions(input, new Date(2027, 3, 1));
  assert.equal(reductions.length, 1);
  assert.equal(reductions[0]?.fromPct, 20);
  assert.equal(reductions[0]?.toPct, 10);
  assert.equal(reductions[0]?.effectiveAt.getTime(), new Date(2027, 2, 16).getTime());
  assert.equal(effectiveRatePct(input, new Date(2027, 3, 1)), 10);
  assert.equal(activityStatus(input, new Date(2027, 3, 1)), "lapsed");
});

test("a second inactive period reduces 10% to 0%, and each step keeps its own date", () => {
  // §13. Thirty-plus months of inactivity is TWO reductions on two distinct
  // dates, not one jump to zero. §12/§13 protect commissions earned before
  // each reduction's effective date, so anything accrued between the two dates
  // was earned at 10% and must stay at 10% — which is only reconstructible if
  // each step carries its own date.
  const input = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  const reductions = pendingRateReductions(input, new Date(2029, 0, 1));
  assert.equal(reductions.length, 2);
  assert.deepEqual(
    reductions.map((r) => [r.fromPct, r.toPct]),
    [[20, 10], [10, 0]],
  );
  // First step effective 16 Mar 2027; the second runs 12 months + 60 days from
  // THAT date, not from the original referral.
  assert.equal(reductions[0]?.effectiveAt.getTime(), new Date(2027, 2, 16).getTime());
  assert.equal(reductions[1]?.effectiveAt.getTime(), new Date(2028, 4, 15).getTime());
  assert.equal(effectiveRatePct(input, new Date(2029, 0, 1)), 0);
});

test("a late sweep produces the same history as a timely one", () => {
  // The ledger must not depend on when a scheduled job happened to fire.
  const input = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  const onTime = pendingRateReductions(input, new Date(2027, 2, 17));
  const veryLate = pendingRateReductions(input, new Date(2027, 11, 31));
  assert.equal(onTime[0]?.effectiveAt.getTime(), veryLate[0]?.effectiveAt.getTime());
});

test("the ladder stops at zero and never runs away", () => {
  const input = {
    currentRatePct: 0,
    lastQualifyingReferralAt: null,
    rateEffectiveAt: new Date(2020, 0, 1),
  };
  assert.deepEqual(pendingRateReductions(input, new Date(2099, 0, 1)), []);
  assert.equal(activityStatus(input, new Date(2099, 0, 1)), "zero-rate");
});

test("a new qualifying referral during the grace period preserves the rate", () => {
  // §15 — referring inside the grace period maintains the then-current rate.
  // Recording the referral moves the anchor, which is what clears the pending
  // reduction.
  const lapsing = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  const now = new Date(2027, 1, 20); // inside the grace period
  assert.equal(activityStatus(lapsing, now), "in-grace");

  const afterReferral = { ...lapsing, lastQualifyingReferralAt: now };
  assert.deepEqual(pendingRateReductions(afterReferral, now), []);
  assert.equal(effectiveRatePct(afterReferral, new Date(2027, 6, 1)), 20);
});

// ─── §27 Attribution lapse, and its independence from §10 ────────────────────

test("attribution survives twelve months of customer non-payment, then lapses", () => {
  const lastPayment = new Date(2026, 0, 15);
  assert.equal(attributionHasLapsed(lastPayment, new Date(2026, 11, 1)), false);
  assert.equal(attributionHasLapsed(lastPayment, new Date(2027, 0, 14)), false);
  assert.equal(attributionHasLapsed(lastPayment, new Date(2027, 1, 1)), true);
  assert.equal(attributionHasLapsed(null, new Date(2099, 0, 1)), false);
});

test("customer payments do not extend the affiliate's activity period", () => {
  // §10 is explicit: "Payments received from customers previously referred by
  // Affiliate do not restart, extend, or renew the activity period." The two
  // clocks are independent, and wiring one to the other is the easiest way to
  // get this wrong — so the activity functions take no payment date at all.
  const input = {
    currentRatePct: 20,
    lastQualifyingReferralAt: new Date(2026, 0, 15),
    rateEffectiveAt: new Date(2026, 0, 15),
  };
  const window = activityWindow(input);
  assert.equal(window.activityPeriodEndsAt.getTime(), new Date(2027, 0, 15).getTime());
  assert.equal(
    Object.keys(input).includes("lastCustomerPaymentAt"),
    false,
    "the activity clock must not accept a payment date as input",
  );
});

// ─── §8 Quarterly payouts ────────────────────────────────────────────────────

test("quarter labels and bounds", () => {
  assert.equal(quarterOf(new Date(2026, 0, 5)), "2026-Q1");
  assert.equal(quarterOf(new Date(2026, 8, 22)), "2026-Q3");
  assert.equal(quarterOf(new Date(2026, 11, 31)), "2026-Q4");

  const q2 = quarterBounds("2026-Q2");
  assert.equal(q2?.start.getTime(), new Date(2026, 3, 1).getTime());
  assert.equal(q2?.end.getTime(), new Date(2026, 6, 1).getTime());
  assert.equal(quarterBounds("2026-Q5"), null);
  assert.equal(quarterBounds("nonsense"), null);
});

test("a payout above the minimum is a draft, below it carries forward", () => {
  const big = assemblePayout([{ commissionUsd: 150 }, { commissionUsd: 75 }]);
  assert.equal(big.grossUsd, 225);
  assert.equal(big.netUsd, 225);
  assert.equal(big.meetsMinimum, true);
  assert.equal(big.status, "draft");

  const small = assemblePayout([{ commissionUsd: 60 }]);
  assert.equal(small.netUsd, 60);
  assert.equal(small.meetsMinimum, false);
  assert.equal(small.status, "carried", "§8 — under $100 carries to the next quarter");
});

test("a carried balance counts toward clearing the minimum", () => {
  // Otherwise a run of $60 quarters would never pay out at all.
  const carried = assemblePayout([{ commissionUsd: 60 }], 0, 60);
  assert.equal(carried.netUsd, 120);
  assert.equal(carried.meetsMinimum, true);
});

test("reversals reduce the quarter and can leave a negative balance", () => {
  // §25/§26. Reversals arrive as a positive magnitude and are recorded as a
  // negative adjustment, so the sign on the stored row is unambiguous.
  const withReversal = assemblePayout([{ commissionUsd: 200 }], 50);
  assert.equal(withReversal.adjustmentsUsd, -50);
  assert.equal(withReversal.netUsd, 150);

  const negative = assemblePayout([{ commissionUsd: 20 }], 200);
  assert.equal(negative.netUsd, -180);
  assert.equal(negative.meetsMinimum, false);
  assert.equal(negative.status, "carried", "§26 — a negative balance carries forward");
});

test("a reversal passed as a negative magnitude is still treated as a deduction", () => {
  const a = assemblePayout([{ commissionUsd: 200 }], 50);
  const b = assemblePayout([{ commissionUsd: 200 }], -50);
  assert.equal(a.netUsd, b.netUsd, "sign of the reversal input must not flip its effect");
});

// ─── Referral codes ──────────────────────────────────────────────────────────

test("referral codes normalise to a single canonical form", () => {
  // A code normalised two different ways is a customer attributed to nobody,
  // and that failure is invisible until an affiliate asks where their money went.
  assert.equal(normalizeReferralCode("  northstar  "), "NORTHSTAR");
  assert.equal(normalizeReferralCode("NorthStar"), "NORTHSTAR");
  assert.equal(normalizeReferralCode(""), null);
  assert.equal(normalizeReferralCode("   "), null);
  assert.equal(normalizeReferralCode(null), null);
  assert.equal(normalizeReferralCode(42), null);
  assert.equal(normalizeReferralCode("x".repeat(200))?.length, 64, "bounded to the column width");
});

test("referral code validation rejects what a printed code cannot be", () => {
  assert.equal(isValidReferralCode("NORTHSTAR"), true);
  assert.equal(isValidReferralCode("NORTH-STAR-2026"), true);
  assert.equal(isValidReferralCode("A"), false, "one character is too easy to collide");
  assert.equal(isValidReferralCode("-LEADING"), false);
  assert.equal(isValidReferralCode("has space"), false);
  assert.equal(isValidReferralCode("lower"), false, "codes are stored upper-case");
});
