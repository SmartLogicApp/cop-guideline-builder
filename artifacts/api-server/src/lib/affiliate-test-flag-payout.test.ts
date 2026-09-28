import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const accrual = readFileSync(new URL("./affiliate-accrual.ts", import.meta.url), "utf8");
const eligibility = readFileSync(new URL("./affiliate-payout-eligibility.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
const affiliateRoutes = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");

test("new accruals reject both test clients and test affiliates and recheck locked flags", () => {
  assert.match(accrual, /if \(account\.isTest\) return \{ accrued: false, reason: "test-record" \}/);
  assert.match(accrual, /if \(affiliate\.isTest\) return \{ accrued: false, reason: "test-record" \}/);
  const transaction = accrual.slice(accrual.indexOf("return await db.transaction"), accrual.indexOf("const [duplicate]"));
  assert.ok(transaction.indexOf(".from(affiliates)") < transaction.indexOf(".from(accounts)"));
  assert.match(transaction, /lockedAffiliate\.isTest/);
  assert.match(transaction, /lockedAccount\.isTest/);
  assert.match(transaction, /\.for\("update"\)/);
});

test("payout eligibility excludes test clients and blocks an entire test affiliate", () => {
  assert.match(eligibility, /\.innerJoin\(accounts, eq\(accounts\.id, affiliateCommissions\.accountId\)\)/);
  assert.match(eligibility, /eq\(accounts\.isTest, false\)/);
  assert.match(eligibility, /if \(affiliate\.isTest\)[\s\S]*Test affiliates are excluded from payouts/);
});

test("draft and quarterly selection cannot claim commissions from test clients", () => {
  const draft = routes.slice(routes.indexOf("async function createReviewedDraft"), routes.indexOf("function completedQuarter"));
  assert.match(draft, /\.innerJoin\(accounts, eq\(accounts\.id, affiliateCommissions\.accountId\)\)/);
  assert.match(draft, /eq\(accounts\.isTest, false\)/);
  assert.match(draft, /\.for\("update"\)/);
  const quarterly = routes.slice(routes.indexOf("async function quarterlyCandidates"), routes.indexOf("function stripeTestPayoutGuard"));
  assert.match(quarterly, /eq\(accounts\.isTest, false\)/);
  assert.match(quarterly, /eq\(affiliates\.isTest, false\)/);
});

test("approval and every send boundary lock and recheck test-linked claims before transfer", () => {
  const approve = routes.slice(routes.indexOf('router.post("/admin/payouts/:id/approve"'),
    routes.indexOf('router.post("/admin/payouts/:id/void"'));
  const send = routes.slice(routes.indexOf('router.post("/admin/payouts/:id/send"'));
  assert.match(approve, /lockPayoutClaimsAndCheckTestRecords\(tx, id, payout\.affiliateId\)/);
  assert.match(approve, /claimCheck\.hasTestClient/);
  assert.match(send, /lockPayoutClaimsAndCheckTestRecords\(tx, id, current\.affiliateId\)/);
  assert.match(send, /lockPayoutClaimsAndCheckTestRecords\(tx, locked\.id, locked\.affiliateId\)/);
  const finalSend = send.indexOf("const claimCheck = await lockPayoutClaimsAndCheckTestRecords(tx, locked.id");
  assert.ok(finalSend > 0 && finalSend < send.indexOf("stripe.transfers.create"));
  const helper = routes.slice(routes.indexOf("async function lockPayoutClaimsAndCheckTestRecords"),
    routes.indexOf("async function requireAffiliate"));
  assert.match(helper, /\.innerJoin\(accounts, eq\(accounts\.id, affiliateCommissions\.accountId\)\)/);
  assert.match(helper, /accountIsTest: accounts\.isTest/);
  assert.match(helper, /\.for\("update"\)/);
});

test("admin payout list hides test-linked history by default and supports explicit review", () => {
  const list = routes.slice(routes.indexOf('router.get("/admin/payouts"'),
    routes.indexOf('router.get("/admin/payouts/:id/statement"'));
  assert.match(list, /includeTest = req\.query\.includeTest === "true"/);
  assert.match(list, /or\(eq\(affiliates\.isTest, true\), eq\(accounts\.isTest, true\)\)/);
  assert.match(list, /allPayouts\.filter\(\(payout\) => !testLinkedIds\.has\(payout\.id\)\)/);
  assert.match(list, /testLinked: testLinkedIds\.has\(payout\.id\)/);
  assert.match(list, /Already-sent mixed payouts are historical facts/);
  // The direct statement-by-ID route follows separately and remains available
  // for audit/history even if its parent row is hidden in the normal list.
  assert.match(routes.slice(routes.indexOf('router.get("/admin/payouts/:id/statement"'),
    routes.indexOf('router.get("/admin/payouts/recovery-reviews"')), /loadAffiliatePayoutStatement\(id\)/);
});

test("affiliate admin tables and stats exclude tests unless explicitly reviewed", () => {
  const affiliateList = affiliateRoutes.slice(affiliateRoutes.indexOf('router.get("/", requireAnyAdmin'),
    affiliateRoutes.indexOf('router.get("/stats", requireAnyAdmin'));
  assert.match(affiliateList, /includeTest = req\.query\.includeTest === "true"/);
  assert.match(affiliateList, /affiliates\.isTest, false/);
  assert.match(affiliateList, /accounts\.isTest, false/);
  const stats = affiliateRoutes.slice(affiliateRoutes.indexOf('router.get("/stats", requireAnyAdmin'),
    affiliateRoutes.indexOf('router.get("/reports/download"'));
  assert.match(stats, /includeTest = req\.query\.includeTest === "true"/);
  assert.match(stats, /accounts\.isTest, false/);
  assert.match(stats, /affiliates\.isTest, false/);
});

test("affiliate-compliance admin list hides test affiliates by default and labels explicit review rows", () => {
  const listStart = routes.indexOf('router.get("/admin", requireAnyAdmin');
  const listEnd = routes.indexOf('router.get("/admin/documents"', listStart);
  const list = routes.slice(listStart, listEnd);
  assert.ok(listStart >= 0 && listEnd > listStart);
  assert.match(list, /includeTest = req\.query\.includeTest === "true"/);
  assert.match(list, /affiliates\.isTest, false/);
  assert.match(list, /isTest: affiliate\.isTest/);
  assert.ok(listStart < routes.indexOf('router.get("/admin/payouts"', listStart));
});

test("manual accrual and payout previews cannot turn test rows into claims or payout totals", () => {
  const manualAccrual = affiliateRoutes.slice(affiliateRoutes.indexOf('router.post("/:id/commissions"'),
    affiliateRoutes.indexOf('router.post("/commissions/:commissionId/reverse"'));
  assert.match(manualAccrual, /if \(row\.isTest\) return \{ kind: "test-record" as const \}/);
  assert.match(manualAccrual, /account\.isTest/);
  assert.match(manualAccrual, /\.for\("update"\)/);
  const preview = affiliateRoutes.slice(affiliateRoutes.indexOf('router.get("/payouts/preview"'),
    affiliateRoutes.indexOf('router.post("/payouts"'));
  assert.match(preview, /eq\(affiliates\.isTest, false\)/);
  assert.match(preview, /eq\(accounts\.isTest, false\)/);
});