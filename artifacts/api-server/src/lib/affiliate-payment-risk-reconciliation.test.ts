import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  invoiceRiskDisposition,
} from "./affiliate-payment-risk-rules.ts";
import {
  commissionStatusAfterTransferReversal,
  payoutEligibilityReasons,
} from "./affiliate-compliance-rules.ts";

const complianceWebhook = readFileSync(
  new URL("./affiliate-compliance-webhook.ts", import.meta.url),
  "utf8",
);
const eligibility = readFileSync(
  new URL("./affiliate-payout-eligibility.ts", import.meta.url),
  "utf8",
);
const complianceRoutes = readFileSync(
  new URL("../routes/affiliate-compliance.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../../../lib/db/migrations/0010_affiliate_invoice_payment_risks.sql", import.meta.url),
  "utf8",
);

const fullyEligible = {
  affiliateStatus: "active",
  applicationHeld: false,
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
  adminApprovalStatus: "approved",
  activeHolds: [],
  payableAmount: 125,
  minimumAmount: 100,
};

test("full refunds and lost disputes remain reversed after a transfer reversal", () => {
  for (const risk of [
    { chargeAmountMinor: 10000, cumulativeRefundedMinor: 10000, disputeStatus: "none" },
    { chargeAmountMinor: 10000, cumulativeRefundedMinor: 0, disputeStatus: "lost" },
  ]) {
    const disposition = invoiceRiskDisposition(risk);
    assert.equal(disposition, "full_refund");
    assert.equal(commissionStatusAfterTransferReversal(disposition), "reversed");
  }
});

test("partial refunds and open disputes stay held; only a clear payment can be re-claimed", () => {
  const partial = invoiceRiskDisposition({
    chargeAmountMinor: 10000, cumulativeRefundedMinor: 2500, disputeStatus: "none",
  });
  const dispute = invoiceRiskDisposition({
    chargeAmountMinor: 10000, cumulativeRefundedMinor: 0, disputeStatus: "open",
  });
  const clear = invoiceRiskDisposition({
    chargeAmountMinor: 10000, cumulativeRefundedMinor: 0, disputeStatus: "won",
  });
  assert.equal(commissionStatusAfterTransferReversal(partial), "risk_held");
  assert.equal(commissionStatusAfterTransferReversal(dispute), "risk_held");
  assert.equal(commissionStatusAfterTransferReversal(clear), "payable");
  // The draft path selects payable rows with a NULL payout pointer. Held and
  // reversed claims therefore cannot be silently re-issued.
  assert.notEqual(commissionStatusAfterTransferReversal(partial), "payable");
  assert.notEqual(commissionStatusAfterTransferReversal(dispute), "payable");
  assert.match(complianceRoutes, /eq\(affiliateCommissions\.status,\s*"payable"\)[\s\S]*isNull\(affiliateCommissions\.payoutId\)/);
});

test("an unresolved paid recovery review blocks eligibility and explicit resolution clears the block", () => {
  assert.deepEqual(payoutEligibilityReasons(fullyEligible), []);
  const blocked = payoutEligibilityReasons({
    ...fullyEligible,
    manualRecoveryReviewCount: 1,
  });
  assert.ok(blocked.some((reason) => reason.includes("paid commission recovery review")));
  assert.deepEqual(payoutEligibilityReasons({
    ...fullyEligible,
    manualRecoveryReviewCount: 0,
  }), []);
  assert.match(eligibility, /manualRecoveryReviewRequired,\s*true/);
});

test("transfer reversal consults the invoice risk and preserves historical payout linkage", () => {
  assert.match(complianceWebhook, /affiliateInvoicePaymentRisks[\s\S]*inArray\(affiliateInvoicePaymentRisks\.stripeInvoiceId/);
  assert.match(complianceWebhook, /commissionStatusAfterTransferReversal\(disposition\)/);
  assert.match(complianceWebhook, /status:\s*nextStatus/);
  assert.match(complianceWebhook, /nextStatus === "payable" \? \{ payoutId: null \} : \{\}/);
  assert.match(complianceWebhook, /affiliatePayoutWorkflowCommissions\.payoutWorkflowId,[\s\S]*affiliatePayoutWorkflowCommissions\.status,\s*"paid"\)/);
  assert.doesNotMatch(complianceWebhook, /paidAt:\s*null/);
});

test("Admin recovery review endpoints are guarded, serialized, decisioned, and audited", () => {
  assert.match(complianceRoutes, /router\.get\("\/admin\/payouts\/recovery-reviews",\s*requireAnyAdmin/);
  assert.match(complianceRoutes, /router\.post\("\/admin\/payouts\/recovery-reviews\/:invoiceId\/resolve",\s*requireSuperAdmin/);
  assert.match(complianceRoutes, /decision[\s\S]*\["recovered",\s*"waived"\]/);
  assert.match(complianceRoutes, /for\("update"\)[\s\S]*manualRecoveryReviewRequired/);
  assert.match(complianceRoutes, /commission_recovery_review_resolved/);
  assert.match(complianceRoutes, /manualRecoveryReviewRequired:\s*false/);
});

test("risk migration enforces the same refund bounds and named checks as the schema", () => {
  for (const check of [
    "affiliate_invoice_payment_risks_amount_check",
    "affiliate_invoice_payment_risks_dispute_status_check",
    "affiliate_invoice_payment_risks_prior_status_check",
    "affiliate_payment_risk_events_type_check",
    "affiliate_payment_risk_events_amount_check",
    "affiliate_payment_risk_events_dispute_status_check",
  ]) assert.ok(migration.includes(check), `missing migration constraint ${check}`);
  assert.match(migration, /cumulative_refunded_minor\s*<=\s*charge_amount_minor/);
});