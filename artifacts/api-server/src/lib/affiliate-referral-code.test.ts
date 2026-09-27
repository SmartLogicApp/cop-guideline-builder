import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateAffiliateReferralCode } from "./affiliate-referral-code.ts";

test("permanent referral codes are opaque, valid, and unique across attempts", () => {
  const codes = Array.from({ length: 100 }, generateAffiliateReferralCode);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^AFF-[A-F0-9]{20}$/);
});

test("approval promotes the pending record only after the paid gate, current agreement and hold checks", () => {
  const routes = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const approve = routes.slice(routes.indexOf('router.post("/:id/approve"'), routes.indexOf('router.post("/:id/rate"'));
  assert.match(approve, /if \(activationBlocked\(res\)\) return;/);
  assert.match(approve, /reviewedAffiliateAgreementExists\(\)/);
  assert.match(approve, /hasReviewedAffiliateAcceptance\(row\.id\)/);
  assert.match(approve, /row\.applicationHeldAt/);
  assert.match(approve, /db\.transaction\(async \(tx\) => \{[\s\S]*tx\.update\(affiliates\)[\s\S]*tx\.insert\(affiliateRateChanges\)/);
  assert.match(approve, /generateAffiliateReferralCode\(\)/);
  assert.match(approve, /isNull\(affiliates\.applicationHeldAt\)/);
  assert.match(approve, /currentReviewedAffiliateAcceptanceCondition\(\)/);
  assert.doesNotMatch(approve, /tx\.insert\(affiliates\)/);
  assert.match(routes, /router\.post\("\/:id\/hold", requireSuperAdmin/);
  assert.match(routes, /router\.post\("\/:id\/release-hold", requireSuperAdmin/);
  assert.match(routes, /eventType: "application_held"/);
  assert.match(routes, /eventType: "application_hold_released"/);
});