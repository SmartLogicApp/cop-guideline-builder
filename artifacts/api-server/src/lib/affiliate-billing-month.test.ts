import assert from "node:assert/strict";
import test from "node:test";
import { deriveAffiliateBillingMonth } from "./affiliate-billing-month.ts";

const paidAt = new Date("2026-04-01T00:20:00.000Z");
const recurringLine = (start: number) => ({
  price: { type: "recurring" },
  period: { start },
});

test("prefers the unique recurring invoice-line period start in UTC", () => {
  const result = deriveAffiliateBillingMonth({
    period_start: Date.parse("2026-04-01T00:00:00Z") / 1000,
    lines: { data: [recurringLine(Date.parse("2026-03-01T00:30:00+02:00") / 1000)] },
  }, paidAt);
  assert.deepEqual(result, {
    billingMonth: "2026-02",
    billingMonthSource: "invoice_line_period",
  });
});

test("uses invoice period when recurring line periods are ambiguous", () => {
  const result = deriveAffiliateBillingMonth({
    period_start: Date.parse("2026-02-28T23:30:00-02:00") / 1000,
    lines: { data: [
      recurringLine(Date.parse("2026-01-01T00:00:00Z") / 1000),
      recurringLine(Date.parse("2026-02-01T00:00:00Z") / 1000),
    ] },
  }, paidAt);
  assert.deepEqual(result, {
    billingMonth: "2026-03",
    billingMonthSource: "invoice_period",
  });
});

test("repeated recurring periods are not ambiguous and non-recurring lines do not override", () => {
  const result = deriveAffiliateBillingMonth({
    lines: { data: [
      recurringLine(Date.parse("2026-03-01T00:00:00Z") / 1000),
      { price: { type: "one_time" }, period: { start: Date.parse("2025-12-01T00:00:00Z") / 1000 } },
      recurringLine(Date.parse("2026-03-01T00:00:00Z") / 1000),
    ] },
  }, paidAt);
  assert.deepEqual(result, {
    billingMonth: "2026-03",
    billingMonthSource: "invoice_line_period",
  });
});

test("falls back to an explicitly estimated UTC payment month", () => {
  const result = deriveAffiliateBillingMonth({}, new Date("2026-05-01T00:20:00+02:00"));
  assert.deepEqual(result, {
    billingMonth: "2026-04",
    billingMonthSource: "payment_month_fallback",
  });
});

test("rejects a missing invoice period and invalid payment date", () => {
  assert.throws(
    () => deriveAffiliateBillingMonth({}, new Date("invalid")),
    /could not be determined/,
  );
});