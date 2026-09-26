import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveSubscription, hasEffectiveAccess } from "./subscriptionAccess.ts";

const now = new Date("2026-09-07T12:00:00.000Z");

test("active subscriptions have access", () => {
  assert.equal(hasActiveSubscription({ subscriptionStatus: "active", trialEndsAt: null }, now), true);
});

test("unexpired trials have access", () => {
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-09-07T12:00:00.001Z"),
  }, now), true);
});

test("expired trials do not have access", () => {
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-09-07T12:00:00.000Z"),
  }, now), false);
});

test("missing accounts and inactive subscription states do not have access", () => {
  assert.equal(hasActiveSubscription(null, now), false);
  assert.equal(hasActiveSubscription({ subscriptionStatus: "cancelled", trialEndsAt: null }, now), false);
  assert.equal(hasActiveSubscription({ subscriptionStatus: "trial", trialEndsAt: null }, now), false);
});

test("direct customers awaiting Stripe checkout do not have access", () => {
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
  }, now), false);
});

test("active platform admins bypass an expired subscription", () => {
  assert.equal(hasEffectiveAccess({
    isAdminUser: true,
    hasComplimentaryAccess: false,
    account: { subscriptionStatus: "trial", trialEndsAt: now },
    now,
  }), true);
});

test("admin-selected users bypass an expired subscription without becoming admins", () => {
  assert.equal(hasEffectiveAccess({
    isAdminUser: false,
    hasComplimentaryAccess: true,
    account: { subscriptionStatus: "cancelled", trialEndsAt: null },
    now,
  }), true);
});

test("ordinary users still require an active subscription or trial", () => {
  assert.equal(hasEffectiveAccess({
    isAdminUser: false,
    hasComplimentaryAccess: false,
    account: { subscriptionStatus: "cancelled", trialEndsAt: null },
    now,
  }), false);
});