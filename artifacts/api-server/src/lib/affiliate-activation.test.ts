import assert from "node:assert/strict";
import test from "node:test";
import { affiliateActivationEnabled, isBlockedAffiliateActivation } from "./affiliate-activation.ts";

test("new paid affiliate activations fail closed without both owner settings", () => {
  assert.equal(affiliateActivationEnabled({}), false);
  assert.equal(affiliateActivationEnabled({ AFFILIATE_ACTIVATION_ENABLED: "true" }), false);
  assert.equal(affiliateActivationEnabled({ AFFILIATE_REVIEWED_TERMS_VERSION: "reviewed-v1" }), false);
  assert.equal(affiliateActivationEnabled({
    AFFILIATE_ACTIVATION_ENABLED: "TRUE",
    AFFILIATE_REVIEWED_TERMS_VERSION: "reviewed-v1",
  }), false);
  assert.equal(affiliateActivationEnabled({
    AFFILIATE_ACTIVATION_ENABLED: "true",
    AFFILIATE_REVIEWED_TERMS_VERSION: "  ",
  }), false);
  assert.equal(affiliateActivationEnabled({
    AFFILIATE_ACTIVATION_ENABLED: "true",
    AFFILIATE_REVIEWED_TERMS_VERSION: "reviewed-v1",
  }), true);
});

test("only a transition into active is blocked while terms are unreviewed", () => {
  for (const status of ["pending", "suspended", "terminated"]) {
    assert.equal(isBlockedAffiliateActivation(status, "active", false), true);
    assert.equal(isBlockedAffiliateActivation(status, "active", true), false);
  }
  assert.equal(isBlockedAffiliateActivation("active", "active", false), false);
  assert.equal(isBlockedAffiliateActivation("active", "suspended", false), false);
  assert.equal(isBlockedAffiliateActivation("pending", "pending", false), false);
});