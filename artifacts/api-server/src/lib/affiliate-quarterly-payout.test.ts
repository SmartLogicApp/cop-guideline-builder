import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eligibleQuarterCommission, sumCommissionCents } from "./affiliate-quarterly-payout.ts";

const end = new Date("2026-04-01T00:00:00Z");
const now = new Date("2026-04-12T00:00:00Z");
const base = {
  id: "commission-1", amount: 80, status: "payable", payoutId: null,
  accruedAt: new Date("2025-10-01T00:00:00Z"),
  payableAt: new Date("2026-01-31T00:00:00Z"),
};

test("quarterly selection carries older mature commissions forward", () => {
  assert.equal(eligibleQuarterCommission(base, new Set(), end, now, true), true);
});

test("never selects paid, legacy-settled, already claimed, or future commissions", () => {
  assert.equal(eligibleQuarterCommission({ ...base, status: "paid" }, new Set(), end, now, true), false);
  assert.equal(eligibleQuarterCommission({ ...base, payoutId: "legacy-payout" }, new Set(), end, now, true), false);
  assert.equal(eligibleQuarterCommission(base, new Set([base.id]), end, now, true), false);
  assert.equal(eligibleQuarterCommission({ ...base, payableAt: end }, new Set(), end, now, true), false);
  assert.equal(eligibleQuarterCommission({ ...base, amount: 0 }, new Set(), end, now, true), false);
  assert.equal(eligibleQuarterCommission({ ...base, amount: -1 }, new Set(), end, now, true), false);
});

test("amounts are summed in cents rather than floating point dollars", () => {
  assert.equal(sumCommissionCents([{ amount: "60.10" }, { amount: "39.90" }]), 10000);
});

test("quarterly batch delegates to the locked reviewed draft and never sends transfers", () => {
  const routes = readFileSync(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  const run = routes.slice(routes.indexOf('router.post("/admin/payouts/quarterly-run"'),
    routes.indexOf('router.post("/admin/payouts/draft"'));
  assert.match(run, /requireSuperAdmin/);
  assert.match(run, /stripeTestPayoutGuard\(\)/);
  assert.match(run, /createReviewedDraft\(affiliateId, bounds\.start, bounds\.end, true\)/);
  assert.doesNotMatch(run, /transfers\.create|status: "paid"/);
  const draft = routes.slice(routes.indexOf("async function createReviewedDraft"),
    routes.indexOf("function completedQuarter"));
  assert.match(draft, /calculateAffiliatePayoutEligibility\(affiliateId, tx\)/);
  assert.match(draft, /isNull\(affiliateCommissions\.payoutId\)/);
  assert.match(draft, /isNotNull\(affiliatePayoutWorkflow\.stripeTransferId\)/);
  assert.match(draft, /for\("update"\)/);
  const send = routes.slice(routes.indexOf('router.post("/admin/payouts/:id/send"'));
  assert.match(send, /const attemptStarted = await db\.transaction/);
  assert.match(send, /current\.payoutStatus !== "approved_for_payout"/);
  assert.match(send, /payoutStatus: "payout_processing"/);
  assert.ok(send.indexOf("const attemptStarted = await db.transaction") < send.indexOf("stripe.transfers.create"));
  assert.match(send, /locked\.stripeTransferId/);
  assert.match(send, /transferredClaims\.length/);
  assert.match(send, /payoutId == null/);
  assert.match(send, /transfer\.amount !== selectedAmountCents/);
  assert.doesNotMatch(send, /retry remains idempotent/);
  const voidRoute = routes.slice(routes.indexOf('router.post("/admin/payouts/:id/void"'),
    routes.indexOf('router.post("/admin/payouts/:id/send"'));
  assert.match(voidRoute, /locked\.stripeTransferId/);
  assert.match(voidRoute, /\["payable_pending_admin_approval", "approved_for_payout"\]/);
  assert.doesNotMatch(voidRoute, /"payout_processing"/);
});