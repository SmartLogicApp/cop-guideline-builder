import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accounts, accountUsers, tokenUsage } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { requireAnyAdmin, requireCronOrSuperAdmin } from "../lib/admin-guards.js";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription";
import { isTrialStatus } from "../middlewares/subscriptionAccess";
import {
  isPaymentAcceptanceEnabled,
  isProductionTrialPeriodExactly30,
  hasCheckoutBlockingSubscription,
  resolveCheckoutTrialPlan,
} from "../lib/payment-config";
import { getReturnBase } from "../lib/return-base.js";
import {
  isFacilityBillingAdmin,
  subscriptionLifecycleHttpStatus,
} from "../lib/subscription-lifecycle-rules.js";
import { runDailySubscriptionLifecycle } from "../lib/subscription-lifecycle.js";
import { CURRENT_TERMS_VERSION, needsAcceptance } from "../lib/terms-versions";
import { getConfiguredStripePriceId, isStripeConfigured, stripeRequest } from "../stripeClient";
import {
  createSubscriptionFromSetupCheckout,
  syncStripeSubscriptionById,
} from "../webhookHandlers";

const router: IRouter = Router();
const EXPECTED_MONTHLY_PRICE_CENTS = 29_900;
const MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES = 100;
const LOCAL_TRIAL_SETUP_POLICY = "local-trial-card-setup-v1";
const TERMINAL_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

// POST /api/billing/admin/cron/subscription-lifecycle
// External daily schedulers use the same CRON_SECRET guard as the other cron
// endpoints. Partial account failures are explicitly reported as HTTP 207.
router.post("/admin/cron/subscription-lifecycle", requireCronOrSuperAdmin, async (req, res) => {
  try {
    const result = await runDailySubscriptionLifecycle();
    const failedAccountCount = new Set(
      result.failures.map((failure) => failure.accountId),
    ).size;
    return res.status(subscriptionLifecycleHttpStatus(failedAccountCount)).json({
      ok: failedAccountCount === 0,
      accountsScanned: result.accountsScanned,
      stripeAccountsProcessed: result.stripeAccountsProcessed,
      trialReminderAccountsScanned: result.trialReminderAccountsScanned,
      trialRemindersSent: result.trialRemindersSent,
      failedAccountCount,
      failures: result.failures,
      warningCount: result.warnings.length,
      warnings: result.warnings,
      ...(failedAccountCount > 0
        ? { error: "Subscription lifecycle completed with account failures." }
        : {}),
    });
  } catch (error) {
    req.log.error({ err: error }, "Subscription lifecycle cron run failed.");
    return res.status(502).json({
      ok: false,
      error: "Subscription lifecycle could not complete.",
      failedAccountCount: null,
    });
  }
});

async function cancelStripeSubscriptionIdempotently(
  subscriptionId: string,
): Promise<{ alreadyCanceled: boolean }> {
  let current = await stripeRequest<{ status: string }>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  if (TERMINAL_STRIPE_STATUSES.has(current.status)) return { alreadyCanceled: true };
  try {
    await stripeRequest(
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE" },
    );
    return { alreadyCanceled: false };
  } catch (deleteError) {
    current = await stripeRequest<{ status: string }>(
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    if (TERMINAL_STRIPE_STATUSES.has(current.status)) return { alreadyCanceled: true };
    throw deleteError;
  }
}

type CheckoutPrice = {
  livemode?: boolean;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  recurring?: {
    interval?: string;
    interval_count?: number;
    usage_type?: string;
  } | null;
  product?: string | { active?: boolean } | null;
};

type OpenCheckoutSession = {
  id: string;
  url: string | null;
  mode: string | null;
  status: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
};

type StripeSubscriptionRef = {
  id: string;
  status: string;
};

/**
 * The configured Stripe Price is the actual amount the customer will pay.
 * Keep this exact contract aligned with the Facility plan advertised by the
 * billing endpoint; a non-empty ID alone is not enough to protect production
 * from accidentally using a test, one-time, or differently priced object.
 */
export function isExpectedCheckoutPrice(price: CheckoutPrice, liveMode: boolean): boolean {
  const productIsActive = typeof price.product === "object" && price.product !== null &&
    price.product.active === true;
  return price.livemode === liveMode &&
    price.active === true &&
    price.currency === "usd" &&
    price.unit_amount === EXPECTED_MONTHLY_PRICE_CENTS &&
    price.type === "recurring" &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed" &&
    productIsActive;
}

async function loadStripeSubscriptionHistory(
  stripe: { request<T>(path: string): Promise<T> },
  customerId: string,
): Promise<string[]> {
  const statuses: string[] = [];
  const seenIds = new Set<string>();
  let startingAfter: string | null = null;

  for (let pageNumber = 0; pageNumber < MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES; pageNumber += 1) {
    const params = new URLSearchParams({
      customer: customerId,
      status: "all",
      limit: "100",
    });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripe.request<{
      data: { id: string; status: string }[];
      has_more: boolean;
    }>(`/v1/subscriptions?${params.toString()}`);

    if (
      !page ||
      !Array.isArray(page.data) ||
      typeof page.has_more !== "boolean" ||
      page.data.some((subscription) =>
        !subscription ||
        typeof subscription.id !== "string" ||
        !subscription.id ||
        typeof subscription.status !== "string" ||
        !subscription.status
      )
    ) {
      throw new Error("Stripe returned an incomplete subscription history page.");
    }

    for (const subscription of page.data) {
      if (seenIds.has(subscription.id)) {
        throw new Error("Stripe subscription history pagination repeated an object.");
      }
      seenIds.add(subscription.id);
      statuses.push(subscription.status);
    }

    if (!page.has_more) return statuses;
    const nextCursor = page.data.at(-1)?.id;
    if (!nextCursor || nextCursor === startingAfter) {
      throw new Error("Stripe subscription history pagination did not advance.");
    }
    startingAfter = nextCursor;
  }

  throw new Error("Stripe subscription history exceeded the pagination safety limit.");
}

async function loadAllStripeSubscriptionRefs(
  stripe: { request<T>(path: string): Promise<T> },
  customerId: string,
): Promise<StripeSubscriptionRef[]> {
  const subscriptions: StripeSubscriptionRef[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripe.request<{
      data: StripeSubscriptionRef[];
      has_more: boolean;
    }>(`/v1/subscriptions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid subscription cancellation page.");
    }
    for (const subscription of page.data) {
      if (!subscription?.id || !subscription.status || seen.has(subscription.id)) {
        throw new Error("Stripe returned incomplete or repeated subscription cancellation data.");
      }
      seen.add(subscription.id);
      subscriptions.push(subscription);
    }
    if (!page.has_more) return subscriptions;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === startingAfter) {
      throw new Error("Stripe subscription cancellation pagination did not advance.");
    }
    startingAfter = cursor;
  }
  throw new Error("Stripe subscription cancellation history exceeded its pagination safety limit.");
}

async function loadAllOpenCheckoutSessions(
  stripe: { request<T>(path: string): Promise<T> },
  customerId: string,
): Promise<OpenCheckoutSession[]> {
  const sessions: OpenCheckoutSession[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "open", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripe.request<{
      data: OpenCheckoutSession[];
      has_more: boolean;
    }>(`/v1/checkout/sessions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid open Checkout session page.");
    }
    for (const session of page.data) {
      if (!session?.id || session.status !== "open" || seen.has(session.id)) {
        throw new Error("Stripe returned incomplete or repeated open Checkout session data.");
      }
      seen.add(session.id);
      sessions.push(session);
    }
    if (!page.has_more) return sessions;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === startingAfter) {
      throw new Error("Stripe Checkout session pagination did not advance.");
    }
    startingAfter = cursor;
  }
  throw new Error("Stripe open Checkout session history exceeded its pagination safety limit.");
}

