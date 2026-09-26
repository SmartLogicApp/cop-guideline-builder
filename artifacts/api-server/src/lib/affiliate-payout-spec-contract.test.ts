import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { payoutEligibilityReasons } from "./affiliate-compliance-rules.ts";
import { stripeTaxStatus } from "./affiliate-connect-tax.ts";
import { verifyAffiliateConnectWebhook } from "./affiliate-compliance-webhook-signature.ts";
import {
  assertAffiliatePayoutSendingEnabled, getStripeConnectLivemode, getStripeConnectSecretKey,
  isAffiliateConnectLiveEnabled, isAffiliateLivePayoutsEnabled,
} from "../stripeClient.ts";

const libDir = new URL("./", import.meta.url);
const read = (path: string) => readFile(new URL(path, libDir), "utf8");

const eligibleFacts = {
  affiliateStatus: "active",
  country: "US",
  state: "CA",
  agreementAccepted: true,
  privacyAccepted: true,
  ftcAccepted: true,
  marketingAccepted: true,
  taxStatus: "verified_complete",
  stripeConnected: true,
  stripeAccountType: "express",
  stripeOnboardingStatus: "complete",
  stripeDetailsSubmitted: true,
  stripePayoutsEnabled: true,
  paymentAuthorizationAccepted: true,
  adminApprovalStatus: "approved",
  activeHolds: [],
  payableAmount: 125,
  minimumAmount: 100,
};

test("I.1 new US affiliate with no documents or Stripe setup is ineligible", () => {
  const reasons = payoutEligibilityReasons({
    ...eligibleFacts,
    affiliateStatus: "pending",
    agreementAccepted: false,
    privacyAccepted: false,
    ftcAccepted: false,
    marketingAccepted: false,
    taxStatus: "not_started",
    stripeConnected: false,
    stripeDetailsSubmitted: false,
    stripePayoutsEnabled: false,
    paymentAuthorizationAccepted: false,
    adminApprovalStatus: "pending",
    payableAmount: 0,
  });

  assert.ok(reasons.some((reason) => reason.includes("Affiliate Partner Agreement")));
  assert.ok(reasons.some((reason) => reason.includes("Privacy Notice")));
  assert.ok(reasons.some((reason) => reason.includes("FTC")));
  assert.ok(reasons.some((reason) => reason.includes("Marketing")));
  assert.ok(reasons.some((reason) => reason.includes("tax information")));
  assert.ok(reasons.some((reason) => reason.includes("Stripe Express")));
  assert.ok(reasons.some((reason) => reason.includes("minimum")));
});

test("I.2 document and payment authorizations alone do not satisfy tax or Stripe requirements", () => {
  const reasons = payoutEligibilityReasons({
    ...eligibleFacts,
    taxStatus: "submitted_to_stripe",
    stripeConnected: false,
    stripeDetailsSubmitted: false,
    stripePayoutsEnabled: false,
  });

  assert.ok(reasons.some((reason) => reason.includes("tax information must be verified")));
  assert.ok(reasons.some((reason) => reason.includes("Stripe Express")));
  assert.equal(reasons.some((reason) => reason.includes("acknowledgement")), false);
});

test("I.3 Stripe onboarding alone does not prove tax ID status; account flags drive it independently", async () => {
  const withUnverifiedTax = payoutEligibilityReasons({
    ...eligibleFacts,
    taxStatus: "submitted_to_stripe",
  });
  assert.ok(withUnverifiedTax.some((reason) => reason.includes("tax information must be verified")));

  const webhook = await read("../lib/affiliate-compliance-webhook.ts");
  const accountUpdateBranch = webhook.slice(webhook.indexOf('if (event.type === "account.updated")'), webhook.indexOf('if (event.type !== "transfer.created"'));
  assert.match(accountUpdateBranch, /stripeOnboardingStatus:\s*complete\s*\?\s*"complete"/);
  assert.match(accountUpdateBranch, /taxStatus:\s*currentStatus\?\.country/);
  assert.match(accountUpdateBranch, /stripeTaxStatus\(account\)/);
  assert.doesNotMatch(accountUpdateBranch, /account\.(?:individual|company)\?\.(?:id_number|tax_id)\b/);
});

