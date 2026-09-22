import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Self-registration must never join an existing account.
 *
 * POST /api/accounts/register was get-or-create: if an account already held the
 * submitted identifier, the caller was linked to it as a "member". CMS
 * Certification Numbers are PUBLIC — CMS publishes them in Care Compare — so
 * anyone able to create a Clerk account could type a hospital's CCN and be
 * handed that hospital's subscription, generated policies and gap-assessment
 * results.
 *
 * These are source assertions rather than behavioural ones because the handler
 * needs a live database to exercise. They are deliberately blunt: the point is
 * that restoring the old shape fails loudly, in a test whose name says why.
 *
 * If you are here because this test failed while you were adding multi-user
 * facilities: that needs an invitation flow, started by the account. It is not
 * this endpoint.
 */

const source = readFileSync(new URL("./accounts.ts", import.meta.url), "utf8");

function registerHandler(): string {
  const start = source.indexOf('router.post("/register"');
  assert.notEqual(start, -1, "expected the register route to exist");
  const end = source.indexOf("export default router", start);
  return source.slice(start, end === -1 ? source.length : end);
}

test("registration refuses an identifier that is already registered", () => {
  const handler = registerHandler();
  assert.match(
    handler,
    /IDENTIFIER_ALREADY_REGISTERED/,
    "expected a refusal code for an identifier that already exists",
  );
  assert.match(
    handler,
    /status\(409\)/,
    "expected the refusal to be a 409",
  );
});

test("a registrant is never linked to an account they did not create", () => {
  const handler = registerHandler();

  // The old code chose the role from whether the account already existed.
  // Any expression that can yield "member" here is the vulnerability returning.
  assert.doesNotMatch(
    handler,
    /role:\s*\w+\s*\?\s*["']admin["']\s*:\s*["']member["']/,
    "role must not depend on whether the account pre-existed — that is get-or-create",
  );
  assert.match(
    handler,
    /role:\s*["']admin["']/,
    "the registrant creates the account and is therefore always its admin",
  );
});

test("the identifier lookup is a guard, not a fallback", () => {
  const handler = registerHandler();
  const lookup = handler.indexOf("eq(accounts.ccn, normalIdentifier)");
  assert.notEqual(lookup, -1, "expected the identifier lookup to exist");

  // Whatever follows the lookup must reject, not proceed. `if (!account)`
  // reintroduces the fallback path the old code took.
  const after = handler.slice(lookup, lookup + 400);
  assert.doesNotMatch(
    after,
    /if\s*\(\s*!\s*account\s*\)/,
    "an existing identifier must refuse, never fall through to creation-or-join",
  );
  assert.match(after, /if\s*\(\s*account\s*\)/, "expected an existing identifier to be refused");
});

test("a race that loses the unique index refuses rather than joins", () => {
  const handler = registerHandler();
  // Two simultaneous registrations pass the read; only one insert wins. The
  // loser must get the same refusal, not be attached to the winner's account.
  assert.match(
    handler,
    /isUniqueViolation\(error\)[\s\S]{0,400}IDENTIFIER_ALREADY_REGISTERED/,
    "expected a unique-violation on insert to produce the same refusal",
  );
});

test("affiliate attribution is captured at registration and sanitised", () => {
  const handler = registerHandler();
  // referral_code cannot be backfilled: an account registered without it has
  // no recoverable referrer, so it is captured before any programme exists.
  assert.match(handler, /referralCode/, "expected the referral code to be read from the body");
  assert.match(
    handler,
    /referralCode:\s*normalReferral/,
    "expected the sanitised referral code to be written to the account",
  );
  // Normalisation used to be inline here. It now lives in
  // lib/affiliate-commission.ts because the affiliate LOOKUP has to apply the
  // identical rule — a code normalised one way at registration and another way
  // at lookup is a customer attributed to nobody, and that failure is silent
  // until an affiliate asks where their commission went.
  //
  // So the assertion is that the shared function is used, not that a particular
  // chain of string methods appears. Re-inlining the logic is the regression
  // this now catches.
  assert.match(
    handler,
    /normalizeReferralCode\(referralCode\)/,
    "expected the shared normaliser to be used, not a local copy",
  );
  assert.doesNotMatch(
    handler,
    /\.trim\(\)\.toUpperCase\(\)\.slice\(/,
    "referral-code normalisation must not be re-inlined here",
  );
  assert.match(
    source,
    /import\s*\{[^}]*normalizeReferralCode[^}]*\}\s*from\s*"\.\.\/lib\/affiliate-commission\.js"/,
    "expected normalizeReferralCode to be imported from the shared module",
  );
});
