import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Source-contract tests for the affiliate money path.
 *
 * These read the source rather than executing it. They exist because the
 * properties they protect are the ones that fail SILENTLY and EXPENSIVELY: a
 * commission paid twice, an affiliate route added without a guard, a rate
 * recalculated on read. None of those throw. None of them show up in a smoke
 * test. They show up when a quarterly payout is wrong and somebody has to
 * reconstruct three months of ledger by hand.
 *
 * A source test cannot prove the code is correct. It can prove a specific
 * defence has not been deleted, which is the failure mode that actually
 * happens during a refactor.
 */

const routes = readFileSync(new URL("./affiliates.ts", import.meta.url), "utf8");
const accrual = readFileSync(new URL("../lib/affiliate-accrual.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
const webhooks = readFileSync(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../../../../index.jsx", import.meta.url), "utf8");

/**
 * Strip comments before asserting on behaviour.
 *
 * Without this, a test that forbids a phrase in a RESPONSE also forbids it in
 * the comment explaining why the response avoids it — so documenting a defence
 * would break the test that protects it. Comments describe the code; they are
 * not the code.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function routeSection(start: string, end: string): string {
  const begin = routes.indexOf(start);
  const finish = routes.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `missing route section: ${start}`);
  return codeOnly(routes.slice(begin, finish));
}

test("affiliate handlers keep their own database targets after a merge", () => {
  const apply = routeSection('router.post("/apply"', 'async function provisionalReferralCode');
  assert.match(apply, /from\(affiliates\)\.where\(eq\(affiliates\.email,\s*email\)\)/);

  const enroll = routeSection('router.post("/", requireSuperAdmin', 'router.patch("/:id"');
  assert.match(enroll, /db\.insert\(affiliates\)/);
  assert.doesNotMatch(enroll, /db\.insert\(affiliateCommissions\)/);

  const patch = routeSection('router.patch("/:id"', 'router.post("/:id/approve"');
  const approve = routeSection('router.post("/:id/approve"', 'router.post("/:id/rate"');
  const rate = routeSection('router.post("/:id/rate"', 'router.post("/:id/commissions"');
  for (const section of [patch, approve, rate]) {
    assert.match(section, /db\.update\(affiliates\)/);
    assert.doesNotMatch(section, /db\.update\(affiliatePayouts\)/);
  }

  const reverse = routeSection('router.post("/commissions/:commissionId/reverse"', 'router.post("/cron/maturity-sweep"');
  assert.match(reverse, /db\.update\(affiliateCommissions\)/);
  assert.match(reverse, /eq\(affiliateCommissions\.id,\s*String\(req\.params\.commissionId\)\)/);
  assert.doesNotMatch(reverse, /db\.update\(affiliatePayouts\)/);
});

test("payout preview and report exports retain their distinct data shapes", () => {
  const preview = routeSection('router.get("/payouts/preview"', 'router.post("/payouts"');
  assert.match(preview, /req\.query\.quarter/);
  assert.match(preview, /affiliateRows\s*\.map/);
  assert.match(preview, /assemblePayout\(/);
  assert.doesNotMatch(preview, /req\.body\??\.quarter/);

  const reports = routeSection('router.get("/reports/download"', 'export default router');
  assert.deepEqual(
    [...reports.matchAll(/if \(type === "(affiliates|commissions|payouts|attribution)"\)/g)].map((match) => match[1]),
    ["affiliates", "commissions", "payouts", "attribution"],
  );
  assert.match(reports, /cop-suite-affiliate-commissions-/);
  assert.match(reports, /cop-suite-affiliate-payouts-/);
  assert.match(reports, /cop-suite-affiliate-attribution-/);
});

// ─── Every affiliate route is admin-guarded ──────────────────────────────────

test("exactly one affiliate route is public, and it is the application form", () => {
  // Commission amounts and customer attribution live behind these routes. A
  // handler registered without a guard is a data leak, and the mistake is a
  // one-word omission that reviews miss.
  //
  // "/apply" is the deliberate exception — the programme needs a front door.
  // This test pins the exception to exactly that one path, so a second
  // unguarded route can never be added without failing here.
  const handlers = [...routes.matchAll(/router\.(get|post|patch|delete|put)\(\s*"([^"]*)"\s*,\s*([A-Za-z_$][\w$]*)/g)];
  assert.ok(handlers.length >= 14, `expected the affiliate routes to be present, found ${handlers.length}`);

  const guards = new Set(["requireAnyAdmin", "requireSuperAdmin", "requireCronOrSuperAdmin"]);
  const publicPaths: string[] = [];
  for (const [, method, path, secondArg] of handlers) {
    if (!guards.has(secondArg!)) publicPaths.push(`${method!.toUpperCase()} ${path}`);
  }
  assert.deepEqual(
    publicPaths,
    ["POST /apply"],
    "the ONLY public affiliate route may be the application form",
  );
});

test("the public application form cannot grant anything", () => {
  const apply = routes.slice(routes.indexOf('router.post("/apply"'), routes.indexOf('async function provisionalReferralCode'));

  // An applicant must not choose their own code. A stranger picking "CMS" or
  // "MEDICARE" would hand themselves a code implying endorsement — and codes
  // are permanent, so it could not be cleaned up without orphaning attribution.
  //
  // Asserted as "the request body's referralCode is never read here" rather
  // than "referralCode: is not assigned from the body". The narrower version
  // missed `referralCode: normalize(body.referralCode) || code` — wrapping the
  // read in a function call walked straight past it. The field never being
  // touched is the property that actually holds.
  // Two assertions, because either alone has a hole. The first forbids reading
  // the field from the request at all; the second pins the value written to the
  // column to the server-generated variable. An attempt like
  // `referralCode: normalize(body.referralCode) || assignedCode` fails both —
  // the earlier, narrower check missed exactly that shape.
  assert.doesNotMatch(
    codeOnly(apply),
    /(?:req\.)?body\s*(?:\.\s*referralCode|\[\s*["']referralCode)/,
    "the apply handler must never read a referral code from the request",
  );
  assert.match(
    codeOnly(apply),
    /referralCode:\s*assignedCode\s*,/,
    "the stored code must be the server-generated provisional one, nothing else",
  );
  assert.match(apply, /provisionalReferralCode\(/);

  // Pending, and at 0% — so an unreviewed application cannot quietly earn.
  assert.match(apply, /status:\s*"pending"/);
  assert.match(apply, /commissionRatePct:\s*0/);

  // Status must never be taken from the request body on this endpoint.
  assert.doesNotMatch(apply, /status:\s*(body|req)\./);
});

test("the application form does not reveal who is already in the programme", () => {
  // A distinct "already applied" response would let anyone probe whether a
  // given company or email is an affiliate.
  const apply = codeOnly(routes.slice(routes.indexOf('router.post("/apply"'), routes.indexOf('async function provisionalReferralCode')));
  assert.doesNotMatch(apply, /already (applied|exists|enrolled)/i);
  assert.match(apply, /received:\s*true/);
  // The duplicate-email branch specifically must return the same success shape
  // as a new application. Scoped to that branch — a broader pattern would also
  // match the input-validation 400s above it, which are fine and necessary.
  assert.match(
    apply,
    /if \(existing\) \{\s*return res\.status\(200\)/,
    "a duplicate application must answer 200, identically to a new one",
  );
});

test("the public application endpoint is rate limited", () => {
  // The only unauthenticated write in the API, so the only one a stranger can
  // call in a loop. Unlimited, it buries a real applicant in junk.
  assert.match(app, /app\.use\("\/api\/affiliates\/apply",\s*affiliateApplyLimiter\)/);
  assert.match(app, /const affiliateApplyLimiter = rateLimit\(/);
});

test("a referral code can only be assigned while the affiliate is pending", () => {
  // Changing a live code orphans every account already attributed to it, with
  // no way afterwards to tell which customers were whose.
  const approve = routes.slice(routes.indexOf('router.post("/:id/approve"'), routes.indexOf('router.post("/:id/rate"'));
  assert.match(approve, /row\.status !== "pending"/, "approval must refuse a non-pending affiliate");
  assert.match(approve, /eq\(affiliates\.status,\s*"pending"\)/, "the update must be guarded on status");

  // PATCH must still refuse referralCode outright.
  const patch = routes.slice(routes.indexOf('router.patch("/:id"'), routes.indexOf('router.post("/:id/approve"'));
  assert.doesNotMatch(patch, /referralCode/, "PATCH must never change a referral code");
});

test("every legacy paid activation path checks the reviewed-terms gate", () => {
  const enroll = routes.slice(routes.indexOf('router.post("/", requireSuperAdmin'), routes.indexOf('router.patch("/:id"'));
  const patch = routes.slice(routes.indexOf('router.patch("/:id"'), routes.indexOf('router.post("/:id/approve"'));
  const approve = routes.slice(routes.indexOf('router.post("/:id/approve"'), routes.indexOf('router.post("/:id/rate"'));
  const rate = routes.slice(routes.indexOf('router.post("/:id/rate"'), routes.indexOf('router.post("/:id/commissions"'));
  const manualCommission = routes.slice(routes.indexOf('router.post("/:id/commissions"'), routes.indexOf('router.post("/commissions/:commissionId/reverse"'));
  assert.match(enroll, /status != null && status !== "pending"/);
  assert.match(enroll, /agreementAcceptance != null/);
  assert.match(enroll, /commissionRatePct: 0/);
  assert.match(enroll, /subscriptionFeeWaived: false/);
  assert.doesNotMatch(enroll, /if \(activationBlocked\(res\)\) return;/);
  assert.match(patch, /if \(body\.status === "active"\)/);
  assert.match(patch, /isBlockedAffiliateActivation\(existing\.status, body\.status\)/);
  assert.match(patch, /eq\(affiliates\.status, expectedStatus\)/);
  assert.match(patch, /eq\(affiliates\.agreementIdentityEpoch, expectedEpoch\)/);
  assert.match(patch, /hasReviewedAffiliateAcceptance/);
  assert.match(patch, /currentReviewedAffiliateAcceptanceCondition\(\)/);
  assert.match(approve, /if \(activationBlocked\(res\)\) return;/);
  assert.match(approve, /hasReviewedAffiliateAcceptance\(row\.id\)/);
  assert.match(approve, /currentReviewedAffiliateAcceptanceCondition\(\)/);
  assert.match(approve, /eq\(affiliates\.email, row\.email\)/);
  assert.match(approve, /eq\(affiliates\.agreementIdentityEpoch, row\.agreementIdentityEpoch\)/);
  assert.match(rate, /row\.status === "pending"/);
  assert.match(manualCommission, /row\.status === "pending"/);
  assert.match(routes, /activationEnabled: affiliateActivationEnabled\(\) && await reviewedAffiliateAgreementExists\(\)/);
  const ui = adminUi.slice(adminUi.indexOf("function AffiliateAdminSection("), adminUi.indexOf("function AffiliateApplicationsSection("));
  assert.match(ui, /stats && <button/);
  assert.match(ui, /showEnroll && stats &&/);
  const applicationsUi = adminUi.slice(adminUi.indexOf("function AffiliateApplicationsSection("), adminUi.indexOf("function AdminQuickPanel("));
  assert.match(applicationsUi, /setActivationEnabled\(stats\.activationEnabled === true\)/);
  assert.match(applicationsUi, /isSuperAdmin && activationEnabled && agreementStatus\?\.published && row\.agreementAcceptance && <button/);
  assert.match(applicationsUi, /\/approve`/);
  assert.match(applicationsUi, /agreementAcceptance\.version/);
  assert.match(applicationsUi, /agreementAcceptance\.acceptedAt/);
});

test("agreement acceptance is tied to the applicant identity revision and cannot be replayed after an email change", () => {
  const agreementRoutes = readFileSync(new URL("./affiliate-agreements.ts", import.meta.url), "utf8");
  const agreementState = readFileSync(new URL("../lib/affiliate-agreement-state.ts", import.meta.url), "utf8");
  const agreementSchema = readFileSync(new URL("../../../../lib/db/src/schema/affiliate-agreements.ts", import.meta.url), "utf8");
  const affiliateSchema = readFileSync(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
  assert.match(routes, /patch\.agreementIdentityEpoch = sql`\$\{affiliates\.agreementIdentityEpoch\} \+ 1`/);
  assert.match(agreementRoutes, /for\("update"\)/);
  assert.match(agreementRoutes, /row\.identityEpoch === row\.currentEpoch/);
  assert.match(agreementRoutes, /identityEpoch: row!\.identityEpoch/);
  assert.match(agreementState, /eq\(affiliateAgreementAcceptances\.identityEpoch, affiliates\.agreementIdentityEpoch\)/);
  assert.match(agreementState, /export function currentReviewedAffiliateAcceptanceCondition/);
  assert.match(agreementState, /affiliateAgreementAcceptances\.contentSha256\} = \$\{affiliateAgreements\.contentSha256\}/);
  assert.match(agreementState, /affiliateAgreementAcceptances\.identityEpoch\} = \$\{affiliates\.agreementIdentityEpoch\}/);
  assert.match(agreementSchema, /uniqueIndex\("affiliate_agreement_acceptances_once_idx"\)\.on\(table\.affiliateId, table\.agreementVersion, table\.identityEpoch\)/);
  assert.match(affiliateSchema, /agreementIdentityEpoch: integer\("agreement_identity_epoch"\)/);
});

test("guards are imported from the shared module, not redefined locally", () => {
  // A local copy is how one guard ends up weaker than the other. This is the
  // same failure that produced an unguarded return-URL helper in admin.ts.
  assert.match(routes, /from\s+"\.\.\/lib\/admin-guards\.js"/);
  assert.doesNotMatch(routes, /function\s+require(AnyAdmin|SuperAdmin)/);
});

test("writes that move money require a super-admin, not any admin", () => {
  for (const path of ['"/"', '"/:id/rate"', '"/:id/commissions"', '"/payouts"']) {
    const pattern = new RegExp(`router\\.(post|patch)\\(\\s*${path.replace(/[/$]/g, "\\$&")}\\s*,\\s*requireSuperAdmin`);
    assert.match(routes, pattern, `${path} must be super-admin only`);
  }
});

test("application review and agreement writes retain their server-side super-admin guards", () => {
  const agreements = readFileSync(new URL("./affiliate-agreements.ts", import.meta.url), "utf8");
  for (const path of ['"/:id/approve"', '"/:id/reject"']) {
    assert.match(routes, new RegExp(`router\\.post\\(${path}, requireSuperAdmin`));
  }
  for (const path of ['"/publish"', '"/:affiliateId/invite"']) {
    assert.match(agreements, new RegExp(`router\\.post\\(${path}, requireSuperAdmin`));
  }
  assert.match(routes, /router\.get\("\/", requireAnyAdmin/);
  assert.match(routes, /router\.get\("\/stats", requireAnyAdmin/);
  const applicationsUi = adminUi.slice(adminUi.indexOf("function AffiliateApplicationsSection("), adminUi.indexOf("function AdminQuickPanel("));
  assert.match(applicationsUi, /isSuperAdmin && <button[^>]+onClick=\{\(\) => disapprove\(row\)\}/);
  assert.match(adminUi, /isSuperAdmin=\{accountData\?\.isSuperAdmin === true\}/);
});

// ─── The double-payment defence ──────────────────────────────────────────────

test("the commission ledger has a unique key on the Stripe invoice", () => {
  // Stripe redelivers webhooks. Without this constraint a redelivery pays the
  // affiliate a second time for the same customer payment.
  assert.match(
    schema,
    /stripeInvoiceId:\s*text\("stripe_invoice_id"\)\.unique\(\)/,
    "affiliate_commissions.stripe_invoice_id must be UNIQUE",
  );
});

test("accrual relies on the unique constraint rather than a prior lookup", () => {
  // A check-then-insert loses the race between two concurrent deliveries.
  assert.match(accrual, /23505/, "must catch unique_violation");
  assert.match(accrual, /already-accrued/);
  const insertIndex = accrual.indexOf("db.insert(affiliateCommissions)");
  const catchIndex = accrual.indexOf('error?.code === "23505"');
  assert.ok(insertIndex > 0 && catchIndex > insertIndex, "the 23505 catch must guard the insert");
});

test("a redelivered webhook is not an error", () => {
  // If the duplicate path threw, Stripe would retry forever and the logs would
  // fill with failures for payments that were handled correctly.
  assert.match(accrual, /reason:\s*"already-accrued"/);
});

// ─── The rate is frozen at accrual ───────────────────────────────────────────

test("the commission row stores the rate it accrued at", () => {
  // §12/§13 — commissions properly earned before a rate reduction are not
  // retroactively reduced. That is only possible if the rate lives on the row.
  assert.match(schema, /ratePct:\s*integer\("rate_pct"\)\.notNull\(\)/);
});

test("nothing recalculates a stored commission from the affiliate's current rate", () => {
  // The read paths must SUM stored amounts. A single `computeCommissionUsd`
  // applied to an existing row during a report would silently restate history
  // every time an affiliate's rate changed.
  const reportSection = routes.slice(routes.indexOf("reports/download"));
  assert.doesNotMatch(
    reportSection,
    /computeCommissionUsd/,
    "reports must read commission_usd, never recompute it",
  );
  // The rate-change handler must not touch existing commission rows.
  const rateHandler = routes.slice(routes.indexOf('router.post("/:id/rate"'), routes.indexOf('router.post("/:id/commissions"'));
  assert.doesNotMatch(rateHandler, /update\(affiliateCommissions\)/);
});

// ─── The activity clock (§10) ────────────────────────────────────────────────

test("only a new customer's first payment moves the activity clock", () => {
  // §10 — "Payments received from customers previously referred by Affiliate
  // do not restart, extend, or renew the activity period." A recurring monthly
  // invoice must not keep an otherwise inactive affiliate at 20% forever.
  assert.match(accrual, /recordQualifyingReferralIfFirst/);
  assert.match(accrual, /prior\.length\s*!==\s*1/, "must accrue only on the account's first commission row");
  assert.match(accrual, /lastQualifyingReferralAt/);
});

test("an out-of-order webhook cannot drag the activity clock backwards", () => {
  assert.match(accrual, /current\.getTime\(\)\s*>=\s*paidAt\.getTime\(\)/);
});

// ─── Reversals (§25) ─────────────────────────────────────────────────────────

test("a commission cannot be reversed twice", () => {
  // A second reversal of a paid commission would deduct the same money from
  // the affiliate's next payout twice.
  assert.match(accrual, /isNull\(affiliateCommissions\.reversedAt\)/);
  assert.match(routes, /inArray\(affiliateCommissions\.status,\s*\["pending",\s*"payable",\s*"paid"\]\)/);
});

test("a reversal requires a stated reason", () => {
  const reverseHandler = routes.slice(routes.indexOf('router.post("/commissions/:commissionId/reverse"'));
  assert.match(reverseHandler.slice(0, 800), /A reason is required/);
});

// ─── The webhook cannot break a customer payment ─────────────────────────────

test("affiliate accrual can never fail the payment webhook", () => {
  // The customer's money has already moved. An affiliate bookkeeping error
  // must not make Stripe retry, or make the subscription sync look failed.
  const succeededCase = webhooks.slice(
    webhooks.indexOf('case "invoice.payment_succeeded"'),
    webhooks.indexOf('case "charge.refunded"'),
  );
  assert.ok(succeededCase.length > 0, "the invoice.payment_succeeded case must exist");
  assert.match(succeededCase, /try\s*{/);
  assert.match(succeededCase, /catch\s*\(error\)/);
});

test("refunds and chargebacks both reverse the commission", () => {
  assert.match(webhooks, /case "charge\.refunded":/);
  assert.match(webhooks, /case "charge\.dispute\.created":/);
  assert.match(webhooks, /reverseCommissionForInvoice/);
});

// ─── Payout settlement ───────────────────────────────────────────────────────

test("settling a payout claims commissions with a guarded update", () => {
  // Two operators clicking at once must not both settle the same rows, and the
  // payout total must come from what was actually claimed rather than from the
  // preview.
  const payoutHandler = routes.slice(
    routes.indexOf('router.post("/payouts"'),
    routes.indexOf('router.patch("/payouts/:payoutId"'),
  );
  assert.match(payoutHandler, /eq\(affiliateCommissions\.status,\s*"payable"\)/);
  assert.match(payoutHandler, /\.returning\(\{\s*commissionUsd/);
  assert.match(payoutHandler, /claimed\.map/, "the total must be summed from the claimed rows");
});

test("a quarter cannot be paid twice for the same affiliate", () => {
  assert.match(routes, /A \$\{bounds\.label\} payout already exists/);
});

// ─── The holdback sweep must be reachable by a scheduler ─────────────────────

test("the maturity sweep can be run by an external scheduler", () => {
  // Without something calling this on a schedule, commissions accrue and sit at
  // "pending" forever: every quarterly payout comes out empty and nothing
  // errors. An affiliate simply never gets paid. Requiring an interactive admin
  // login to run it is how that becomes permanent.
  assert.match(
    routes,
    /router\.post\(\s*"\/cron\/maturity-sweep"\s*,\s*requireCronOrSuperAdmin/,
    "the sweep must accept CRON_SECRET, not require an interactive admin",
  );
});

test("the sweep only promotes commissions whose holdback has actually elapsed", () => {
  const sweep = routes.slice(routes.indexOf('router.post("/cron/maturity-sweep"'));
  const body = sweep.slice(0, 1200);
  assert.match(body, /eq\(affiliateCommissions\.status,\s*"pending"\)/);
  assert.match(body, /lt\(affiliateCommissions\.payableAt,\s*now\)/, "§24 — 60 days must have passed");
  assert.doesNotMatch(body, /"paid"/, "the sweep must never mark anything paid");
});

// ─── No bank details anywhere in the schema ──────────────────────────────────

test("the schema stores no bank or card numbers", () => {
  for (const forbidden of [/account_number/i, /routing_number/i, /card_number/i, /\biban\b/i, /\bssn\b/i, /tax_id/i]) {
    assert.doesNotMatch(schema, forbidden, `schema must not contain ${forbidden}`);
  }
  // Tax status is a DATE, never the form itself — a W-9 carries a TIN.
  assert.match(schema, /taxInfoReceivedAt:\s*timestamp/);
});

// ─── §29 — what an affiliate may be shown about a customer ───────────────────

test("customer identifiers are never selected into an affiliate-facing shape", () => {
  // §29 forbids showing an affiliate the customer's Provider Identifier,
  // billing details, users, content or usage. The admin routes may select
  // accounts.ccn; any future portal handler must not.
  const portalSection = routes.includes("/portal/")
    ? routes.slice(routes.indexOf("/portal/"))
    : "";
  assert.doesNotMatch(portalSection, /accounts\.ccn/);
  assert.doesNotMatch(portalSection, /accounts\.stripeCustomerId/);
});
