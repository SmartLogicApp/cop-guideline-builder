import assert from "node:assert/strict";
import test from "node:test";
import {
  hasActiveSubscription,
  hasEffectiveAccess,
  hasUnexpiredComplimentaryAccess,
} from "./subscriptionAccess.ts";

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

test("a Stripe trial scheduled to cancel keeps access only until its trial end", () => {
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-09-07T12:00:00.001Z"),
  }, now), true);
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-09-07T12:00:00.000Z"),
  }, now), false);
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-09-07T11:59:59.999Z"),
  }, now), false);
});

test("a Stripe trial without a mirrored end date fails closed", () => {
  assert.equal(hasActiveSubscription({
    subscriptionStatus: "trialing",
    trialEndsAt: null,
  }, now), false);
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

test("complimentary affiliate access expires at its stored end and preserves legacy indefinite grants", () => {
  assert.equal(hasUnexpiredComplimentaryAccess({
    hasComplimentaryAccess: true,
    complimentaryAccessEndsAt: new Date("2026-09-07T12:00:00.001Z"),
  }, "pending_payment", now), true);
  assert.equal(hasUnexpiredComplimentaryAccess({
    hasComplimentaryAccess: true,
    complimentaryAccessEndsAt: now,
  }, "pending_payment", now), false);
  assert.equal(hasUnexpiredComplimentaryAccess({
    hasComplimentaryAccess: true,
    complimentaryAccessEndsAt: null,
  }, "cancelled", now), true);
});

test("removed accounts do not retain complimentary access", () => {
  assert.equal(hasUnexpiredComplimentaryAccess({
    hasComplimentaryAccess: true,
    complimentaryAccessEndsAt: null,
  }, "removed", now), false);
});