import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseCanonicalStripeSubscription,
  isAuthorizedPostRemovalCheckout,
  isFacilityBillingAdmin,
  isStaleForStripeReconciliation,
  reconcileStripeSubscriptionSet,
  subscriptionLifecycleHttpStatus,
} from "./subscription-lifecycle-rules.ts";
import { hasActiveSubscription } from "../middlewares/subscriptionAccess.ts";

test("a cold process treats login as stale, then rechecks after 24 hours", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  assert.equal(isStaleForStripeReconciliation(null, now), true);
  assert.equal(isStaleForStripeReconciliation(new Date(now.getTime() - 24 * 60 * 60 * 1000), now), true);
  assert.equal(isStaleForStripeReconciliation(new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1), now), false);
});

test("reconciliation chooses the newest non-terminal Stripe subscription", () => {
  assert.deepEqual(chooseCanonicalStripeSubscription([
    { id: "sub_old", status: "canceled", created: 20 },
    { id: "sub_new", status: "trialing", created: 30 },
    { id: "sub_newer", status: "active", created: 40 },
  ]), { id: "sub_newer", status: "active", created: 40 });
});

test("reconciliation retains the newest terminal subscription when nothing is recoverable", () => {
  assert.deepEqual(chooseCanonicalStripeSubscription([
    { id: "sub_old", status: "canceled", created: 20 },
    { id: "sub_new", status: "incomplete_expired", created: 30 },
  ]), { id: "sub_new", status: "incomplete_expired", created: 30 });
  assert.equal(chooseCanonicalStripeSubscription([]), null);
});

test("duplicate Checkout completions converge to the same primary in either event order", () => {
  const subscriptions = [
    { id: "sub_setup", status: "trialing", created: 200 },
    { id: "sub_legacy", status: "active", created: 100 },
  ];
  const firstOrder = reconcileStripeSubscriptionSet(subscriptions, null);
  const reverseOrder = reconcileStripeSubscriptionSet([...subscriptions].reverse(), null);
  assert.equal(firstOrder.primary?.id, "sub_legacy");
  assert.equal(reverseOrder.primary?.id, "sub_legacy");
  assert.deepEqual(firstOrder.duplicates.map(({ id }) => id), ["sub_setup"]);
  assert.deepEqual(reverseOrder.duplicates.map(({ id }) => id), ["sub_setup"]);
  assert.equal(
    reconcileStripeSubscriptionSet(subscriptions, "sub_setup").primary?.id,
    "sub_setup",
  );
});

test("only a new authenticated checkout marked for the current removal can restore billing", () => {
  const removedAt = new Date("2026-10-01T12:00:00.750Z");
  const authorized = {
    subscriptionStatus: "removed",
    removedAt,
    metadata: {
      removalResubscribe: "true",
      removedAt: String(removedAt.getTime()),
      authenticatedCheckoutAt: String(removedAt.getTime()),
    },
    checkoutAuthenticatedAtMilliseconds: removedAt.getTime(),
  };
  assert.equal(isAuthorizedPostRemovalCheckout(authorized), true);
  assert.equal(isAuthorizedPostRemovalCheckout({
    ...authorized,
    metadata: { ...authorized.metadata, removedAt: "1" },
  }), false);
  assert.equal(isAuthorizedPostRemovalCheckout({
    ...authorized,
    metadata: { ...authorized.metadata, removalResubscribe: "false" },
  }), false);
  assert.equal(isAuthorizedPostRemovalCheckout({
    ...authorized,
    metadata: {
      ...authorized.metadata,
      authenticatedCheckoutAt: String(removedAt.getTime() - 1),
    },
    checkoutAuthenticatedAtMilliseconds: removedAt.getTime() - 1,
  }), false);
  assert.equal(isAuthorizedPostRemovalCheckout({
    ...authorized,
    subscriptionStatus: "active",
  }), false);
});

test("only facility account admins can manage billing cancellation", () => {
  assert.equal(isFacilityBillingAdmin("admin"), true);
  assert.equal(isFacilityBillingAdmin("member"), false);
  assert.equal(isFacilityBillingAdmin(null), false);
});

test("cron sweep returns success only without account failures", () => {
  assert.equal(subscriptionLifecycleHttpStatus(0), 200);
  assert.equal(subscriptionLifecycleHttpStatus(1), 207);
  assert.equal(subscriptionLifecycleHttpStatus(4), 207);
});

test("scheduled cancellation gives exact end-of-period access, then revokes it", () => {
  const end = new Date("2026-10-01T00:00:00.000Z");
  const account = {
    subscriptionStatus: "active",
    trialEndsAt: null,
    subscriptionCancelAtPeriodEnd: true,
    subscriptionCurrentPeriodEnd: end,
  };
  assert.equal(hasActiveSubscription(account, new Date(end.getTime() - 1)), true);
  assert.equal(hasActiveSubscription(account, end), false);
});