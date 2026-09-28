import assert from "node:assert/strict";
import test from "node:test";
import { affiliateActivationEnabled, isBlockedAffiliateActivation } from "./affiliate-activation.ts";

test("affiliate activation no longer depends on an environment-variable pause", () => {
  assert.equal(affiliateActivationEnabled({}), true);
  assert.equal(affiliateActivationEnabled({ AFFILIATE_ACTIVATION_ENABLED: "false" }), true);
  assert.equal(affiliateActivationEnabled({ AFFILIATE_REVIEWED_TERMS_VERSION: "  " }), true);
});

test("affiliate status transitions are never feature-paused", () => {
  for (const status of ["pending", "suspended", "terminated"]) {
    assert.equal(isBlockedAffiliateActivation(status, "active", false), false);
    assert.equal(isBlockedAffiliateActivation(status, "active", true), false);
  }
  assert.equal(isBlockedAffiliateActivation("active", "active", false), false);
  assert.equal(isBlockedAffiliateActivation("active", "suspended", false), false);
  assert.equal(isBlockedAffiliateActivation("pending", "pending", false), false);
});