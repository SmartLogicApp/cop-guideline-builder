import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getTrialPeriodDays,
  hasCheckoutBlockingSubscription,
  isPaymentAcceptanceEnabled,
  isProductionTrialPeriodExactly30,
  isRecoverableStripeSubscriptionStatus,
  resolveCheckoutTrialPlan,
  resolveFirstDirectSetupTrialEnd,
} from "./payment-config.ts";

const billingRouteSource = await readFile(
  new URL("../routes/billing.ts", import.meta.url),
  "utf8",
);

test("payment acceptance is disabled when configuration is empty", () => {
  assert.equal(isPaymentAcceptanceEnabled(""), false);
});

test("payment acceptance stays disabled for non-true values", () => {
  assert.equal(isPaymentAcceptanceEnabled("false"), false);
  assert.equal(isPaymentAcceptanceEnabled("1"), false);
  assert.equal(isPaymentAcceptanceEnabled("enabled"), false);
});

test("payment acceptance can only be enabled explicitly", () => {
  assert.equal(isPaymentAcceptanceEnabled("true"), true);
  assert.equal(isPaymentAcceptanceEnabled(" TRUE "), true);
});

test("new pending-payment accounts keep the 30-day direct checkout trial", () => {
  const plan = resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    hasStripeSubscriptionHistory: false,
    trialPeriodDays: 30,
  });
  assert.deepEqual(plan, { kind: "first-direct", trialPeriodDays: 30 });
  const stripeNowSeconds = Math.floor(new Date("2026-06-01T12:00:00.000Z").getTime() / 1000);
  assert.equal(resolveFirstDirectSetupTrialEnd({
    trialPolicy: "first-direct-30",
    trialPeriodDays: 30,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  }), stripeNowSeconds + 30 * 24 * 60 * 60);
});

test("affiliate card setup uses only the active complimentary grant's remaining time", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const expiresAt = new Date("2026-06-10T12:00:00.000Z");
  const stripeNowSeconds = Math.floor(now.getTime() / 1000);
  const plan = resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    affiliateAccessGrantedBy: "affiliate-self-service",
    affiliateAccessEndsAt: expiresAt,
    hasStripeSubscriptionHistory: false,
    now,
  });
  assert.deepEqual(plan, {
    kind: "affiliate-access",
    trialEnd: Math.floor(expiresAt.getTime() / 1000),
  });
  assert.equal(resolveFirstDirectSetupTrialEnd({
    trialPolicy: `affiliate-access-${Math.floor(expiresAt.getTime() / 1000)}`,
    trialPeriodDays: 0,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  }), Math.floor(expiresAt.getTime() / 1000));
});

test("near-expiry affiliate access collects the card without a Stripe trial", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const stripeNowSeconds = Math.floor(now.getTime() / 1000);
  const trialEnd = Math.floor(expiresAt.getTime() / 1000);
  const plan = resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    affiliateAccessGrantedBy: "affiliate-self-service",
    affiliateAccessEndsAt: expiresAt,
    hasStripeSubscriptionHistory: false,
    now,
  });
  assert.deepEqual(plan, { kind: "affiliate-expiring", trialEnd });
  assert.equal(resolveFirstDirectSetupTrialEnd({
    trialPolicy: `affiliate-expiring-${trialEnd}`,
    trialPeriodDays: 0,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  }), null);
});

test("expired affiliate complimentary access is immediate-charge, never a new 30-day trial", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const plan = resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    affiliateAccessGrantedBy: "affiliate-self-service",
    affiliateAccessEndsAt: new Date(now.getTime() - 1),
    hasStripeSubscriptionHistory: false,
    now,
  });
  assert.deepEqual(plan, { kind: "affiliate-expired" });
  assert.equal(resolveFirstDirectSetupTrialEnd({
    trialPolicy: "affiliate-expired",
    trialPeriodDays: 0,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds: Math.floor(now.getTime() / 1000),
  }), null);
});

test("local trials use their remaining Stripe trial_end and never add another 30 days", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const trialEndsAt = new Date("2026-06-08T12:00:00.000Z");
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt,
    hasStripeSubscriptionHistory: false,
    now,
  }), {
    kind: "existing-local",
    trialEnd: Math.floor(trialEndsAt.getTime() / 1000),
  });
});

test("a local trial needs the 49-hour safety margin before Checkout can carry trial_end", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  assert.equal(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt: new Date(now.getTime() + 49 * 60 * 60 * 1000),
    hasStripeSubscriptionHistory: false,
    now,
  }).kind, "existing-local");
  assert.equal(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt: new Date(now.getTime() + 48 * 60 * 60 * 1000 + 59 * 60 * 1000),
    hasStripeSubscriptionHistory: false,
    now,
  }).kind, "local-trial-active");
});