async function getStripeCustomerCurrentTime(
  stripe: { request<T>(path: string): Promise<T> },
  customerId: string,
): Promise<Date> {
  const customer = await stripe.request<{
    test_clock?: string | { id: string } | null;
  }>(`/v1/customers/${encodeURIComponent(customerId)}`);
  const testClockId = typeof customer.test_clock === "string"
    ? customer.test_clock
    : customer.test_clock?.id;
  if (!testClockId) return new Date();

  const clock = await stripe.request<{ status: string; frozen_time: number }>(
    `/v1/test_helpers/test_clocks/${encodeURIComponent(testClockId)}`,
  );
  if (clock.status !== "ready") {
    throw new Error("The Stripe test clock must finish advancing before checkout can continue.");
  }
  return new Date(clock.frozen_time * 1000);
}

function checkoutTrialPolicy(trialPlan: ReturnType<typeof resolveCheckoutTrialPlan>): string {
  switch (trialPlan.kind) {
    case "first-direct":
      return `first-direct-${trialPlan.trialPeriodDays}`;
    case "affiliate-access":
      return `affiliate-access-${trialPlan.trialEnd}`;
    case "affiliate-expiring":
      return `affiliate-expiring-${trialPlan.trialEnd}`;
    case "affiliate-expired":
      return "affiliate-expired";
    case "existing-local":
      return `existing-local-${trialPlan.trialEnd}`;
    case "local-trial-active":
      return `local-trial-active-${trialPlan.trialEnd}`;
    case "none":
      return "no-trial";
  }
}

/**
 * Stripe, or null when it is not configured.
 *
 * This used to be a try/catch around `return { request: stripeRequest }` — an
 * expression that cannot throw, because stripeRequest is a function reference
 * and calling it is what fails. So the catch was dead, this never returned
 * null, and the 503 guards at both call sites were unreachable: a missing
 * secret key surfaced instead as an unhandled throw from inside the request.
 *
 * Now it asks the question it was always meant to ask.
 */
function getStripeOptional() {
  return isStripeConfigured() ? { request: stripeRequest } : null;
}

const MANAGED_PORTAL_CONFIGURATION = "cms_period_end_no_proration_v1";

/**
 * Always use a Billing Portal configuration that cannot immediately terminate
 * or prorate a customer's subscription. An explicitly configured portal ID is
 * brought into policy; without one, a uniquely marked configuration is found
 * or created (idempotent across API restarts).
 */
async function getPeriodEndOnlyPortalConfigurationId(): Promise<string> {
  const configuredId = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  let configurationId = configuredId || null;
  if (!configurationId) {
    let startingAfter: string | undefined;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const params = new URLSearchParams({ limit: "100" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const page = await stripeRequest<{
        data: { id: string; metadata?: Record<string, string> }[];
        has_more: boolean;
      }>(`/v1/billing_portal/configurations?${params.toString()}`);
      const managed = page.data.find((item) =>
        item.metadata?.cms_cancellation_policy === MANAGED_PORTAL_CONFIGURATION
      );
      if (managed) {
        configurationId = managed.id;
        break;
      }
      if (!page.has_more) break;
      startingAfter = page.data.at(-1)?.id;
      if (!startingAfter) break;
    }
  }

  const params = new URLSearchParams({
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][proration_behavior]": "none",
    "features[payment_method_update][enabled]": "true",
    "metadata[cms_cancellation_policy]": MANAGED_PORTAL_CONFIGURATION,
  });
  if (configurationId) {
    const updated = await stripeRequest<{ id: string }>(
      `/v1/billing_portal/configurations/${encodeURIComponent(configurationId)}`,
      { method: "POST", body: params },
    );
    return updated.id;
  }
  const created = await stripeRequest<{ id: string }>(
    "/v1/billing_portal/configurations",
    { method: "POST", body: params },
  );
  return created.id;
}

