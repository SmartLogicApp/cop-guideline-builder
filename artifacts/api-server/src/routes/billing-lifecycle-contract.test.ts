import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = new URL("./billing.ts", import.meta.url);
const billing = await readFile(source, "utf8");
const webhook = await readFile(new URL("../webhookHandlers.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app.ts", import.meta.url), "utf8");
const access = await readFile(new URL("../middlewares/subscriptionAccess.ts", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../lib/subscription-lifecycle.ts", import.meta.url), "utf8");
const lifecycleMiddleware = await readFile(new URL("../middlewares/requireActiveSubscription.ts", import.meta.url), "utf8");
const warning = await readFile(new URL("../lib/trial-warning-email.ts", import.meta.url), "utf8");
const billingUi = await readFile(new URL("../../../marketing-site/src/pages/billing.tsx", import.meta.url), "utf8");

test("client cancellation is scheduled without proration and can be undone", () => {
  assert.match(billing, /router\.post\("\/subscription\/cancel"/);
  assert.match(billing, /cancel_at_period_end:\s*"true"/);
  assert.match(billing, /proration_behavior:\s*"none"/);
  assert.match(billing, /router\.post\("\/subscription\/undo-cancellation"/);
  assert.match(billing, /cancel_at_period_end:\s*"false"/);
  assert.match(billing, /period has ended/);
});

test("admin removal immediately revokes access and deletes Stripe subscription without refund code", () => {
  assert.match(billing, /router\.post\("\/admin\/accounts\/:id\/remove",\s*requireAnyAdmin/);
  assert.match(billing, /subscriptionStatus:\s*"removed"/);
  assert.match(billing, /method:\s*"DELETE"/);
  assert.match(access, /account\?\.subscriptionStatus === "removed"/);
  assert.match(webhook, /account\.subscriptionStatus === "removed"/);
});

test("portal policy limits cancellation to the period end", () => {
  assert.match(billing, /features\[subscription_cancel\]\[mode\]":\s*"at_period_end"/);
  assert.match(billing, /features\[subscription_cancel\]\[proration_behavior\]":\s*"none"/);
});

test("daily lifecycle worker is mounted and checkout has a full no-trial history check", () => {
  assert.match(app, /startSubscriptionLifecycleScheduler\(\)/);
  assert.match(billing, /loadStripeSubscriptionHistory\(stripe,\s*lockedCustomerId\)/);
  assert.match(billing, /resolveCheckoutTrialPlan\([\s\S]*?hasStripeSubscriptionHistory/);
  assert.match(billing, /hasCheckoutBlockingSubscription\(\{[\s\S]*?stripeSubscriptionStatuses:\s*subscriptionStatuses/);
});

test("cold-start login lifecycle reconciles Stripe and idempotently sends five-day reminders", () => {
  assert.match(lifecycleMiddleware, /runAccountSubscriptionLifecycle\(account\)/);
  assert.match(lifecycle, /no entry,[\s\S]*?first authenticated account check always reconciles/i);
  assert.match(lifecycle, /trialWarningEmailSentAt,\s*now/);
  assert.match(warning, /TRIAL_WARNING_DAYS = 5/);
});

test("external subscription lifecycle cron is protected and reports partial failures", () => {
  assert.match(
    billing,
    /router\.post\("\/admin\/cron\/subscription-lifecycle",\s*requireCronOrSuperAdmin/,
  );
  assert.match(billing, /runDailySubscriptionLifecycle\(\)/);
  assert.match(billing, /failedAccountCount/);
  assert.match(billing, /subscriptionLifecycleHttpStatus\(failedAccountCount\)/);
  assert.match(billing, /status\(502\).*failedAccountCount:\s*null/s);
});

test("billing UI shows requested period-end cancellation copy and undo", () => {
  assert.match(billingUi, /Subscription canceled\. You will not be charged again\. Your access ends on/);
  assert.match(billingUi, /Undo cancellation/);
});