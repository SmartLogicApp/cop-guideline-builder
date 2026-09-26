import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  acceptanceCoversPayment,
  latestQualifyingReferralAt,
  resolveReferralRate,
} from "./affiliate-accrual-rules.ts";

const effectiveAt = new Date("2026-01-01T12:00:00.000Z");

test("a first referral at 10% restores to 20% on the triggering payment", () => {
  const paidAt = new Date("2026-02-01T12:00:00.000Z");
  assert.deepEqual(resolveReferralRate({
    currentRatePct: 10,
    rateEffectiveAt: effectiveAt,
    paidAt,
    firstQualifyingReferral: true,
  }), { kind: "accrue", ratePct: 20, restored: true, rateEffectiveAt: paidAt });
});

test("a first referral restores 0% inside the 60-day window at 20% on that payment", () => {
  const paidAt = new Date("2026-03-02T12:00:00.000Z");
  const decision = resolveReferralRate({
    currentRatePct: 0,
    rateEffectiveAt: effectiveAt,
    paidAt,
    firstQualifyingReferral: true,
  });
  assert.equal(decision.kind, "accrue");
  if (decision.kind === "accrue") {
    assert.equal(decision.ratePct, 20);
    assert.equal(decision.restored, true);
    assert.equal(decision.rateEffectiveAt, paidAt);
  }
});

test("0% remains in place after the automatic restoration window", () => {
  assert.deepEqual(resolveReferralRate({
    currentRatePct: 0,
    rateEffectiveAt: effectiveAt,
    paidAt: new Date("2026-03-03T12:00:00.000Z"),
    firstQualifyingReferral: true,
  }), { kind: "zero-rate" });
});

test("later invoices for an existing customer do not trigger restoration", () => {
  assert.deepEqual(resolveReferralRate({
    currentRatePct: 10,
    rateEffectiveAt: effectiveAt,
    paidAt: new Date("2026-02-01T12:00:00.000Z"),
    firstQualifyingReferral: false,
  }), {
    kind: "accrue",
    ratePct: 10,
    restored: false,
    rateEffectiveAt: effectiveAt,
  });
});

test("payments earlier than the current rate-effective date are sent for review", () => {
  assert.deepEqual(resolveReferralRate({
    currentRatePct: 0,
    rateEffectiveAt: effectiveAt,
    paidAt: new Date("2025-12-31T23:59:59.999Z"),
    firstQualifyingReferral: true,
  }), { kind: "out-of-order-payment" });
});

test("a referral never moves the activity clock backwards", () => {
  const latest = new Date("2026-04-01T12:00:00.000Z");
  assert.equal(
    latestQualifyingReferralAt(latest, new Date("2026-03-01T12:00:00.000Z")),
    latest,
  );
});

test("a payment is eligible only when v4 acceptance predates or coincides with payment", () => {
  const paidAt = new Date("2026-04-01T12:00:00.000Z");
  assert.equal(acceptanceCoversPayment(new Date("2026-04-01T11:59:59.999Z"), paidAt), true);
  assert.equal(acceptanceCoversPayment(paidAt, paidAt), true);
  assert.equal(acceptanceCoversPayment(new Date("2026-04-01T12:00:00.001Z"), paidAt), false);
});

test("commission accrual checks exact reviewed Version 4.0 and acceptance inside the transaction", async () => {
  const source = await readFile(new URL("./affiliate-accrual.ts", import.meta.url), "utf8");
  assert.match(source, /AFFILIATE_AGREEMENT_V4_VERSION/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /agreementVersion[\s\S]{0,120}agreement\.version/);
  assert.match(source, /contentSha256/);
  assert.match(source, /agreementIdentityEpoch/);
  assert.match(source, /hasCurrentV4Acceptance/);
  assert.match(source, /acceptanceCoversPayment\(acceptance\.acceptedAt, paidAt\)/);
  assert.match(source, /stripeInvoiceId[\s\S]{0,500}already-accrued/);
});

test("qualifying paid-referral history prevents 0%-rate customers becoming first-time referrals later", async () => {
  const source = await readFile(new URL("./affiliate-accrual.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
  const historyMigration = await readFile(
    new URL("../../../../lib/db/migrations/0007_affiliate_qualifying_referral_history.sql", import.meta.url),
    "utf8",
  );

  assert.match(source, /from\(affiliateQualifyingReferrals\)/);
  assert.match(source, /let firstQualifyingReferral = !priorReferral/);
  const historyWrite = source.indexOf("stripeInvoiceId: input.stripeInvoiceId,");
  const zeroRateReturn = source.indexOf('if (decision.kind === "zero-rate") return');
  assert.ok(historyWrite >= 0 && historyWrite < zeroRateReturn);
  assert.match(schema, /uniqueIndex\("affiliate_qualifying_referrals_pair_key"\)\.on\(table\.affiliateId, table\.accountId\)/);
  assert.match(historyMigration, /INSERT INTO affiliate_qualifying_referrals[\s\S]*FROM affiliate_commissions[\s\S]*ON CONFLICT DO NOTHING/);
});

test("out-of-order payments are durably recorded under a unique invoice key", async () => {
  const source = await readFile(new URL("./affiliate-accrual.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
  const reviewMigration = await readFile(
    new URL("../../../../lib/db/migrations/0008_affiliate_out_of_order_payment_reviews.sql", import.meta.url),
    "utf8",
  );

  assert.match(source, /recordOutOfOrderPaymentReview\(tx, input, lockedAffiliate\.id, account\.id\)/);
  assert.match(source, /stripeInvoiceId: input\.stripeInvoiceId,[\s\S]*reason: "payment-predates-rate-effective-date"/);
  assert.match(schema, /uniqueIndex\("affiliate_out_of_order_payment_reviews_invoice_key"\)\.on\(table\.stripeInvoiceId\)/);
  assert.match(reviewMigration, /CONSTRAINT affiliate_out_of_order_payment_reviews_invoice_key UNIQUE \(stripe_invoice_id\)/);
});

test("invoice accrual failures reach Stripe for retry; stale payment outcomes require manual reconciliation", async () => {
  const webhook = await readFile(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
  const branch = webhook.split('case "invoice.payment_succeeded": {')[1]?.split('case "charge.refunded":')[0];
  assert.ok(branch, "invoice.payment_succeeded branch should exist");
  assert.match(branch!, /await accrueCommissionFromInvoice/);
  assert.doesNotMatch(branch!, /\btry\s*\{|\bcatch\s*\(/);
  assert.match(webhook, /Out-of-order affiliate invoice needs manual reconciliation; no automatic recovery is configured\./);
  const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
  assert.match(app, /await WebhookHandlers\.processWebhook[\s\S]*?return res\.status\(200\)/);
  assert.match(app, /catch \(err: any\)[\s\S]*?return res\.status\(400\)/);
});