// Helper: get the user's account
async function getUserAccount(clerkUserId: string) {
  const [au] = await db.select().from(accountUsers)
    .where(eq(accountUsers.clerkUserId, clerkUserId)).limit(1);
  if (!au?.accountId) return null;
  const [account] = await db.select().from(accounts)
    .where(eq(accounts.id, au.accountId)).limit(1);
  return account ? { account, accountUser: au } : null;
}

// getReturnBase now lives in lib/return-base.ts — see the import at the top.
// It moved because routes/admin.ts had grown its own copy without the host
// guard, and one guarded implementation is safer than two that can drift.

// GET /api/billing/subscription
router.get("/subscription", requireAuth, async (req, res) => {
  const paymentAcceptanceEnabled = isPaymentAcceptanceEnabled();
  const access = await getSubscriptionAccess((req as any).clerkUserId);
  const account = access.account;
  if (!account) {
    return res.json({
      subscription: null,
      isActive: access.isActive,
      accessSource: access.accessSource,
      paymentAcceptanceEnabled,
    });
  }

  const now = new Date();
  const trialActive = isTrialStatus(account.subscriptionStatus) &&
    account.trialEndsAt != null && account.trialEndsAt > now;

  return res.json({
    subscription: {
      status:          account.subscriptionStatus,
      stripeId:        account.stripeSubscriptionId,
      priceId:         account.stripePriceId,
      currentPeriodStart: account.subscriptionCurrentPeriodStart,
      currentPeriodEnd: account.subscriptionCurrentPeriodEnd,
      cancelAtPeriodEnd: account.subscriptionCancelAtPeriodEnd,
      canceledAt: account.subscriptionCanceledAt,
      trialEndsAt:     account.trialEndsAt,
      termsAcceptedAt: account.termsAcceptedAt,
      termsVersion:    account.termsVersion,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      termsAcceptanceRequired: needsAcceptance(account.termsVersion),
      isActive:        access.isActive,
      accessSource:    access.accessSource,
      hasComplimentaryAccess: access.hasComplimentaryAccess,
      daysLeftInTrial: trialActive
        ? Math.ceil((account.trialEndsAt!.getTime() - now.getTime()) / 86_400_000)
        : 0,
      accessEndsAt: account.subscriptionCancelAtPeriodEnd
        ? account.subscriptionCurrentPeriodEnd
        : null,
    },
    paymentAcceptanceEnabled,
    plan: paymentAcceptanceEnabled
      ? { name: "Facility", amountUsd: 299, interval: "month" }
      : null,
    canManageBilling: Boolean(account.stripeCustomerId),
  });
});

// POST /api/billing/subscription/cancel — retain access to the paid-through date.
router.post("/subscription/cancel", requireAuth, async (req, res) => {
  const membership = await getUserAccount((req as any).clerkUserId);
  if (!membership) return res.status(404).json({ error: "No facility account found." });
  if (!isFacilityBillingAdmin(membership.accountUser.role)) {
    return res.status(403).json({ error: "Only a facility administrator can change billing." });
  }
  const account = membership.account;
  if (!account?.stripeSubscriptionId) {
    return res.status(404).json({ error: "No active Stripe subscription was found." });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: "Stripe billing is not configured." });
  }
  if (account.subscriptionCancelAtPeriodEnd) {
    return res.json({
      cancelAtPeriodEnd: true,
      accessEndsAt: account.subscriptionCurrentPeriodEnd,
    });
  }

  const params = new URLSearchParams({
    cancel_at_period_end: "true",
    proration_behavior: "none",
  });
  let updated: {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
    cancel_at?: number | null;
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  try {
    updated = await stripeRequest<{
      id: string;
      status: string;
      cancel_at_period_end: boolean;
      cancel_at?: number | null;
      current_period_end?: number;
      items?: { data?: { current_period_end?: number }[] };
    }>(
      `/v1/subscriptions/${encodeURIComponent(account.stripeSubscriptionId)}`,
      { method: "POST", body: params },
    );
  } catch (error) {
    req.log.error({ err: error, accountId: account.id }, "Stripe could not schedule subscription cancellation.");
    return res.status(502).json({ error: "Cancellation could not be scheduled with Stripe. Please try again." });
  }
  await syncStripeSubscriptionById(updated.id);
  const periodEnd = updated.items?.data?.[0]?.current_period_end ??
    updated.current_period_end ?? updated.cancel_at ?? null;
  return res.json({
    cancelAtPeriodEnd: updated.cancel_at_period_end,
    accessEndsAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });
});

