import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { payoutEligibilityReasons, shouldApplyTransferWebhook } from "./affiliate-compliance-rules.ts";
import { verifyAffiliateConnectWebhook } from "./affiliate-compliance-webhook-signature.ts";

const fullyEligible = {
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
  stripeRequirementsDue: [],
  paymentAuthorizationAccepted: true,
  applicationHeld: false,
  adminApprovalStatus: "approved",
  activeHolds: [],
  payableAmount: 125,
  minimumAmount: 100,
};

test("a new US affiliate is blocked with missing documents and payment setup", () => {
  const reasons = payoutEligibilityReasons({
    ...fullyEligible, agreementAccepted: false, privacyAccepted: false,
    ftcAccepted: false, marketingAccepted: false, taxStatus: "not_started",
    stripeConnected: false, stripeDetailsSubmitted: false, stripePayoutsEnabled: false,
    paymentAuthorizationAccepted: false, adminApprovalStatus: "pending", payableAmount: 0,
  });
  assert.ok(reasons.some((reason) => reason.includes("Affiliate Partner Agreement")));
  assert.ok(reasons.some((reason) => reason.includes("Stripe Express")));
  assert.ok(reasons.some((reason) => reason.includes("tax information")));
  assert.ok(reasons.some((reason) => reason.includes("minimum")));
});

test("acceptances do not bypass missing tax verification or Stripe payment setup", () => {
  const reasons = payoutEligibilityReasons({
    ...fullyEligible, taxStatus: "submitted_to_stripe",
    stripeConnected: false, stripeDetailsSubmitted: false, stripePayoutsEnabled: false,
  });
  assert.ok(reasons.some((reason) => reason.includes("tax information")));
  assert.ok(reasons.some((reason) => reason.includes("Stripe Express")));
  assert.equal(reasons.some((reason) => reason.includes("acknowledgement")), false);
});

test("all required checks, threshold, and payout hold jointly control eligibility", () => {
  assert.deepEqual(payoutEligibilityReasons(fullyEligible), []);
  const held = payoutEligibilityReasons({ ...fullyEligible, activeHolds: [{ holdType: "fraud", reason: "review" }] });
  assert.ok(held.some((reason) => reason.includes("fraud hold")));
  assert.ok(payoutEligibilityReasons({ ...fullyEligible, ftcAccepted: false }).some((reason) => reason.includes("FTC")));
  assert.ok(payoutEligibilityReasons({ ...fullyEligible, country: "CA" }).some((reason) => reason.includes("International")));
  assert.ok(payoutEligibilityReasons({ ...fullyEligible, payableAmount: 99.99 }).some((reason) => reason.includes("$100 minimum")));
});

test("reviewed agreement, completed Stripe setup, and the activation gate control eligibility", () => {
  // All other checks pass in this fixture; the sample agreement never supplies
  // agreementAccepted because only a reviewed-version acceptance can set it.
  for (const agreementAccepted of [false, true]) {
    for (const stripeComplete of [false, true]) {
      for (const adminApprovalStatus of ["pending", "approved", "rejected", "suspended", "terminated"]) {
        const reasons = payoutEligibilityReasons({
          ...fullyEligible,
          agreementAccepted,
          stripeConnected: stripeComplete,
          stripeDetailsSubmitted: stripeComplete,
          stripePayoutsEnabled: stripeComplete,
          stripeOnboardingStatus: stripeComplete ? "complete" : "action_required",
          adminApprovalStatus,
        });
        const approvalAllowed = ["pending", "approved"].includes(adminApprovalStatus);
        assert.equal(reasons.length === 0, agreementAccepted && stripeComplete && approvalAllowed);
        assert.equal(reasons.some((reason) => reason.includes("Affiliate Partner Agreement")), !agreementAccepted);
        assert.equal(reasons.some((reason) => reason.includes("Stripe Express")), !stripeComplete);
        assert.equal(reasons.some((reason) => reason.includes("Admin approval")), !approvalAllowed);
      }
    }
  }
  assert.ok(payoutEligibilityReasons({ ...fullyEligible, affiliateStatus: "pending" })
    .some((reason) => reason.includes("Affiliate account must be active")));
});

test("application holds and outstanding Stripe requirements still block payouts", () => {
  const held = payoutEligibilityReasons({ ...fullyEligible, applicationHeld: true });
  assert.ok(held.some((reason) => reason.includes("application is on hold")));

  const requirementsDue = payoutEligibilityReasons({
    ...fullyEligible, stripeRequirementsDue: ["individual.address.line1"],
  });
  assert.ok(requirementsDue.some((reason) => reason.includes("Stripe Express")));
});

test("Connect transfer webhook transitions are idempotent", () => {
  assert.equal(shouldApplyTransferWebhook("payout_processing", "transfer.created"), true);
  assert.equal(shouldApplyTransferWebhook("paid", "transfer.created"), false);
  assert.equal(shouldApplyTransferWebhook("paid", "transfer.reversed"), true);
  assert.equal(shouldApplyTransferWebhook("reversed", "transfer.reversed"), false);
  assert.equal(shouldApplyTransferWebhook("approved_for_payout", "transfer.created"), false);
});

test("Connect webhook requires the separate signature secret and rejects invalid signatures", () => {
  const priorEnv = {
    nodeEnv: process.env.NODE_ENV,
    webhookSecret: process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET,
  };
  process.env.NODE_ENV = "test";
  process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = "whsec_affiliate_test";
  const body = Buffer.from(JSON.stringify({ id: "evt_test", object: "event", type: "account.updated", data: { object: { id: "acct_test" } } }));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "whsec_affiliate_test")
    .update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
  const event = verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=${signature}`);
  assert.equal(event.id, "evt_test");
  assert.throws(() => verifyAffiliateConnectWebhook(body, `t=${timestamp},v1=invalid`));
  if (priorEnv.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorEnv.nodeEnv;
  if (priorEnv.webhookSecret === undefined) delete process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET;
  else process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET = priorEnv.webhookSecret;
});

test("payout sends reuse a database-unique idempotency key", async () => {
  const route = await readFile(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../../lib/db/src/schema/affiliate-compliance.ts", import.meta.url), "utf8");
  assert.match(route, /idempotencyKey: locked\.idempotencyKey/);
  assert.match(schema, /uniqueIndex\("affiliate_payout_workflow_idempotency_uidx"\)\.on\(table\.idempotencyKey\)/);
  assert.match(route, /req\.body\?\.confirmed !== true/);
});