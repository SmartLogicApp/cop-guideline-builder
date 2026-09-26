import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getTrialPeriodDays,
  isPaymentAcceptanceEnabled,
  isProductionTrialPeriodExactly30,
  isRecoverableStripeSubscriptionStatus,
  resolveCheckoutTrialPlan,
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
  assert.deepEqual(resolveCheckoutTrialPlan({
    subscriptionStatus: "pending_payment",
    trialEndsAt: null,
    hasStripeSubscriptionHistory: false,
    trialPeriodDays: 30,
  }), { kind: "first-direct", trialPeriodDays: 30 });
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