// POST /api/billing/subscription/undo-cancellation — available until expiry.
router.post("/subscription/undo-cancellation", requireAuth, async (req, res) => {
  const membership = await getUserAccount((req as any).clerkUserId);
  if (!membership) return res.status(404).json({ error: "No facility account found." });
  if (!isFacilityBillingAdmin(membership.accountUser.role)) {
    return res.status(403).json({ error: "Only a facility administrator can change billing." });
  }
  const account = membership.account;
  if (!account?.stripeSubscriptionId || !account.subscriptionCancelAtPeriodEnd) {
    return res.status(409).json({ error: "There is no scheduled cancellation to undo." });
  }
  if (
    !account.subscriptionCurrentPeriodEnd ||
    account.subscriptionCurrentPeriodEnd <= new Date()
  ) {
    return res.status(409).json({ error: "The subscription access period has ended." });
  }
  const params = new URLSearchParams({
    cancel_at_period_end: "false",
    proration_behavior: "none",
  });
  try {
    const updated = await stripeRequest<{ id: string }>(
      `/v1/subscriptions/${encodeURIComponent(account.stripeSubscriptionId)}`,
      { method: "POST", body: params },
    );
    await syncStripeSubscriptionById(updated.id);
  } catch (error) {
    req.log.error({ err: error, accountId: account.id }, "Stripe could not undo scheduled subscription cancellation.");
    return res.status(502).json({ error: "Cancellation could not be undone with Stripe. Please try again." });
  }
  return res.json({ cancelAtPeriodEnd: false });
});

