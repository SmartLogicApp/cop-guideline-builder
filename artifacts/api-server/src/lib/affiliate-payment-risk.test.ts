import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { invoiceRiskDisposition } from "./affiliate-payment-risk-rules.ts";

test("partial refunds hold the full invoice commission for manual review", () => {
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 1_000,
    disputeStatus: "none",
  }), "partial_refund_review");
});

test("full refunds and lost disputes reverse unpaid commission", () => {
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 10_000,
    disputeStatus: "none",
  }), "full_refund");
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 0,
    disputeStatus: "lost",
  }), "full_refund");
});

test("open disputes hold commission, while a won dispute clears only with no refund", () => {
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 0,
    disputeStatus: "open",
  }), "dispute_open");
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 0,
    disputeStatus: "won",
  }), "clear");
  assert.equal(invoiceRiskDisposition({
    chargeAmountMinor: 10_000,
    cumulativeRefundedMinor: 250,
    disputeStatus: "won",
  }), "partial_refund_review");
});

test("risk written before invoice accrual is consulted before commission creation", async () => {
  const accrual = await readFile(new URL("./affiliate-accrual.ts", import.meta.url), "utf8");
  assert.match(accrual, /affiliateInvoicePaymentRisks/);
  assert.match(accrual, /paymentRiskDisposition === "full_refund"[\s\S]*?payment-refunded-or-dispute-lost/);
  assert.match(accrual, /status: paymentRiskDisposition === "clear" \? "pending" : "risk_held"/);
});

test("Stripe risk event IDs are uniquely recorded for safe redelivery", async () => {
  const schema = await readFile(
    new URL("../../../../lib/db/src/schema/affiliate-compliance.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../../../../lib/db/migrations/0010_affiliate_invoice_payment_risks.sql", import.meta.url),
    "utf8",
  );
  assert.match(schema, /stripeEventId: text\("stripe_event_id"\)\.primaryKey\(\)/);
  assert.match(migration, /stripe_event_id text PRIMARY KEY/);
});