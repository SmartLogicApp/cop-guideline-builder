import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./accounts.ts", import.meta.url), "utf8");

function activationHandler(): string {
  const start = source.indexOf('router.post("/affiliate/activate"');
  assert.notEqual(start, -1, "expected the existing-workspace affiliate activation endpoint");
  const end = source.indexOf('router.post("/register"', start);
  assert.ok(end > start, "expected the activation handler before registration");
  return source.slice(start, end);
}

test("direct-client affiliate activation requires verified primary email, account link, and a locked current acceptance", () => {
  const handler = activationHandler();
  assert.match(handler, /requireAuth/);
  assert.match(handler, /clerkClient\.users\.getUser\(userId\)/);
  assert.match(handler, /primaryEmail\?\.verification\?\.status !== "verified"/);
  assert.match(handler, /AFFILIATE_EMAIL_UNVERIFIED/);
  assert.match(handler, /AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED/);
  assert.match(handler, /lower\(trim\(\$\{affiliates\.email\}\)\)/);
  assert.match(handler, /\.for\("update"\)/);
  assert.match(handler, /currentReviewedAffiliateAcceptanceCondition\(\)/);
  assert.match(handler, /AFFILIATE_APPLICATION_ON_HOLD/);
  assert.match(handler, /AFFILIATE_APPLICATION_EMAIL_MISMATCH/);
  assert.match(handler, /AFFILIATE_FOREIGN_CLERK_BINDING/);
  assert.match(handler, /commissionRatePct:\s*20/);
  assert.match(handler, /generateAffiliateReferralCode\(\)/);
  assert.match(handler, /affiliateRateChanges/);
});

test("activation grants an idempotent 30-day membership-only trial without changing client billing", () => {
  const handler = activationHandler();
  assert.match(handler, /if \(affiliate\.status === "active" && affiliate\.clerkUserId === userId\)/);
  assert.match(handler, /if \(!accountUser\.hasComplimentaryAccess &&[\s\S]*?accountUser\.complimentaryAccessGrantedBy !== "affiliate-self-service"\)/);
  assert.match(handler, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(handler, /complimentaryAccessEndsAt:\s*trialEndsAt/);
  assert.match(handler, /tx\.update\(accountUsers\)/);
  assert.doesNotMatch(handler, /tx\.update\(accounts\)|tx\.insert\(accounts\)|tx\.update\(accountUsers\)[\s\S]{0,300}subscriptionStatus/);
  assert.match(handler, /trialEndsAt: result\.trialEndsAt\?\.toISOString\(\) \?\? null/);
  const accountSchema = readFileSync(new URL("../../../../lib/db/src/schema/accounts.ts", import.meta.url), "utf8");
  assert.match(accountSchema, /complimentaryAccessEndsAt:\s*timestamp\("complimentary_access_ends_at",\s*\{\s*withTimezone:\s*true\s*\}\)/);
});

test("the application duplicate lookup compares trimmed email case-insensitively", () => {
  const applications = readFileSync(new URL("./affiliates.ts", import.meta.url), "utf8");
  assert.match(applications, /lower\(trim\(\$\{affiliates\.email\}\)\)/);
});