// POST /api/billing/admin/accounts/:id/remove — permanent local revocation and
// immediate Stripe cancellation. DELETE does not issue refunds.
router.post("/admin/accounts/:id/remove", requireAnyAdmin, async (req, res) => {
  const accountId = typeof req.params.id === "string" ? req.params.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
    return res.status(400).json({ error: "A valid client account ID is required." });
  }
  const [account] = await db.select({
    id: accounts.id,
  }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return res.status(404).json({ error: "Client account not found." });

  const removedAt = new Date();
  const stripeIdentifiers = await db.transaction(async (tx) => {
    const [currentAccount] = await tx.select({
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      stripeCustomerId: accounts.stripeCustomerId,
    }).from(accounts).where(eq(accounts.id, account.id)).for("update").limit(1);
    if (!currentAccount) return null;
    await tx.update(accounts).set({
      subscriptionStatus: "removed",
      subscriptionCancelAtPeriodEnd: false,
      subscriptionCanceledAt: removedAt,
      trialEndsAt: null,
      updatedAt: removedAt,
    }).where(eq(accounts.id, account.id));
    await tx.update(accountUsers).set({
      hasComplimentaryAccess: false,
      complimentaryAccessGrantedAt: null,
      complimentaryAccessGrantedBy: null,
    }).where(eq(accountUsers.accountId, account.id));
    return currentAccount;
  });

  if (!stripeIdentifiers?.stripeCustomerId && !stripeIdentifiers?.stripeSubscriptionId) {
    return res.json({ status: "Removed", accessRemoved: true, stripeCanceled: true });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({
      status: "Removed",
      accessRemoved: true,
      stripeCanceled: false,
      stripeCancellation: "not_configured",
      error: "Local access was removed, but Stripe is not configured so cancellation could not be attempted.",
    });
  }
  try {
    const failures: string[] = [];
    if (stripeIdentifiers?.stripeCustomerId) {
      try {
        const openSessions = await loadAllOpenCheckoutSessions(
          { request: stripeRequest },
          stripeIdentifiers.stripeCustomerId,
        );
        for (const session of openSessions) {
          try {
            await stripeRequest(
              `/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
              { method: "POST" },
            );
          } catch {
            failures.push(`checkout:${session.id}`);
          }
        }
      } catch {
        failures.push("checkout-session-history");
      }

      try {
        const subscriptions = await loadAllStripeSubscriptionRefs(
          { request: stripeRequest },
          stripeIdentifiers.stripeCustomerId,
        );
        if (
          stripeIdentifiers.stripeSubscriptionId &&
          !subscriptions.some((subscription) => subscription.id === stripeIdentifiers.stripeSubscriptionId)
        ) {
          subscriptions.push({
            id: stripeIdentifiers.stripeSubscriptionId,
            status: "unknown",
          });
        }
        for (const subscription of subscriptions) {
          try {
            await cancelStripeSubscriptionIdempotently(subscription.id);
          } catch {
            failures.push(`subscription:${subscription.id}`);
          }
        }
      } catch {
        failures.push("subscription-history");
      }
    } else if (stripeIdentifiers?.stripeSubscriptionId) {
      try {
        await cancelStripeSubscriptionIdempotently(stripeIdentifiers.stripeSubscriptionId);
      } catch {
        failures.push(`subscription:${stripeIdentifiers.stripeSubscriptionId}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Stripe removal cleanup failed: ${failures.join(",")}`);
    }
    return res.json({
      status: "Removed",
      accessRemoved: true,
      stripeCanceled: true,
      checkoutSessionsExpired: true,
    });
  } catch (error) {
    req.log.error({ err: error, accountId: account.id }, "Client access was removed but Stripe cancellation failed.");
    return res.status(502).json({
      status: "Removed",
      accessRemoved: true,
      stripeCanceled: false,
      stripeCancellation: "failed",
      error: "Client access was removed, but Stripe could not cancel the subscription. Retry removal or cancel it in Stripe.",
    });
  }
});

// POST /api/billing/checkout
router.post("/checkout", requireAuth, async (req, res) => {
  if (!isPaymentAcceptanceEnabled()) {
    return res.status(503).json({
      error: "Payment acceptance is not enabled yet.",
      code: "PAYMENTS_DISABLED",
    });
  }

  const stripe = await getStripeOptional();
  if (!stripe) {
    return res.status(503).json({ error: "Payment processing is not yet configured." });
  }

  const membership = await getUserAccount((req as any).clerkUserId);
  if (!membership) return res.status(404).json({ error: "No facility account found" });
  const { account, accountUser } = membership;
  const checkoutAuthenticatedAt = Date.now();
  const removalAtAtRequest = account.subscriptionStatus === "removed"
    ? account.subscriptionCanceledAt
    : null;
  const removalMarkerAtRequest = removalAtAtRequest
    ? removalAtAtRequest.getTime()
    : null;

  // The gate. Terms 1.0 told customers that updated billing terms would be
  // presented and affirmatively accepted before any charging begins. This is
  // where that promise is kept: no checkout session is created for a facility
  // that has not accepted the current version, so there is no path to a charge
  // without a recorded acceptance of the terms that govern it.
  if (needsAcceptance(account.termsVersion)) {
    return res.status(409).json({
      error: "The current Terms of Service must be accepted before subscribing.",
      code: "TERMS_ACCEPTANCE_REQUIRED",
      currentVersion: CURRENT_TERMS_VERSION,
      acceptedVersion: account.termsVersion,
    });
  }

  if (
    account.stripeSubscriptionId &&
    ["active", "trialing"].includes(account.subscriptionStatus ?? "")
  ) {
    return res.status(409).json({
      error: "This facility already has an active subscription.",
      code: "ALREADY_SUBSCRIBED",
    });
  }

  let priceId: string;
  try {
    priceId = getConfiguredStripePriceId();
  } catch {
    return res.status(503).json({
      error: "The subscription plan is not configured yet.",
      code: "PRICE_NOT_CONFIGURED",
    });
  }
  let configuredPrice: CheckoutPrice;
  try {
    configuredPrice = await stripe.request<CheckoutPrice>(
      `/v1/prices/${encodeURIComponent(priceId)}?expand[]=product`,
    );
  } catch (error) {
    req.log.error({ err: error }, "Configured Stripe subscription price could not be retrieved.");
    return res.status(503).json({
      error: "The configured subscription plan could not be verified with Stripe.",
      code: "PRICE_CONFIGURATION_INVALID",
    });
  }
  if (!isExpectedCheckoutPrice(configuredPrice, process.env.NODE_ENV === "production")) {
    req.log.error(
      {
        priceId,
        expectedMode: process.env.NODE_ENV === "production" ? "live" : "test",
        active: configuredPrice.active,
        currency: configuredPrice.currency,
        unitAmount: configuredPrice.unit_amount,
        type: configuredPrice.type,
        recurringInterval: configuredPrice.recurring?.interval,
        recurringIntervalCount: configuredPrice.recurring?.interval_count,
        recurringUsageType: configuredPrice.recurring?.usage_type,
      },
      "Configured Stripe subscription price does not match the published Facility plan.",
    );
    return res.status(503).json({
      error: "The configured subscription plan does not match the Facility plan. Contact support.",
      code: "PRICE_CONFIGURATION_INVALID",
    });
  }
  const base = getReturnBase(req);
  const clerkUserId = (req as any).clerkUserId as string;
  const email = accountUser.email ?? (req as any).clerkEmail ?? undefined;

  // Create or reuse Stripe customer
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customerParams = new URLSearchParams({
      name: account.facilityName,
      ...(email ? { email } : {}),
      "metadata[accountId]": account.id,
      // `ccn` is kept as the key so existing Stripe views and any saved filters
      // keep working, but the value is whichever identifier this account has.
      // `identifierType` is what says which kind it is — without it, a
      // consultant's CONS-… identifier reads as a malformed CCN in the Stripe
      // dashboard.
      "metadata[ccn]": account.ccn,
      "metadata[identifierType]": account.identifierType,
      "metadata[clerkUserId]": clerkUserId,
    });
    let customer: { id: string };
    try {
      customer = await stripe.request<{ id: string }>("/v1/customers", {
        method: "POST",
        body: customerParams,
        idempotencyKey: `cms-customer-${account.id}`,
      });
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Stripe customer could not be created.");
      return res.status(503).json({
        error: "Secure checkout could not be opened. Please try again or contact support.",
        code: "CHECKOUT_UNAVAILABLE",
      });
    }
    await db.update(accounts).set({ stripeCustomerId: customer.id })
      .where(eq(accounts.id, account.id));
    customerId = customer.id;
  }

  // Serialize session lookup/creation for this account across API instances.
  // Reuse a still-open session so concurrent requests cannot produce separate
  // subscriptions; a fresh random idempotency key below applies to each new
  // attempt and cannot replay an abandoned session after Stripe's 24-hour key
  // retention window.
  const checkoutResult = await db.transaction(async (tx) => {
    const [currentAccount] = await tx.select({
      id: accounts.id,
      ccn: accounts.ccn,
      identifierType: accounts.identifierType,
      stripeCustomerId: accounts.stripeCustomerId,
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      subscriptionStatus: accounts.subscriptionStatus,
      subscriptionCanceledAt: accounts.subscriptionCanceledAt,
      trialEndsAt: accounts.trialEndsAt,
    }).from(accounts).where(eq(accounts.id, account.id)).for("update").limit(1);
    if (!currentAccount) return { kind: "account-missing" as const };
    if (
      currentAccount.subscriptionStatus === "removed" &&
      (
        removalMarkerAtRequest === null ||
        (currentAccount.subscriptionCanceledAt?.getTime() ?? 0) !==
          removalMarkerAtRequest
      )
    ) {
      return { kind: "account-removal-changed" as const };
    }

    const [lockedAccountUser] = await tx.select({
      hasComplimentaryAccess: accountUsers.hasComplimentaryAccess,
      complimentaryAccessGrantedBy: accountUsers.complimentaryAccessGrantedBy,
      complimentaryAccessEndsAt: accountUsers.complimentaryAccessEndsAt,
    }).from(accountUsers)
      .where(and(
        eq(accountUsers.id, accountUser.id),
        eq(accountUsers.accountId, account.id),
      ))
      .for("update")
      .limit(1);
    if (!lockedAccountUser) return { kind: "account-membership-missing" as const };

    const lockedCustomerId = currentAccount.stripeCustomerId ?? customerId;
    let subscriptionStatuses: string[];
    try {
      subscriptionStatuses = await loadStripeSubscriptionHistory(stripe, lockedCustomerId);
    } catch (error) {
      req.log.error(
        { err: error, accountId: account.id },
        "Complete Stripe subscription history could not be verified.",
      );
      return { kind: "subscription-history-unavailable" as const };
    }

    if (hasCheckoutBlockingSubscription({
      accountSubscriptionStatus: currentAccount.subscriptionStatus,
      stripeSubscriptionId: currentAccount.stripeSubscriptionId,
      stripeSubscriptionStatuses: subscriptionStatuses,
    })) {
      return { kind: "already-subscribed" as const };
    }

    let checkoutNow: Date;
    try {
      checkoutNow = await getStripeCustomerCurrentTime(stripe, lockedCustomerId);
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Stripe customer billing clock could not be verified.");
      return { kind: "subscription-history-unavailable" as const };
    }
    const hasStripeSubscriptionHistory = Boolean(currentAccount.stripeSubscriptionId) ||
      subscriptionStatuses.length > 0;
    let trialPlan = resolveCheckoutTrialPlan({
      subscriptionStatus: currentAccount.subscriptionStatus,
      trialEndsAt: currentAccount.trialEndsAt,
      affiliateAccessGrantedBy: currentAccount.identifierType !== "consultant" &&
        lockedAccountUser?.complimentaryAccessGrantedBy === "affiliate-self-service"
        ? "affiliate-self-service"
        : null,
      affiliateAccessEndsAt: lockedAccountUser?.hasComplimentaryAccess
        ? lockedAccountUser.complimentaryAccessEndsAt
        : null,
      hasStripeSubscriptionHistory,
      now: checkoutNow,
    });
    if (
      trialPlan.kind === "first-direct" &&
      (
        trialPlan.trialPeriodDays !== 30 ||
        !isProductionTrialPeriodExactly30()
      )
    ) {
      req.log.error(
        { accountId: account.id, configuredTrialDays: process.env.STRIPE_TRIAL_PERIOD_DAYS },
        "First-direct setup Checkout must be configured for exactly 30 days.",
      );
      return { kind: "trial-configuration-invalid" as const };
    }

    // All new payment-method collection uses setup mode. The subscription is
    // created only after a single account-locked completion path, so an old
    // subscription-mode session cannot race a setup session into two charges.
    const expectedSessionMode = "setup";
    const expectedCheckoutPolicy = LOCAL_TRIAL_SETUP_POLICY;
    const currentRemovalMarker = currentAccount.subscriptionStatus === "removed"
      ? String(currentAccount.subscriptionCanceledAt?.getTime() ?? 0)
      : null;
    const trialPolicy = checkoutTrialPolicy(trialPlan);
    let existingSessions: OpenCheckoutSession[];
    try {
      existingSessions = await loadAllOpenCheckoutSessions(stripe, lockedCustomerId);
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Open Stripe Checkout sessions could not be verified.");
      return { kind: "checkout-sessions-unavailable" as const };
    }

    if (trialPlan.kind === "affiliate-expiring") {
      // Do not collect a card inside the final 49 hours of complimentary
      // access: setup completion would otherwise charge immediately. Expire
      // any previously created session for this account before instructing
      // the customer to return after the affiliate access period ends.
      try {
        for (const existingSession of existingSessions) {
          if (existingSession.client_reference_id !== account.id) continue;
          await stripe.request(
            `/v1/checkout/sessions/${encodeURIComponent(existingSession.id)}/expire`,
            { method: "POST" },
          );
        }
      } catch (error) {
        req.log.error({ err: error, accountId: account.id }, "A near-expiry affiliate Checkout session could not be expired.");
        return { kind: "checkout-sessions-unavailable" as const };
      }
      return { kind: "affiliate-trial-near-end" as const };
    }

    let reusableSession: OpenCheckoutSession | null = null;
    try {
      for (const existingSession of existingSessions) {
        const matchesCurrentPolicy =
          existingSession.client_reference_id === account.id &&
          existingSession.mode === expectedSessionMode &&
          existingSession.metadata?.checkoutPolicy === expectedCheckoutPolicy &&
          existingSession.metadata?.trialPolicy === trialPolicy &&
          existingSession.metadata?.priceId === priceId &&
          (currentRemovalMarker === null
            ? existingSession.metadata?.removalResubscribe !== "true"
            : existingSession.metadata?.removalResubscribe === "true" &&
              existingSession.metadata?.removedAt === currentRemovalMarker);
        if (!reusableSession && matchesCurrentPolicy && existingSession.url) {
          reusableSession = existingSession;
          continue;
        }

        // Sessions created under an old trial policy must not remain usable
        // after this route has determined the customer's current entitlement.
        await stripe.request(
          `/v1/checkout/sessions/${encodeURIComponent(existingSession.id)}/expire`,
          { method: "POST" },
        );
      }
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "An obsolete Checkout session could not be expired.");
      return { kind: "checkout-sessions-unavailable" as const };
    }
    trialPlan = resolveCheckoutTrialPlan({
      subscriptionStatus: currentAccount.subscriptionStatus,
      trialEndsAt: currentAccount.trialEndsAt,
      affiliateAccessGrantedBy: currentAccount.identifierType !== "consultant" &&
        lockedAccountUser?.complimentaryAccessGrantedBy === "affiliate-self-service"
        ? "affiliate-self-service"
        : null,
      affiliateAccessEndsAt: lockedAccountUser?.hasComplimentaryAccess
        ? lockedAccountUser.complimentaryAccessEndsAt
        : null,
      hasStripeSubscriptionHistory,
      now: checkoutNow,
    });
    if (
      trialPlan.kind === "first-direct" &&
      (
        trialPlan.trialPeriodDays !== 30 ||
        !isProductionTrialPeriodExactly30()
      )
    ) {
      req.log.error(
        { accountId: account.id, configuredTrialDays: process.env.STRIPE_TRIAL_PERIOD_DAYS },
        "First-direct setup Checkout must be configured for exactly 30 days.",
      );
      return { kind: "trial-configuration-invalid" as const };
    }

    const finalTrialPolicy = checkoutTrialPolicy(trialPlan);
    if (
      reusableSession &&
      (
        reusableSession.metadata?.trialPolicy !== finalTrialPolicy ||
        reusableSession.metadata?.priceId !== priceId
      )
    ) {
      try {
        await stripe.request(
          `/v1/checkout/sessions/${encodeURIComponent(reusableSession.id)}/expire`,
          { method: "POST" },
        );
        reusableSession = null;
      } catch (error) {
        req.log.error({ err: error, accountId: account.id }, "A stale Checkout session could not be expired.");
        return { kind: "checkout-sessions-unavailable" as const };
      }
    }
    if (reusableSession) {
      return { kind: "checkout-url" as const, url: reusableSession.url };
    }

    const setupParams = new URLSearchParams({
      customer: lockedCustomerId,
      mode: "setup",
      "payment_method_types[0]": "card",
      // Setup-mode Checkout does not accept setup_intent_data[usage]. Its
      // SetupIntent defaults to off_session; Managed Payments must be opted
      // out for this card-collection-only session.
      "managed_payments[enabled]": "false",
      success_url: `${base}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing?checkout=canceled`,
      client_reference_id: account.id,
      "metadata[accountId]": account.id,
      "metadata[ccn]": currentAccount.ccn,
      "metadata[identifierType]": currentAccount.identifierType,
      "metadata[clerkUserId]": clerkUserId,
      "metadata[checkoutPolicy]": LOCAL_TRIAL_SETUP_POLICY,
      "metadata[setupPolicy]": LOCAL_TRIAL_SETUP_POLICY,
      "metadata[trialPolicy]": finalTrialPolicy,
      "metadata[priceId]": priceId,
      "metadata[trialPeriodDays]": trialPlan.kind === "first-direct"
        ? String(trialPlan.trialPeriodDays)
        : "0",
      "setup_intent_data[metadata][accountId]": account.id,
      "setup_intent_data[metadata][setupPolicy]": LOCAL_TRIAL_SETUP_POLICY,
    });
    if (currentAccount.subscriptionStatus === "removed") {
      setupParams.set("metadata[removalResubscribe]", "true");
      setupParams.set("metadata[removedAt]", String(removalMarkerAtRequest));
      setupParams.set("metadata[authenticatedCheckoutAt]", String(checkoutAuthenticatedAt));
    }

    let session: { url: string | null };
    try {
      session = await stripe.request<{ url: string | null }>("/v1/checkout/sessions", {
        method: "POST",
        body: setupParams,
        idempotencyKey: `cms-setup-checkout-${account.id}-${randomUUID()}`,
      });
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Stripe card setup Checkout could not be created.");
      return { kind: "checkout-unavailable" as const };
    }
    return { kind: "checkout-url" as const, url: session.url };
  });

  if (checkoutResult.kind === "account-missing") {
    return res.status(404).json({ error: "No facility account found" });
  }
  if (checkoutResult.kind === "account-membership-missing") {
    return res.status(409).json({
      error: "Workspace membership changed while checkout was being prepared. Refresh and try again.",
      code: "ACCOUNT_MEMBERSHIP_CHANGED",
    });
  }
  if (checkoutResult.kind === "account-removal-changed") {
    return res.status(409).json({
      error: "This account was removed while checkout was being prepared. Start a new authenticated checkout to restore billing.",
      code: "ACCOUNT_REMOVED",
    });
  }
  if (checkoutResult.kind === "affiliate-trial-near-end") {
    return res.status(409).json({
      error: "Affiliate workspace access is close to ending. Wait until it expires before adding a card to avoid an early charge.",
      code: "AFFILIATE_TRIAL_NEAR_END",
    });
  }
  if (checkoutResult.kind === "checkout-unavailable") {
    return res.status(503).json({
      error: "Secure checkout could not be opened. Please try again or contact support.",
      code: "CHECKOUT_UNAVAILABLE",
    });
  }
  if (checkoutResult.kind === "already-subscribed") {
    return res.status(409).json({
      error: "This facility has an existing Stripe subscription that must be resolved before checkout.",
      code: "ALREADY_SUBSCRIBED",
    });
  }
  if (checkoutResult.kind === "trial-configuration-invalid") {
    return res.status(503).json({
      error: "The first-direct subscription trial must be configured for exactly 30 days.",
      code: "TRIAL_CONFIGURATION_INVALID",
    });
  }
  if (
    checkoutResult.kind === "subscription-history-unavailable" ||
    checkoutResult.kind === "checkout-sessions-unavailable"
  ) {
    return res.status(503).json({
      error: "The existing Stripe subscription state could not be verified. Please try again.",
      code: "SUBSCRIPTION_STATE_UNAVAILABLE",
    });
  }
  if (!checkoutResult.url) {
    return res.status(502).json({ error: "Stripe did not return a checkout URL." });
  }
  return res.status(201).json({ url: checkoutResult.url });
});

// POST /api/billing/checkout/confirm — authenticated fallback after Stripe return
router.post("/checkout/confirm", requireAuth, async (req, res) => {
  if (!isPaymentAcceptanceEnabled()) {
    return res.status(503).json({ error: "Payment acceptance is not enabled yet." });
  }
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ error: "A valid Checkout session is required." });
  }
  const membership = await getUserAccount((req as any).clerkUserId);
  if (!membership) return res.status(404).json({ error: "No facility account found" });
  const session = await stripeRequest<{
    client_reference_id: string | null;
    customer: string | { id: string } | null;
    subscription: string | { id: string } | null;
    setup_intent: string | { id: string } | null;
    created: number;
    mode: string | null;
    metadata: Record<string, string> | null;
    payment_status: string;
    status: string | null;
  }>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  if (
    session.client_reference_id !== membership.account.id ||
    customerId !== membership.account.stripeCustomerId
  ) {
    return res.status(403).json({ error: "This Checkout session does not belong to this facility." });
  }
  if (
    session.mode === "setup" &&
    session.metadata?.setupPolicy === LOCAL_TRIAL_SETUP_POLICY
  ) {
    if (session.status !== "complete" || !session.setup_intent) {
      return res.status(409).json({ error: "Card setup is not complete yet." });
    }
    const subscriptionId = await createSubscriptionFromSetupCheckout({
      id: sessionId,
      created: session.created,
      mode: session.mode,
      status: session.status,
      client_reference_id: session.client_reference_id,
      customer: session.customer,
      setup_intent: session.setup_intent,
      metadata: session.metadata,
    });
    if (!subscriptionId) {
      return res.status(409).json({
        error: "This account was removed after the setup session was created. Start a new authenticated checkout after removal.",
        code: "ACCOUNT_REMOVED",
      });
    }
    return res.json({ synchronized: true, subscriptionId });
  }
  if (session.status !== "complete" || !session.subscription || session.mode !== "subscription") {
    return res.status(409).json({ error: "Checkout is not complete yet." });
  }
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription.id;
  await syncStripeSubscriptionById(subscriptionId);
  return res.json({ synchronized: true });
});

// POST /api/billing/portal
router.post("/portal", requireAuth, async (req, res) => {
  if (!isPaymentAcceptanceEnabled()) {
    return res.status(503).json({
      error: "Payment acceptance is not enabled yet.",
      code: "PAYMENTS_DISABLED",
    });
  }

  const stripe = await getStripeOptional();
  if (!stripe) {
    return res.status(503).json({ error: "Payment processing is not yet configured." });
  }

  const membership = await getUserAccount((req as any).clerkUserId);
  const account = membership?.account;
  if (!account?.stripeCustomerId) {
    return res.status(404).json({ error: "No billing account found" });
  }

  const base = getReturnBase(req);

  let portalConfigurationId: string;
  try {
    portalConfigurationId = await getPeriodEndOnlyPortalConfigurationId();
  } catch (error) {
    req.log.error({ err: error }, "A safe Stripe Billing Portal configuration could not be prepared.");
    return res.status(503).json({
      error: "Secure billing management is temporarily unavailable. Please try again or contact support.",
    });
  }
  const portalParams = new URLSearchParams({
    customer: account.stripeCustomerId,
    return_url: `${base}/billing`,
    configuration: portalConfigurationId,
  });
  const portalSession = await stripe.request<{ url: string }>("/v1/billing_portal/sessions", {
    method: "POST",
    body: portalParams,
  });

  return res.json({ url: portalSession.url });
});

// GET /api/billing/token-usage — current month activity for the user's account.
//
// This response is customer-facing, so it carries NO money. AI token cost is
// included in the subscription fee (Terms 13.6), and the cost figures behind it
// — raw provider cost and the markup applied to it — are internal operating
// data that no customer should receive, not even in a devtools network tab.
// The operator view of the same numbers lives at GET /api/admin/token-usage and
// in the cost-alert digest, both behind an admin guard.
router.get("/token-usage", requireAuth, async (req, res) => {
  const membership = await getUserAccount((req as any).clerkUserId);
  const account = membership?.account;
  if (!account) return res.json({
    currentMonth: {
      inputTokens: 0, outputTokens: 0, totalTokens: 0,
      requestCount: 0, monthLabel: currentMonthLabel(),
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await db
    .select()
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.accountId, account.id),
        gte(tokenUsage.createdAt, monthStart),
      )
    );

  const inputTokens  = rows.reduce((s, r) => s + (r.inputTokens  ?? 0), 0);
  const outputTokens = rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0);

  return res.json({
    currentMonth: {
      inputTokens,
      outputTokens,
      totalTokens:  inputTokens + outputTokens,
      requestCount: rows.length,
      monthLabel:   currentMonthLabel(),
    },
  });
});

function currentMonthLabel() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default router;
