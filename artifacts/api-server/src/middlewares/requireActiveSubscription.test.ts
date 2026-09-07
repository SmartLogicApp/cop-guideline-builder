import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveSubscription } from "./subscriptionAccess.ts";

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