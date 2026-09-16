import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPaymentAcceptanceEnabled } from "./payment-config.ts";

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