import assert from "node:assert/strict";
import test from "node:test";
import { buildAffiliatePayoutChecklist } from "./affiliate-payout-checklist.ts";

const documents = [
  { id: "privacy-id", documentType: "privacy", title: "Privacy Notice", version: "privacy-v2", content: "Privacy notice contents." },
  { id: "ftc-id", documentType: "ftc_disclosure", title: "FTC Disclosure", version: "ftc-v3", content: "FTC disclosure contents." },
  { id: "marketing-id", documentType: "marketing_guidelines", title: "Marketing Guidelines", version: "marketing-v4", content: "Marketing guidelines contents." },
  { id: "payment-auth-id", documentType: "payment_authorization", title: "Payment Authorization", version: "payment-v1", content: "Payment authorization contents." },
];
const acknowledgements = [
  { documentVersionId: "privacy-id", documentType: "privacy", documentVersion: "privacy-v2", acceptedAt: "2026-01-01T00:00:00.000Z", status: "current" },
  { documentVersionId: "ftc-id", documentType: "ftc_disclosure", documentVersion: "ftc-v3", acceptedAt: "2026-01-02T00:00:00.000Z", status: "current" },
  { documentVersionId: "marketing-id", documentType: "marketing_guidelines", documentVersion: "marketing-v4", acceptedAt: "2026-01-03T00:00:00.000Z", status: "current" },
];
const compliance = {
  country: "US",
  state: "CA",
  taxStatus: "verified_complete",
  stripeConnectedAccountId: "acct_test",
  stripeAccountType: "express",
  stripeOnboardingStatus: "complete",
  stripeDetailsSubmitted: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: [],
  stripeTaxFormLastCheckedAt: "2026-01-04T00:00:00.000Z",
  stripeOnboardingCompletedAt: "2026-01-05T00:00:00.000Z",
  adminApprovalStatus: "pending",
  adminHoldStatus: "none",
};
const agreementAcceptance = {
  agreementVersion: "reviewed-v5",
  acceptedAt: "2025-12-31T00:00:00.000Z",
};

function build(overrides: Record<string, unknown> = {}) {
  return buildAffiliatePayoutChecklist({
    agreementAcceptance,
    publishedDocuments: documents,
    acknowledgements,
    compliance,
    paymentAuthorizationCurrent: true,
    affiliateStatus: "pending",
    payoutEligible: false,
    paymentAuthorizationDocument: documents[3],
    ...overrides,
  } as Parameters<typeof buildAffiliatePayoutChecklist>[0]);
}

test("shared checklist uses signup agreement acceptance and keeps admin approval green by default", () => {
  const checklist = build();
  assert.deepEqual(checklist.items.map(({ key }) => key), [
    "agreement", "privacy", "ftc", "marketing", "tax", "payment", "admin",
  ]);
  assert.equal(checklist.items.length, 7);
  assert.equal(checklist.items[0].complete, true);
  assert.equal(checklist.items[0].version, "reviewed-v5");
  assert.equal(checklist.items[0].completedAt, agreementAcceptance.acceptedAt);
  assert.equal(checklist.items[6].complete, true, "pending admin approval is green until a hold or disapproval");
  assert.equal(checklist.completedCount, 7);
  assert.equal(checklist.header, "0 of 7 steps left", "checklist completion is separate from payout eligibility");
  assert.equal(checklist.payoutEligible, false);
});

test("agreement step stays incomplete without a current reviewed signup acceptance", () => {
  const checklist = build({ agreementAcceptance: null });
  assert.equal(checklist.items[0].complete, false);
  assert.equal(checklist.items[0].version, null);
  assert.equal(checklist.items[0].action?.type, "contact_admin");
});

test("document items require a current matching version and expose an acknowledgement action", () => {
  const result = build({
    acknowledgements: [
      acknowledgements[0],
      { ...acknowledgements[1], documentVersionId: "retired-version-id" },
      { ...acknowledgements[2], documentVersion: "older-version" },
    ],
  });
  assert.equal(result.items[1].complete, true);
  assert.equal(result.items[2].complete, false);
  assert.equal(result.items[2].action?.type, "acknowledge_document");
  assert.equal(result.items[2].action?.label, "I acknowledge");
  assert.equal(result.items[2].action?.documentVersionId, "ftc-id");
  assert.equal(result.items[2].action?.endpoint, "/api/affiliate-compliance/portal/acknowledgements");
  assert.equal(result.items[2].document?.content, "FTC disclosure contents.");
  assert.equal(result.items[3].complete, false);
});

test("tax and payment steps only turn green with current Stripe-completed status", () => {
  const taxPending = build({ compliance: { ...compliance, taxStatus: "submitted_to_stripe" } });
  assert.equal(taxPending.items[4].complete, false);
  assert.equal(taxPending.items[4].action?.type, "set_up_payouts");
  assert.equal(taxPending.items[4].action?.endpoint, "/api/affiliate-compliance/portal/connect");

  const paymentPending = build({ compliance: { ...compliance, stripePayoutsEnabled: false } });
  assert.equal(paymentPending.items[5].complete, false);
  assert.equal(paymentPending.items[5].action?.type, "set_up_payouts");

  const stripeRequirementsDue = build({ compliance: { ...compliance, stripeRequirementsDue: ["individual.address.line1"] } });
  assert.equal(stripeRequirementsDue.items[5].complete, false);
  assert.equal(stripeRequirementsDue.items[5].action?.type, "set_up_payouts");

  const missingAuthorization = build({ paymentAuthorizationCurrent: false });
  assert.equal(missingAuthorization.items[5].complete, false);
  assert.match(missingAuthorization.items[5].message ?? "", /payment authorization/i);
});

test("admin checklist turns red only for a hold or disapproval", () => {
  const held = build({ adminApplicationHeld: true });
  assert.equal(held.items[6].complete, false);
  assert.equal(held.items[6].action?.type, "contact_admin");

  const disapproved = build({ affiliateStatus: "rejected" });
  assert.equal(disapproved.items[6].complete, false);

  const suspended = build({ affiliateStatus: "suspended" });
  assert.equal(suspended.items[6].complete, false);

  const terminated = build({ compliance: { ...compliance, adminApprovalStatus: "terminated" } });
  assert.equal(terminated.items[6].complete, false);

  const payoutHold = build({ activeComplianceHold: true });
  assert.equal(payoutHold.items[6].complete, false);
});