test("I.4 affiliate is eligible only when every required condition is complete", () => {
  assert.deepEqual(payoutEligibilityReasons(eligibleFacts), []);
  for (const facts of [
    { ...eligibleFacts, affiliateStatus: "pending" },
    { ...eligibleFacts, agreementAccepted: false },
    { ...eligibleFacts, adminApprovalStatus: "pending" },
    { ...eligibleFacts, taxStatus: "manual_review_required" },
    { ...eligibleFacts, stripeAccountType: "standard" },
    { ...eligibleFacts, stripeOnboardingStatus: "action_required" },
    { ...eligibleFacts, stripeDetailsSubmitted: false },
    { ...eligibleFacts, stripePayoutsEnabled: false },
    { ...eligibleFacts, paymentAuthorizationAccepted: false },
    { ...eligibleFacts, payableAmount: 99.99 },
  ]) {
    assert.notDeepEqual(payoutEligibilityReasons(facts), [], `Expected blocking reasons for ${JSON.stringify(facts)}`);
  }
});

test("I.5 an active compliance or payout hold blocks an otherwise eligible affiliate", () => {
  const reasons = payoutEligibilityReasons({
    ...eligibleFacts,
    activeHolds: [{ holdType: "fraud", reason: "review in progress" }],
  });
  assert.ok(reasons.includes("fraud hold: review in progress"));
});

test("I.6 new FTC or marketing versions require current-version acknowledgement", async () => {
  assert.ok(payoutEligibilityReasons({ ...eligibleFacts, ftcAccepted: false }).some((reason) => reason.includes("FTC")));
  assert.ok(payoutEligibilityReasons({ ...eligibleFacts, marketingAccepted: false }).some((reason) => reason.includes("Marketing")));

  const eligibility = await read("../lib/affiliate-payout-eligibility.ts");
  assert.match(eligibility, /accepted\.documentVersionId\s*===\s*current\.id/);
  assert.match(eligibility, /acceptedPaymentAuthorization\.authorizationDocumentVersionId\s*===\s*currentPaymentAuthorizationDoc\.id/);
});

test("I.7 international affiliate is explicitly blocked from payouts", () => {
  const reasons = payoutEligibilityReasons({ ...eligibleFacts, country: "CA" });
  assert.ok(reasons.some((reason) => reason.includes("International review required")));
});