test("expired local trials can proceed without a trial while short trials remain blocked", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-06-01T12:00:00.000Z"),
    hasStripeSubscriptionHistory: false,
    now,
  }), { kind: "none" });
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-06-10T11:00:00.000Z"),
    hasStripeSubscriptionHistory: false,
    now,
  }), {
    kind: "local-trial-active",
    trialEnd: Math.floor(new Date("2026-06-10T11:00:00.000Z").getTime() / 1000),
  });
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    hasStripeSubscriptionHistory: true,
    now,
  }), { kind: "none" });
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-06-20T12:00:00.000Z"),
    hasStripeSubscriptionHistory: true,
    now,
  }), { kind: "none" });
});

test("Stripe subscription statuses block checkout unless terminal", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
    assert.equal(isRecoverableStripeSubscriptionStatus(status), true, status);
  }
  assert.equal(isRecoverableStripeSubscriptionStatus("canceled"), false);
  assert.equal(isRecoverableStripeSubscriptionStatus("incomplete_expired"), false);
  assert.equal(isRecoverableStripeSubscriptionStatus("unexpected_status"), true);
});

test("removed accounts can return to Checkout without receiving another Stripe trial", () => {
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "removed",
    trialEndsAt: null,
    hasStripeSubscriptionHistory: true,
  }), { kind: "none" });
});

test("removed-account resubscribe ignores stale local subscription status but blocks live Stripe subscriptions", () => {
  assert.equal(hasCheckoutBlockingSubscription({
    accountSubscriptionStatus: "removed",
    stripeSubscriptionId: "sub_pre_removal",
    stripeSubscriptionStatuses: ["canceled"],
  }), false);
  assert.equal(resolveCheckoutTrialPlan({
    subscriptionStatus: "removed",
    trialEndsAt: null,
    hasStripeSubscriptionHistory: true,
  }).kind, "none");

  for (const status of ["active", "trialing", "past_due", "incomplete"]) {
    assert.equal(hasCheckoutBlockingSubscription({
      accountSubscriptionStatus: "removed",
      stripeSubscriptionId: "sub_pre_removal",
      stripeSubscriptionStatuses: [status],
    }), true, `must block a Stripe subscription in ${status}`);
  }
});

test("first-direct setup confirmation always carries a 30-day Stripe trial before any charge", () => {
  const stripeNowSeconds = Math.floor(new Date("2026-10-01T12:00:00Z").getTime() / 1000);
  const trialEnd = resolveFirstDirectSetupTrialEnd({
    trialPolicy: "first-direct-30",
    trialPeriodDays: 30,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  });
  assert.equal(trialEnd, stripeNowSeconds + 30 * 24 * 60 * 60);
  assert.ok(trialEnd! > stripeNowSeconds + 29 * 24 * 60 * 60);
  assert.throws(() => resolveFirstDirectSetupTrialEnd({
    trialPolicy: "first-direct-30",
    trialPeriodDays: 30,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: true,
    stripeNowSeconds,
  }), /full 30-day trial/);
  assert.throws(() => resolveFirstDirectSetupTrialEnd({
    trialPolicy: "first-direct-14",
    trialPeriodDays: 14,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  }), /full 30-day trial/);
  assert.throws(() => resolveFirstDirectSetupTrialEnd({
    trialPolicy: "none",
    trialPeriodDays: 0,
    subscriptionStatus: "pending_payment",
    hasStripeSubscriptionHistory: false,
    stripeNowSeconds,
  }), /missing its required 30-day trial policy/);
  assert.match(billingRouteSource, /hasCheckoutBlockingSubscription\(\{/);
});

test("production direct-trial configuration must be exactly 30 days", () => {
  assert.equal(isProductionTrialPeriodExactly30(""), true);
  assert.equal(isProductionTrialPeriodExactly30("30"), true);
  assert.equal(isProductionTrialPeriodExactly30("29"), false);
  assert.equal(isProductionTrialPeriodExactly30("0"), false);
  assert.equal(isProductionTrialPeriodExactly30("30days"), false);
  assert.equal(getTrialPeriodDays("invalid"), 30);
  assert.equal(getTrialPeriodDays(" 14 "), 14);
});

test("disabled payment routes reject before loading the Stripe client", () => {
  const checkoutStart = billingRouteSource.indexOf('router.post("/checkout"');
  const portalStart = billingRouteSource.indexOf('router.post("/portal"');
  const usageStart = billingRouteSource.indexOf('router.get("/token-usage"');

  assert.ok(checkoutStart >= 0 && portalStart > checkoutStart && usageStart > portalStart);

  for (const routeSource of [
    billingRouteSource.slice(checkoutStart, portalStart),
    billingRouteSource.slice(portalStart, usageStart),
  ]) {
    const gateIndex = routeSource.indexOf("if (!isPaymentAcceptanceEnabled())");
    const stripeIndex = routeSource.indexOf("getStripeOptional()");
    assert.ok(gateIndex >= 0, "Expected payment route to check the feature gate");
    assert.ok(
      stripeIndex > gateIndex,
      "Expected the feature gate to reject before the Stripe client is loaded",
    );
  }
});