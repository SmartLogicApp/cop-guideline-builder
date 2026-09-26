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

test("checkout validates the configured recurring price before creating Stripe objects", () => {
  assert.match(billing, /isExpectedCheckoutPrice\(configuredPrice, process\.env\.NODE_ENV === "production"\)/);
  assert.match(billing, /price\.livemode === liveMode/);
  assert.match(billing, /price\.active === true/);
  assert.match(billing, /price\.unit_amount === EXPECTED_MONTHLY_PRICE_CENTS/);
  assert.match(billing, /price\.currency === "usd"/);
  assert.match(billing, /price\.recurring\?\.interval === "month"/);
  assert.match(billing, /price\.recurring\.interval_count === 1/);
  assert.match(billing, /price\.recurring\.usage_type === "licensed"/);
  assert.match(billing, /price\.product.*active === true/s);

  const checkoutStart = billing.indexOf('router.post("/checkout"');
  const checkout = billing.slice(checkoutStart);
  const validation = checkout.indexOf("isExpectedCheckoutPrice(configuredPrice");
  const customerCreation = checkout.indexOf('"/v1/customers"');
  const sessionCreation = checkout.indexOf('"/v1/checkout/sessions"');
  assert.ok(validation >= 0 && validation < customerCreation);
  assert.ok(validation < sessionCreation);
});

test("checkout uses a unique attempt key and serializes/reuses open sessions", () => {
  const checkoutStart = billing.indexOf('router.post("/checkout"');
  const checkout = billing.slice(checkoutStart, billing.indexOf('router.post("/checkout/confirm"'));
  assert.match(billing, /import \{ randomUUID \} from "node:crypto"/);
  assert.match(checkout, /\.for\("update"\)/);
  assert.match(checkout, /status=open&limit=100/);
  assert.match(checkout, /existingSession\.metadata\?\.checkoutPolicy === "facility-trial-v2"/);
  assert.match(checkout, /\/v1\/checkout\/sessions\/\$\{encodeURIComponent\(existingSession\.id\)\}\/expire/);
  assert.match(checkout, /idempotencyKey:\s*`cms-checkout-\$\{account\.id\}-\$\{randomUUID\(\)\}`/);
  assert.doesNotMatch(checkout, /idempotencyKey:\s*`cms-checkout-\$\{account\.id\}-\$\{priceId\}/);
  assert.match(billing, /starting_after/);
  assert.match(billing, /page\.has_more/);
  assert.match(billing, /MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES/);
  assert.match(checkout, /subscriptionStatuses\.some\(isRecoverableStripeSubscriptionStatus\)/);
  assert.match(checkout, /code:\s*"ALREADY_SUBSCRIBED"/);
  assert.match(billing, /complete Stripe subscription history could not be verified/i);
  assert.match(checkout, /kind:\s*"subscription-history-unavailable"/);
  assert.ok(
    checkout.indexOf("subscriptionStatuses.some") <
      checkout.indexOf('"/v1/checkout/sessions"'),
    "Stripe subscription history must be inspected before creating a Checkout Session",
  );
});

test("checkout enforces the production 30-day first-trial policy and preserves existing local trial end", () => {
  const checkoutStart = billing.indexOf('router.post("/checkout"');
  const checkout = billing.slice(checkoutStart, billing.indexOf('router.post("/checkout/confirm"'));
  assert.match(checkout, /trialPlan\.kind === "first-direct"/);
  assert.match(checkout, /trialPlan\.trialPeriodDays !== 30/);
  assert.match(checkout, /isProductionTrialPeriodExactly30\(\)/);
  assert.match(checkout, /subscription_data\[trial_period_days\]/);
  assert.match(checkout, /subscription_data\[trial_end\]/);
  assert.match(checkout, /hasStripeSubscriptionHistory/);
  assert.match(checkout, /trialPlan\.kind === "local-trial-active"/);
  assert.match(checkout, /code:\s*"LOCAL_TRIAL_STILL_ACTIVE"/);
  assert.match(checkout, /trialEndsAt:\s*new Date\(checkoutResult\.trialEnd \* 1000\)\.toISOString\(\)/);
  assert.match(checkout, /return res\.status\(409\)\.json\(\{[\s\S]*?code:\s*"LOCAL_TRIAL_STILL_ACTIVE"/);
});

test("billing supports safe success, cancellation, duplicate subscription, and portal states", () => {
  assert.match(billing, /checkout=success/);
  assert.match(billing, /checkout=canceled/);
  assert.match(billing, /ALREADY_SUBSCRIBED/);
  assert.match(billing, /router\.post\("\/portal"/);
  assert.match(billing, /kind: "checkout-unavailable"/);
  assert.match(billing, /code: "CHECKOUT_UNAVAILABLE"/);
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
  assert.match(webhook, /subscription\.cancel_at != null/);
  assert.match(webhook, /subscription\.cancel_at <= periodEnd/);
  assert.match(webhook, /subscriptionCancelAtPeriodEnd: subscription\.cancel_at_period_end \|\| cancelsByPeriodEnd/);
});

test("deletion revokes locally without requiring a successful Stripe retrieval", () => {
  const deletionHandler = webhook.slice(
    webhook.indexOf('case "customer.subscription.deleted"'),
    webhook.indexOf('case "invoice.payment_succeeded"'),
  );
  assert.match(deletionHandler, /markSubscriptionDeleted/);
  assert.doesNotMatch(deletionHandler, /retrieveSubscription/);
  const deletionSync = webhook.slice(
    webhook.indexOf("async function markSubscriptionDeleted"),
    webhook.indexOf("export async function syncStripeSubscriptionById"),
  );
  assert.match(deletionSync, /subscriptionStatus:\s*"canceled"/);
  assert.match(deletionSync, /trialEndsAt:\s*null/);
  assert.match(deletionSync, /eq\(accounts\.stripeSubscriptionId, subscription\.id\)/);
});

test("successful subscription invoices synchronize current subscription state", () => {
  const invoiceHandler = webhook.slice(
    webhook.indexOf('case "invoice.payment_succeeded"'),
    webhook.indexOf('case "charge.refunded"'),
  );
  assert.match(invoiceHandler, /getInvoiceSubscriptionId\(invoice\)/);
  assert.match(invoiceHandler, /syncStripeSubscriptionById\(subscriptionId\)/);
  assert.ok(
    invoiceHandler.indexOf("syncStripeSubscriptionById") <
      invoiceHandler.indexOf("accrueCommissionFromInvoice"),
  );
  assert.match(webhook, /parent\?\.subscription_details\?\.subscription/);
});
