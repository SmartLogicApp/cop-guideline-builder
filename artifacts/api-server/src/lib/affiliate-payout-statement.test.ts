import assert from "node:assert/strict";
import test from "node:test";
import {
  affiliatePayoutStatementCsv,
  buildAffiliatePayoutStatement,
  canAffiliateViewPayoutStatement,
} from "./affiliate-payout-statement.ts";

const payout = {
  id: "payout-1",
  affiliateId: "affiliate-1",
  affiliateName: "Partner Company",
  stripeTransferId: "tr_123",
  payoutPeriodStart: "2026-01-01T00:00:00.000Z",
  payoutPeriodEnd: "2026-04-01T00:00:00.000Z",
  quarter: "2026 Q1",
  payoutStatus: "paid",
  currency: "usd",
  grossCommissionAmount: "25.00",
  adjustmentsAmount: "-2.00",
  netPayoutAmount: "23.00",
  createdAt: "2026-04-02T00:00:00.000Z",
  paidAt: "2026-04-03T00:00:00.000Z",
};

test("portal statement ownership is exact and rejects another affiliate", () => {
  assert.equal(canAffiliateViewPayoutStatement("affiliate-1", "affiliate-1"), true);
  assert.equal(canAffiliateViewPayoutStatement("affiliate-1", "affiliate-2"), false);
  assert.equal(canAffiliateViewPayoutStatement("affiliate-1", "Affiliate-1"), false);
});

test("legacy statement rows use a labeled UTC payment-month estimate", () => {
  const statement = buildAffiliatePayoutStatement(payout, [{
    commissionAmount: "25.00",
    commissionStatus: "reversed",
    qualifyingRevenueUsd: "125.00",
    ratePct: 20,
    accruedAt: "2026-02-01T00:30:00+02:00",
    payableAt: "2026-04-02T00:00:00Z",
    facilityName: "North Clinic",
  }], { paidUsd: 45, year: 2026 });
  assert.equal(statement.lines[0].billingMonth, "2026-01");
  assert.equal(statement.lines[0].billingMonthSource, "payment_month_fallback");
  assert.equal(statement.lines[0].commissionRatePct, 20);
  assert.equal(statement.lines[0].commissionAmountUsd, 25);
  assert.equal(statement.lines[0].commissionStatus, "reversed");
  assert.equal(statement.lines[0].holdbackReleaseAt, "2026-04-02T00:00:00Z");
  assert.equal(statement.totalClientPaymentUsd, 125);
  assert.equal(statement.totalCommissionUsd, 25);
  assert.equal(statement.yearToDatePaidUsd, 45);
  assert.equal(statement.yearToDateYear, 2026);
  assert.deepEqual(statement.adjustmentLines, [{
    type: "general_adjustment",
    reason: "Recorded payout adjustment",
    description: "The payout record contains a negative adjustment. No durable line-level source links this amount to a specific refund or dispute.",
    amountUsd: -2,
  }]);
  assert.equal(statement.adjustmentsAmount, -2);
  assert.equal(statement.netPayoutAmount, 23);
});

test("statement refuses to report claim or adjustment totals inconsistent with payout snapshot", () => {
  assert.throws(
    () => buildAffiliatePayoutStatement({ ...payout, grossCommissionAmount: "24.99" }, [{
      commissionAmount: "25.00",
      commissionStatus: "paid",
      qualifyingRevenueUsd: "125.00",
      ratePct: 20,
      accruedAt: "2026-02-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: "North Clinic",
    }], { paidUsd: 0, year: 2026 }),
    /claim total does not match/,
  );
  assert.throws(
    () => buildAffiliatePayoutStatement({ ...payout, netPayoutAmount: "22.99" }, [{
      commissionAmount: "25.00",
      commissionStatus: "paid",
      qualifyingRevenueUsd: "125.00",
      ratePct: 20,
      accruedAt: "2026-02-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: "North Clinic",
    }], { paidUsd: 0, year: 2026 }),
    /adjustments do not match/,
  );
});

test("CSV quotes client names, neutralizes formulas, and includes all statement totals", () => {
  const statement = buildAffiliatePayoutStatement(payout, [
    {
      commissionAmount: "15.00",
      commissionStatus: "paid",
      qualifyingRevenueUsd: "75.00",
      ratePct: 20,
      accruedAt: "2026-02-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: 'North, "Main" Clinic',
    },
    {
      commissionAmount: "10.00",
      commissionStatus: "reversed",
      qualifyingRevenueUsd: "50.00",
      ratePct: 20,
      accruedAt: "2026-03-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: "=HYPERLINK(\"https://example.invalid\")",
    },
  ], { paidUsd: 45, year: 2026 });
  const csv = affiliatePayoutStatementCsv(statement);
  assert.match(csv, /"North, ""Main"" Clinic"/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"TOTAL CLIENT PAYMENT".*"125\.00"/);
  assert.match(csv, /"TOTAL COMMISSION".*"25\.00"/);
  assert.match(csv, /"PAYOUT ADJUSTMENTS".*"-2\.00"/);
  assert.match(csv, /"NET PAYOUT".*"23\.00"/);
  assert.ok(csv.includes('"tr_123"'));
  assert.ok(csv.includes('"2026 Q1"'));
  assert.ok(csv.includes('"Partner Company"'));
  assert.ok(csv.includes('"2026-04-03T00:00:00.000Z"'));
  assert.ok(csv.includes('"2026-04-02T00:00:00Z"'));
  assert.ok(csv.includes('"2026","45.00"'));
  assert.ok(csv.includes('"general_adjustment"'));
});

test("statement uses immutable invoice billing month instead of the paid month", () => {
  const statement = buildAffiliatePayoutStatement(payout, [{
    commissionAmount: "25.00",
    commissionStatus: "paid",
    qualifyingRevenueUsd: "125.00",
    ratePct: 20,
    accruedAt: "2026-03-02T00:00:00.000Z",
    payableAt: "2026-05-01T00:00:00.000Z",
    billingMonth: "2026-01",
    billingMonthSource: "invoice_line_period",
    facilityName: "North Clinic",
  }], { paidUsd: 0, year: 2026 });
  assert.equal(statement.lines[0].billingMonth, "2026-01");
  assert.equal(statement.lines[0].billingMonthSource, "invoice_line_period");
  assert.ok(affiliatePayoutStatementCsv(statement).includes('"2026-01","invoice_line_period"'));
});

test("sensitive facility-name numbers are redacted identically in JSON and CSV", () => {
  const statement = buildAffiliatePayoutStatement(payout, [
    {
      commissionAmount: "15.00",
      commissionStatus: "paid",
      qualifyingRevenueUsd: "75.00",
      ratePct: 20,
      accruedAt: "2026-02-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: "North Clinic 123-45-6789",
    },
    {
      commissionAmount: "10.00",
      commissionStatus: "paid",
      qualifyingRevenueUsd: "50.00",
      ratePct: 20,
      accruedAt: "2026-03-01T00:00:00Z",
      payableAt: "2026-04-02T00:00:00Z",
      facilityName: "South Clinic",
    },
  ], { paidUsd: 0, year: 2026 });

  assert.deepEqual(statement.lines.map((line) => line.clientName), [
    "North Clinic [redacted financial number]",
    "South Clinic",
  ]);
  const csv = affiliatePayoutStatementCsv(statement);
  assert.ok(csv.includes('"North Clinic [redacted financial number]"'));
  assert.ok(csv.includes('"South Clinic"'));
  assert.ok(!csv.includes("123-45-6789"));
});