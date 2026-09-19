import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const billing = await readFile(new URL("../routes/billing.ts", import.meta.url), "utf8");
const webhook = await readFile(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
const stripeClient = await readFile(new URL("../stripeClient.ts", import.meta.url), "utf8");

test("Stripe requests use isolated direct Test and Live credentials without a sandbox connector", () => {
  assert.match(stripeClient, /process\.env\.STRIPE_TEST_SECRET_KEY/);
  assert.match(stripeClient, /process\.env\.STRIPE_LIVE_SECRET_KEY/);
  assert.match(stripeClient, /https:\/\/api\.stripe\.com/);
  assert.doesNotMatch(stripeClient, /ReplitConnectors/);
  assert.doesNotMatch(stripeClient, /\.proxy\(["']stripe["']/);
});

test("checkout uses the configured server-side price and authenticated identity metadata", () => {
  assert.match(billing, /getConfiguredStripePriceId\(\)/);
  assert.doesNotMatch(billing, /req\.body\s+as\s+\{\s*priceId/);
  assert.match(billing, /\.\.\.\(email \? \{ email \}/);
  assert.match(billing, /clerkUserId/);
  assert.match(billing, /client_reference_id:\s+account\.id/);
  assert.match(billing, /"subscription_data\[metadata\]\[accountId\]"/);
  assert.match(billing, /idempotencyKey:/);
});

test("billing supports safe success, cancellation, duplicate subscription, and portal states", () => {
  assert.match(billing, /checkout=success/);
  assert.match(billing, /checkout=canceled/);
  assert.match(billing, /ALREADY_SUBSCRIBED/);
  assert.match(billing, /router\.post\("\/portal"/);
});

test("webhooks are raw-body verified and converge supported events to current Stripe state", () => {
  assert.ok(app.indexOf("/api/stripe/webhook") < app.indexOf("app.use(express.json"));
  assert.match(app, /isPaymentAcceptanceEnabled\(\)/);
  assert.match(webhook, /stripe\.webhooks\.constructEvent/);
  for (const event of [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ]) {
    assert.match(webhook, new RegExp(event.replaceAll(".", "\\.")));
  }
  assert.match(webhook, /stripeRequest<SubscriptionLike>\(`\/v1\/subscriptions/);
  assert.match(webhook, /subscriptionCurrentPeriodEnd/);
  assert.match(webhook, /subscriptionCancelAtPeriodEnd/);
});