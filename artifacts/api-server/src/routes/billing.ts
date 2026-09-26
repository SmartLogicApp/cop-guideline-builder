import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accounts, accountUsers, tokenUsage } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription";
import { isTrialStatus } from "../middlewares/subscriptionAccess";
import {
  isPaymentAcceptanceEnabled,
  isProductionTrialPeriodExactly30,
  isRecoverableStripeSubscriptionStatus,
  resolveCheckoutTrialPlan,
} from "../lib/payment-config";
import { getReturnBase } from "../lib/return-base.js";
import { CURRENT_TERMS_VERSION, needsAcceptance } from "../lib/terms-versions";
import { getConfiguredStripePriceId, isStripeConfigured, stripeRequest } from "../stripeClient";
import { syncStripeSubscriptionById } from "../webhookHandlers";

const router: IRouter = Router();
const EXPECTED_MONTHLY_PRICE_CENTS = 29_900;
const MAX_STRIPE_SUBSCRIPTION_HISTORY_PAGES = 100;

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

function checkoutTrialPolicy(trialPlan: ReturnType<typeof resolveCheckoutTrialPlan>): string {
  switch (trialPlan.kind) {
    case "first-direct":
      return `first-direct-${trialPlan.trialPeriodDays}`;
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
    },
    paymentAcceptanceEnabled,
    plan: paymentAcceptanceEnabled
      ? { name: "Facility", amountUsd: 299, interval: "month" }
      : null,
    canManageBilling: Boolean(account.stripeCustomerId),
  });
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
      trialEndsAt: accounts.trialEndsAt,
    }).from(accounts).where(eq(accounts.id, account.id)).for("update").limit(1);
    if (!currentAccount) return { kind: "account-missing" as const };

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

    if (
      (currentAccount.stripeSubscriptionId &&
        isRecoverableStripeSubscriptionStatus(currentAccount.subscriptionStatus ?? "")) ||
      subscriptionStatuses.some(isRecoverableStripeSubscriptionStatus)
    ) {
      return { kind: "already-subscribed" as const };
    }

    const hasStripeSubscriptionHistory = Boolean(currentAccount.stripeSubscriptionId) ||
      subscriptionStatuses.length > 0;
    let trialPlan = resolveCheckoutTrialPlan({
      subscriptionStatus: currentAccount.subscriptionStatus,
      trialEndsAt: currentAccount.trialEndsAt,
      hasStripeSubscriptionHistory,
    });
    if (trialPlan.kind === "local-trial-active") {
      return { kind: "local-trial-active" as const, trialEnd: trialPlan.trialEnd };
    }
    if (
      process.env.NODE_ENV === "production" &&
      trialPlan.kind === "first-direct" &&
      (
        trialPlan.trialPeriodDays !== 30 ||
        !isProductionTrialPeriodExactly30()
      )
    ) {
      req.log.error(
        { accountId: account.id, configuredTrialDays: process.env.STRIPE_TRIAL_PERIOD_DAYS },
        "Production direct-checkout trial must be configured for exactly 30 days.",
      );
      return { kind: "trial-configuration-invalid" as const };
    }

    const trialPolicy = checkoutTrialPolicy(trialPlan);
    let existingSessions: {
      data: {
        id: string;
        url: string | null;
        mode: string | null;
        status: string | null;
        client_reference_id: string | null;
        metadata: Record<string, string> | null;
      }[];
    };
    try {
      existingSessions = await stripe.request(
        `/v1/checkout/sessions?customer=${encodeURIComponent(lockedCustomerId)}&status=open&limit=100`,
      );
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Open Stripe Checkout sessions could not be verified.");
      return { kind: "checkout-sessions-unavailable" as const };
    }

    let reusableSession: (typeof existingSessions.data)[number] | null = null;
    try {
      for (const existingSession of existingSessions.data) {
        if (
          existingSession.client_reference_id !== account.id ||
          existingSession.mode !== "subscription"
        ) continue;

        const matchesCurrentPolicy =
          existingSession.metadata?.checkoutPolicy === "facility-trial-v2" &&
          existingSession.metadata?.trialPolicy === trialPolicy &&
          existingSession.metadata?.priceId === priceId;
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
      hasStripeSubscriptionHistory,
    });
    if (trialPlan.kind === "local-trial-active") {
      if (reusableSession) {
        try {
          await stripe.request(
            `/v1/checkout/sessions/${encodeURIComponent(reusableSession.id)}/expire`,
            { method: "POST" },
          );
        } catch (error) {
          req.log.error({ err: error, accountId: account.id }, "A soon-to-expire trial Checkout session could not be expired.");
          return { kind: "checkout-sessions-unavailable" as const };
        }
      }
      return { kind: "local-trial-active" as const, trialEnd: trialPlan.trialEnd };
    }
    if (
      process.env.NODE_ENV === "production" &&
      trialPlan.kind === "first-direct" &&
      (
        trialPlan.trialPeriodDays !== 30 ||
        !isProductionTrialPeriodExactly30()
      )
    ) {
      req.log.error(
        { accountId: account.id, configuredTrialDays: process.env.STRIPE_TRIAL_PERIOD_DAYS },
        "Production direct-checkout trial must be configured for exactly 30 days.",
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

    const checkoutParams = new URLSearchParams({
      customer: lockedCustomerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      // The card is collected up front and the subscription charges
      // automatically when its Stripe-owned trial ends.
      payment_method_collection: "always",
      success_url: `${base}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing?checkout=canceled`,
      client_reference_id: account.id,
      "metadata[accountId]": account.id,
      "metadata[ccn]": currentAccount.ccn,
      "metadata[identifierType]": currentAccount.identifierType,
      "metadata[clerkUserId]": clerkUserId,
      "metadata[checkoutPolicy]": "facility-trial-v2",
      "metadata[trialPolicy]": finalTrialPolicy,
      "metadata[priceId]": priceId,
      "subscription_data[metadata][accountId]": account.id,
      "subscription_data[metadata][ccn]": currentAccount.ccn,
      "subscription_data[metadata][identifierType]": currentAccount.identifierType,
      "subscription_data[metadata][clerkUserId]": clerkUserId,
    });
    if (trialPlan.kind === "first-direct" && trialPlan.trialPeriodDays > 0) {
      checkoutParams.set(
        "subscription_data[trial_period_days]",
        String(trialPlan.trialPeriodDays),
      );
    } else if (trialPlan.kind === "existing-local") {
      checkoutParams.set("subscription_data[trial_end]", String(trialPlan.trialEnd));
    }

    let session: { url: string | null };
    try {
      session = await stripe.request<{ url: string | null }>("/v1/checkout/sessions", {
        method: "POST",
        body: checkoutParams,
        idempotencyKey: `cms-checkout-${account.id}-${randomUUID()}`,
      });
    } catch (error) {
      req.log.error({ err: error, accountId: account.id }, "Stripe Checkout session could not be created.");
      return { kind: "checkout-unavailable" as const };
    }
    return { kind: "checkout-url" as const, url: session.url };
  });

  if (checkoutResult.kind === "account-missing") {
    return res.status(404).json({ error: "No facility account found" });
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
      error: "The production subscription trial must be configured for exactly 30 days.",
      code: "TRIAL_CONFIGURATION_INVALID",
    });
  }
  if (checkoutResult.kind === "local-trial-active") {
    return res.status(409).json({
      error: "Your existing trial is still active and ends too soon for a Stripe trial. Please return after it ends.",
      code: "LOCAL_TRIAL_STILL_ACTIVE",
      trialEndsAt: new Date(checkoutResult.trialEnd * 1000).toISOString(),
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
  if (session.status !== "complete" || !session.subscription) {
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

  const portalParams = new URLSearchParams({
    customer: account.stripeCustomerId,
    return_url: `${base}/billing`,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID }
      : {}),
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
