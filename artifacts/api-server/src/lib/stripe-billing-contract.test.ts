import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const billing = await readFile(new URL("../routes/billing.ts", import.meta.url), "utf8");
const webhook = await readFile(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
const stripeClient = await readFile(new URL("../stripeClient.ts", import.meta.url), "utf8");
const startup = await readFile(new URL("../index.ts", import.meta.url), "utf8");

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
  assert.match(billing, /"setup_intent_data\[metadata\]\[accountId\]"/);
  assert.doesNotMatch(billing, /"subscription_data\[metadata\]\[accountId\]"/);
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
  assert.match(checkout, /loadAllOpenCheckoutSessions\(stripe, lockedCustomerId\)/);
  assert.match(billing, /status: "open", limit: "100"/);
  assert.match(checkout, /existingSession\.metadata\?\.checkoutPolicy === expectedCheckoutPolicy/);
  assert.match(checkout, /existingSession\.mode === expectedSessionMode/);
  assert.match(checkout, /\/v1\/checkout\/sessions\/\$\{encodeURIComponent\(existingSession\.id\)\}\/expire/);
  assert.match(checkout, /idempotencyKey:\s*`cms-setup-checkout-\$\{account\.id\}-\$\{randomUUID\(\)\}`/);
  assert.doesNotMatch(checkout, /mode:\s*"subscription"/);
  assert.match(billing, /starting_after/);
  assert.match(billing, /page\.has_more/);
  assert.match(billing, /MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES/);
  assert.match(checkout, /hasCheckoutBlockingSubscription\(\{/);
  assert.match(checkout, /code:\s*"ALREADY_SUBSCRIBED"/);
  assert.match(billing, /complete Stripe subscription history could not be verified/i);
  assert.match(checkout, /kind:\s*"subscription-history-unavailable"/);
  assert.ok(
    checkout.indexOf("hasCheckoutBlockingSubscription") <
      checkout.indexOf('"/v1/checkout/sessions"'),
    "Stripe subscription history must be inspected before creating a Checkout Session",
  );
});

test("checkout preserves the production 30-day trial and uses setup mode for a near-expiry local trial", () => {
  const checkoutStart = billing.indexOf('router.post("/checkout"');
  const checkout = billing.slice(checkoutStart, billing.indexOf('router.post("/checkout/confirm"'));
  assert.match(checkout, /trialPlan\.kind === "first-direct"/);
  assert.match(checkout, /trialPlan\.trialPeriodDays !== 30/);
  assert.match(checkout, /isProductionTrialPeriodExactly30\(\)/);
  assert.match(checkout, /"metadata\[trialPeriodDays\]"/);
  assert.match(checkout, /mode:\s*"setup"/);
  assert.match(checkout, /hasStripeSubscriptionHistory/);
  assert.match(checkout, /getStripeCustomerCurrentTime\(stripe, lockedCustomerId\)/);
  assert.match(checkout, /now:\s*checkoutNow/);
  assert.match(checkout, /mode:\s*"setup"/);
  assert.match(checkout, /"setup_intent_data\[usage\]":\s*"off_session"/);
  assert.match(checkout, /"metadata\[setupPolicy\]":\s*LOCAL_TRIAL_SETUP_POLICY/);
  assert.match(checkout, /LOCAL_TRIAL_SETUP_POLICY/);
});

test("near-expiry setup completion is authenticated, idempotent, and preserves or omits trial_end safely", () => {
  assert.match(billing, /router\.post\("\/checkout\/confirm", requireAuth/);
  assert.match(billing, /session\.mode === "setup"/);
  assert.match(billing, /session\.status !== "complete" \|\| !session\.setup_intent/);
  assert.match(webhook, /createSubscriptionFromSetupCheckout\(session as SetupCheckoutSession\)/);
  assert.match(webhook, /setupCheckoutSessionId/);
  assert.match(webhook, /idempotencyKey:\s*`cms-setup-subscription-\$\{session\.id\}`/);
  assert.match(webhook, /where\(eq\(accounts\.id, accountId\)\)\.for\("update"\)/);
  assert.match(webhook, /localTrialEnd > stripeNowSeconds/);
  assert.match(webhook, /resolveFirstDirectSetupTrialEnd\(/);
  assert.match(webhook, /params\.set\("trial_end", String\(trialEnd\)\)/);
  assert.match(webhook, /stripeCustomer\.test_clock/);
  assert.match(webhook, /testClock\.frozen_time/);
  assert.match(webhook, /test clock must finish advancing/);
  assert.match(webhook, /params\.set\("trial_end", String\(trialEnd\)\)/);
  assert.match(webhook, /\/v1\/subscriptions", \{\s*method: "POST"/);
  assert.doesNotMatch(
    webhook.slice(
      webhook.indexOf("export async function createSubscriptionFromSetupCheckout"),
      webhook.indexOf("export async function syncStripeSubscriptionById"),
    ),
    /trial_period_days/,
  );
  assert.match(webhook, /history\.find\(\(subscription\) =>\s*subscription\.metadata\?\.setupCheckoutSessionId === session\.id/);
});

test("legacy and setup completions reconcile to one account subscription", () => {
  assert.match(webhook, /reconcileStripeSubscriptionSet\(\s*history,\s*account\.stripeSubscriptionId/);
  assert.match(webhook, /for \(const duplicate of duplicates\)/);
  assert.match(webhook, /cancelStripeSubscriptionIfNeeded\(duplicate\.id\)/);
  assert.match(webhook, /await expireOpenCheckoutSessionsForCustomer\(expectedCustomerId\)/);
  assert.match(webhook, /listCompletedSubscriptionCheckoutIds\(expectedCustomerId\)/);
  assert.match(webhook, /subscriptionStatus === "removed" && !authorizedPostRemovalCheckout/);
  assert.match(billing, /mode:\s*"setup"/);
  assert.doesNotMatch(billing.slice(
    billing.indexOf('router.post("/checkout"'),
    billing.indexOf('router.post("/checkout/confirm"'),
  ), /mode:\s*"subscription"/);
});

test("administrator removal is durable and cancellation is idempotent with distinct failures", () => {
  assert.match(billing, /router\.post\("\/admin\/accounts\/:id\/remove"/);
  assert.match(billing, /loadAllStripeSubscriptionRefs/);
  assert.match(billing, /loadAllOpenCheckoutSessions/);
  assert.match(billing, /stripeCancellation: "not_configured"/);
  assert.match(billing, /stripeCancellation: "failed"/);
  assert.match(billing, /TERMINAL_STRIPE_STATUSES\.has\(current\.status\)/);
  assert.match(webhook, /if \(account\.subscriptionStatus === "removed"\) return;/);
});

test("subscription cancel and undo require a facility administrator", () => {
  assert.match(billing, /isFacilityBillingAdmin\(membership\.accountUser\.role\)/);
  const cancelRoute = billing.slice(
    billing.indexOf('router.post("/subscription/cancel"'),
    billing.indexOf('router.post("/subscription/undo-cancellation"'),
  );
  const undoRoute = billing.slice(
    billing.indexOf('router.post("/subscription/undo-cancellation"'),
    billing.indexOf('router.post("/admin/accounts/:id/remove"'),
  );
  assert.match(cancelRoute, /return res\.status\(403\)/);
  assert.match(undoRoute, /return res\.status\(403\)/);
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
  assert.match(webhook, /chosen\.cancel_at != null/);
  assert.match(webhook, /chosen\.cancel_at <= periodEnd/);
  assert.match(webhook, /subscriptionCancelAtPeriodEnd: chosen\.cancel_at_period_end \|\| cancelsByPeriodEnd/);
});

test("test webhook endpoint reconciliation runs only in development outside readiness smoke", () => {
  assert.match(startup, /!readinessSmokeTest\s*&&\s*process\.env\.NODE_ENV\s*===\s*"development"/);
  assert.match(startup, /process\.env\.STRIPE_TEST_SECRET_KEY/);
  assert.match(startup, /reconcileTestWebhookEndpointForDevelopment/);
  assert.doesNotMatch(startup, /NODE_ENV\s*!==\s*"production"\s*\)\s*\{\s*const stripe/);
});

test("Stripe trial end is mirrored and scheduled cancellation metadata is normalized", () => {
  assert.match(webhook, /\.\.\.\(chosen\.trial_end\s*\?\s*\{\s*trialEndsAt:\s*timestamp\(chosen\.trial_end\)/);
  assert.match(webhook, /subscriptionCancelAtPeriodEnd:\s*chosen\.cancel_at_period_end\s*\|\|\s*cancelsByPeriodEnd/);
  assert.match(webhook, /chosen\.cancel_at\s*<=\s*periodEnd/);
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
