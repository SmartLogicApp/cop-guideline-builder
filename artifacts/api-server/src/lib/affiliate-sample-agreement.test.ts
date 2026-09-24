import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibleReviewedAgreementVersion,
  isSampleAgreementVersion,
  sampleAgreementAvailable,
  SAMPLE_AGREEMENT_BODY,
  SAMPLE_AGREEMENT_VERSION,
} from "./affiliate-sample-agreement.ts";

test("sample text clearly disclaims legal review, enrollment and payout rights", () => {
  assert.match(SAMPLE_AGREEMENT_BODY, /SAMPLE AFFILIATE PARTNER AGREEMENT — PLACEHOLDER ONLY/);
  assert.match(SAMPLE_AGREEMENT_BODY, /has not been reviewed or approved by an attorney/);
  assert.match(SAMPLE_AGREEMENT_BODY, /does not grant commission or payout rights/);
  assert.match(SAMPLE_AGREEMENT_BODY, /NOT FINAL LEGAL COPY/);
  assert.equal(isSampleAgreementVersion(SAMPLE_AGREEMENT_VERSION), true);
});

test("sample acceptance is only exposed in development", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(sampleAgreementAvailable(), true);
    process.env.NODE_ENV = "production";
    assert.equal(sampleAgreementAvailable(), false);
    process.env.NODE_ENV = "test";
    assert.equal(sampleAgreementAvailable(), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("sample versions cannot be selected as attorney-reviewed terms", () => {
  assert.equal(eligibleReviewedAgreementVersion(SAMPLE_AGREEMENT_VERSION), null);
  assert.equal(eligibleReviewedAgreementVersion("sample-v2"), null);
  assert.equal(eligibleReviewedAgreementVersion(" reviewed-v1 "), "reviewed-v1");
  assert.equal(eligibleReviewedAgreementVersion(undefined), null);
});