test("I.8 affiliate portal and Admin routes enforce server-side authentication and authorization", async () => {
  const routes = await read("../routes/affiliate-compliance.ts");
  assert.match(routes, /async function requireAffiliate[\s\S]*?if \(!auth\?\.userId\)[\s\S]*?res\.status\(401\)/);
  assert.match(routes, /router\.get\("\/portal",\s*requireAffiliate/);
  assert.match(routes, /router\.get\("\/admin",\s*requireAnyAdmin/);
  assert.match(routes, /router\.post\("\/admin\/payouts\/:id\/send",\s*requireSuperAdmin/);
});

test("I.9 affiliate portal records and actions are scoped to the authenticated affiliate", async () => {
  const routes = await read("../routes/affiliate-compliance.ts");
  assert.match(routes, /req\.affiliateId\s*=\s*affiliate\.id/);
  assert.match(routes, /affiliate\.email\.toLowerCase\(\)\s*!==\s*email/);
  assert.match(routes, /affiliate\.clerkUserId\s*!==\s*auth\.userId/);
  assert.match(routes, /router\.get\("\/portal",\s*requireAffiliate/);
  assert.match(routes, /eq\(affiliateDocumentAcknowledgements\.affiliateId,\s*affiliateId\)/);
  assert.match(routes, /eq\(affiliatePaymentAuthorizations\.affiliateId,\s*affiliateId\)/);
  assert.match(routes, /eq\(affiliateDocumentAcknowledgements\.affiliateId,\s*req\.affiliateId\)/);
});

test("I.10 sensitive tax and bank values are absent from stored fields and Admin response projections", async () => {
  const schema = await read("../../../../lib/db/src/schema/affiliate-compliance.ts");
  const schemaCode = schema.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(schemaCode, /\b(?:ssn|ein|tin|bankAccountNumber|routingNumber|w9Pdf|stripeSecretKey|webhookSecret)\s*:/i);
  assert.match(schemaCode, /stripeConnectedAccountId:\s*text/);
  assert.match(schemaCode, /taxStatus:\s*text/);

  const routes = await read("../routes/affiliate-compliance.ts");
  const adminDetail = routes.slice(routes.indexOf('router.get("/admin/:id"'), routes.indexOf('router.post("/admin/:id/action"'));
  assert.match(adminDetail, /db\.select\(\)\.from\(affiliateComplianceStatus\)/);
  assert.match(adminDetail, /compliance:\s*status\s*\?\?\s*null/);
  assert.doesNotMatch(adminDetail, /\b(?:ssn|ein|tin|bankAccountNumber|routingNumber|w9Pdf|stripeSecretKey|webhookSecret)\b/i);
});

test("I.10a only Stripe's correct business-type flag with cleared tax requirements verifies tax", () => {
  const status = (account: object) => stripeTaxStatus(account as Parameters<typeof stripeTaxStatus>[0]);
  const clear = { currently_due: [], past_due: [], pending_verification: [], eventually_due: [], errors: [] };
  const individual = { business_type: "individual", individual: { id_number_provided: true }, requirements: clear };
  const company = { business_type: "company", company: { tax_id_provided: true }, requirements: clear };
  assert.equal(status(individual), "verified_complete");
  assert.equal(status(company), "verified_complete");
  assert.equal(status({ business_type: "company", company: { tax_id_provided: true } }), "submitted_to_stripe");
  assert.equal(status({ ...individual, individual: { id_number_provided: false }, details_submitted: true, payouts_enabled: true }), "not_started");
  assert.equal(status({ ...company, company: { tax_id_provided: false }, details_submitted: true, payouts_enabled: true }), "not_started");
  assert.equal(status({ ...individual, company: { tax_id_provided: true }, individual: { id_number_provided: false } }), "not_started");
  assert.equal(status({ ...company, individual: { id_number_provided: true }, company: { tax_id_provided: false } }), "not_started");
  assert.equal(status({ business_type: "non_profit", individual: { id_number_provided: true }, company: { tax_id_provided: true } }), "not_started");
  for (const requirement of ["individual.id_number", "individual.ssn_last_4", "company.tax_id"]) {
    for (const field of ["currently_due", "past_due", "pending_verification", "eventually_due"] as const) {
      assert.equal(status({ ...individual, requirements: { ...clear, [field]: [requirement] } }), "submitted_to_stripe");
      assert.equal(status({ ...company, requirements: { ...clear, [field]: [requirement] } }), "submitted_to_stripe");
    }
  }
  assert.equal(status({ ...company, requirements: { ...clear, errors: [{ requirement: "company.tax_id" }] } }), "submitted_to_stripe");
  assert.equal(status({ ...company, requirements: { ...clear, currently_due: ["company.address.line1"] } }), "verified_complete");
});

test("I.10b tax sync and webhook persist only status flags and reject manual tax overrides", async () => {
  const routes = await read("../routes/affiliate-compliance.ts");
  const webhook = await read("../lib/affiliate-compliance-webhook.ts");
  const tax = await read("affiliate-connect-tax.ts");
  assert.match(routes, /taxStatus:\s*status\.country\s*===\s*"US"/);
  assert.match(routes, /if \(previous\?\.accountId && !previous\.taxCheckedAt\)[\s\S]*?synchronizeStripeAccount\(affiliateId\)/);
  assert.match(webhook, /event\.livemode/);
  assert.match(routes, /getStripeConnectClient\(\)/);
  assert.doesNotMatch(routes, /"verify_tax"|"tax_submitted"|"tax_manual_review"/);
  assert.doesNotMatch(tax, /account\.(?:individual|company)\?\.(?:id_number|tax_id)\b/);
  assert.doesNotMatch(webhook, /(?:individual|company)\?\.(?:id_number|tax_id)\b/);
  assert.doesNotMatch(routes, /\bdiagnostic\b/);
});

test("I.11 modern and legacy payout operations re-check eligibility before payout state changes", async () => {
  const modern = await read("../routes/affiliate-compliance.ts");
  const legacy = await read("../routes/affiliates.ts");

  const draft = modern.slice(modern.indexOf('router.post("/admin/payouts/draft"'), modern.indexOf('router.post("/admin/payouts/:id/approve"'));
  const approve = modern.slice(modern.indexOf('router.post("/admin/payouts/:id/approve"'), modern.indexOf('router.post("/admin/payouts/:id/void"'));
  const send = modern.slice(modern.indexOf('router.post("/admin/payouts/:id/send"'));
  const sharedDraft = modern.slice(modern.indexOf("async function createReviewedDraft"), modern.indexOf("function completedQuarter"));
  assert.match(draft, /createReviewedDraft\(affiliateId,\s*start,\s*end,\s*false\)/);
  assert.match(sharedDraft, /calculateAffiliatePayoutEligibility\(affiliateId,\s*tx\)/);
  assert.match(sharedDraft, /if \(!eligibility\.eligible\)/);
  assert.match(approve, /calculateAffiliatePayoutEligibility\(payout\.affiliateId,\s*tx\)/);
  assert.match(send, /const \[locked\]\s*=\s*await tx\.select\(\)\.from\(affiliatePayoutWorkflow\)[\s\S]*?for\("update"\)/);
  assert.match(send, /calculateAffiliatePayoutEligibility\(payout\.affiliateId,\s*tx\)/);
  assert.match(send, /if \(!eligibility\.eligible\)/);
  assert.match(send, /auditBlockedPayoutAttempt/);
  assert.ok(send.indexOf("if (!eligibility.eligible)") < send.indexOf("stripe.transfers.create"));

  const legacyCreate = legacy.slice(legacy.indexOf('router.post("/payouts"'), legacy.indexOf('router.patch("/payouts/:payoutId"'));
  const legacyUpdate = legacy.slice(legacy.indexOf('router.patch("/payouts/:payoutId"'), legacy.indexOf('router.get("/reports/download"'));
  assert.match(legacyCreate, /calculateAffiliatePayoutEligibility\(affiliateId\)/);
  assert.match(legacyCreate, /if \(!eligibility\.eligible\)/);
  assert.match(legacyUpdate, /calculateAffiliatePayoutEligibility\(existing\.affiliateId\)/);
  assert.match(legacyUpdate, /if \(!eligibility\.eligible\)/);
});

test("I.12 Connect webhook signature is verified and terminal transfer replays are no-ops", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET;
  try {
    process.env.NODE_ENV = "test";
    process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = "whsec_contract_test_only";
    const body = Buffer.from(JSON.stringify({
      id: "evt_contract_test",
      object: "event",
      type: "transfer.created",
      data: { object: { id: "tr_contract_test" } },
    }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", "whsec_contract_test_only")
      .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
    const verified = verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=${digest}`);
    assert.equal(verified.id, "evt_contract_test");
    assert.throws(() => verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=invalid`));

    const app = await read("../app.ts");
    assert.match(app, /express\.raw\(\{\s*type:\s*"application\/json"\s*\}\)/);
    assert.match(app, /verifyAffiliateConnectWebhook\(req\.body as Buffer,\s*signedValue\)/);
    const handler = await read("../lib/affiliate-compliance-webhook.ts");
    assert.match(handler, /stripe\.transfers\.retrieve\(eventTransfer\.id\)/);
    assert.match(handler, /transfer\.id !== eventTransfer\.id \|\| transfer\.livemode !== getStripeConnectLivemode\(\)/);
    assert.match(handler, /where\(eq\(affiliatePayoutWorkflow\.stripeTransferId,\s*transfer\.id\)\)\.for\("update"\)/);
    assert.match(handler, /payout\.id !== workflowId \|\| payout\.affiliateId !== metadataAffiliateId/);
    assert.match(handler, /transfer\.amount !== Math\.round\(Number\(payout\.netPayoutAmount\) \* 100\)/);
    assert.match(handler, /stripeEventId'`\,\s*event\.id/);
    assert.match(handler, /affiliatePayoutWorkflowCommissions\.payoutWorkflowId,\s*payout\.id/);
    assert.match(handler, /affiliatePayoutWorkflowCommissions\.affiliateId,\s*payout\.affiliateId/);
    assert.match(handler, /claims\.some\(\(claim\) => !\["paid", "claimed"\]\.includes\(claim\.status\)\)/);
    assert.match(handler, /amountCents === transfer\.amount/);
    assert.match(handler, /ledgerRows\.length === claims\.length/);
    assert.match(handler, /row\.affiliateId === payout\.affiliateId[\s\S]*?row\.payoutId === payout\.id[\s\S]*?Number\(row\.amount\)[\s\S]*?Number\(claim\.commissionAmount\)/);

    const transferCreatedBranch = handler.slice(handler.indexOf('if (event.type === "transfer.created")'), handler.indexOf('} else if (transfer.reversed'));
    assert.match(transferCreatedBranch, /payout\.payoutStatus !== "paid"/);
    assert.match(transferCreatedBranch, /claims\.every\(\(claim\) => claim\.status === "paid"\)/);
    assert.doesNotMatch(transferCreatedBranch, /tx\.update/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET;
    else process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = previousSecret;
  }
});

test("Connect production mode selects only live secrets and requires separate onboarding and payout flags", () => {
  const oldEnv = {
    nodeEnv: process.env.NODE_ENV,
    testKey: process.env.STRIPE_TEST_SECRET_KEY,
    liveKey: process.env.STRIPE_LIVE_SECRET_KEY,
    connectEnabled: process.env.AFFILIATE_CONNECT_LIVE_ENABLED,
    payoutsEnabled: process.env.AFFILIATE_LIVE_PAYOUTS_ENABLED,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_TEST_SECRET_KEY = "sk_test_never_fallback";
    delete process.env.STRIPE_LIVE_SECRET_KEY;
    assert.throws(() => getStripeConnectSecretKey(), /STRIPE_LIVE_SECRET_KEY/);
    process.env.STRIPE_LIVE_SECRET_KEY = "sk_live_mode_matrix";
    assert.equal(getStripeConnectSecretKey(), "sk_live_mode_matrix");
    process.env.AFFILIATE_CONNECT_LIVE_ENABLED = "false";
    process.env.AFFILIATE_LIVE_PAYOUTS_ENABLED = "false";
    assert.equal(getStripeConnectLivemode(), true);
    assert.equal(isAffiliateConnectLiveEnabled(), false);
    assert.equal(isAffiliateLivePayoutsEnabled(), false);
    assert.throws(() => assertAffiliatePayoutSendingEnabled(), /Live affiliate Connect is disabled/);
    process.env.AFFILIATE_CONNECT_LIVE_ENABLED = "true";
    assert.throws(() => assertAffiliatePayoutSendingEnabled(), /Live affiliate payouts are disabled/);
    process.env.AFFILIATE_LIVE_PAYOUTS_ENABLED = "true";
    assert.doesNotThrow(() => assertAffiliatePayoutSendingEnabled());

    process.env.NODE_ENV = "test";
    assert.equal(getStripeConnectLivemode(), false);
    assert.equal(getStripeConnectSecretKey(), "sk_test_never_fallback");
    assert.doesNotThrow(() => assertAffiliatePayoutSendingEnabled());
    process.env.STRIPE_TEST_SECRET_KEY = "";
    assert.throws(() => assertAffiliatePayoutSendingEnabled(), /not configured/);
  } finally {
    if (oldEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv.nodeEnv;
    if (oldEnv.testKey === undefined) delete process.env.STRIPE_TEST_SECRET_KEY;
    else process.env.STRIPE_TEST_SECRET_KEY = oldEnv.testKey;
    if (oldEnv.liveKey === undefined) delete process.env.STRIPE_LIVE_SECRET_KEY;
    else process.env.STRIPE_LIVE_SECRET_KEY = oldEnv.liveKey;
    if (oldEnv.connectEnabled === undefined) delete process.env.AFFILIATE_CONNECT_LIVE_ENABLED;
    else process.env.AFFILIATE_CONNECT_LIVE_ENABLED = oldEnv.connectEnabled;
    if (oldEnv.payoutsEnabled === undefined) delete process.env.AFFILIATE_LIVE_PAYOUTS_ENABLED;
    else process.env.AFFILIATE_LIVE_PAYOUTS_ENABLED = oldEnv.payoutsEnabled;
  }
});

test("production Connect webhook signature verification requires its dedicated live secret", () => {
  const oldEnv = {
    nodeEnv: process.env.NODE_ENV,
    testSecret: process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET,
    liveSecret: process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = "whsec_test_must_not_fallback";
    process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET = "whsec_live_connect_contract";
    const body = Buffer.from(JSON.stringify({
      id: "evt_live_connect_contract",
      object: "event",
      type: "transfer.created",
      data: { object: { id: "tr_live_contract" } },
    }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", "whsec_live_connect_contract")
      .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
    assert.equal(
      verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=${digest}`).id,
      "evt_live_connect_contract",
    );
    delete process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET;
    assert.throws(() => verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=${digest}`), /live webhook secret/);
  } finally {
    if (oldEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv.nodeEnv;
    if (oldEnv.testSecret === undefined) delete process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET;
    else process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = oldEnv.testSecret;
    if (oldEnv.liveSecret === undefined) delete process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET;
    else process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET = oldEnv.liveSecret;
  }
});

test("I.13 payout creation rejects duplicates and Stripe sends reuse the persisted idempotency key", async () => {
  const routes = await read("../routes/affiliate-compliance.ts");
  const legacy = await read("../routes/affiliates.ts");
  const schema = await read("../../../../lib/db/src/schema/affiliate-compliance.ts");
  const send = routes.slice(routes.indexOf('router.post("/admin/payouts/:id/send"'));

  assert.match(routes, /existingDrafts[\s\S]*?activeDrafts[\s\S]*?A payout already exists/);
  assert.match(schema, /uniqueIndex\("affiliate_payout_workflow_idempotency_uidx"\)\.on\(table\.idempotencyKey\)/);
  assert.match(send, /idempotencyKey:\s*locked\.idempotencyKey/);
  assert.match(legacy, /A \$\{bounds\.label\} payout already exists for this affiliate/);
});