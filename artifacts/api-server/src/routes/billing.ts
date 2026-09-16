import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { accounts, accountUsers, tokenUsage } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription";
import { isPaymentAcceptanceEnabled } from "../lib/payment-config";
import { getConfiguredStripePriceId } from "../stripeClient";

const router: IRouter = Router();

async function getStripeOptional() {
  try {
    const { getUncachableStripeClient } = await import("../stripeClient");
    return await getUncachableStripeClient();
  } catch {
    return null;
  }
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

function getReturnBase(req: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error("Unable to determine a safe return URL.");
  return `${protocol}://${host}`;
}

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
  const trialActive = account.subscriptionStatus === "trial" &&
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
  const base = getReturnBase(req);
  const clerkUserId = (req as any).clerkUserId as string;
  const email = accountUser.email ?? (req as any).clerkEmail ?? undefined;

  // Create or reuse Stripe customer
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name:     account.facilityName,
      email,
      metadata: { accountId: account.id, ccn: account.ccn, clerkUserId },
    }, { idempotencyKey: `cms-customer-${account.id}` });
    await db.update(accounts).set({ stripeCustomerId: customer.id })
      .where(eq(accounts.id, account.id));
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    mode:                 "subscription",
    success_url:          `${base}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:           `${base}/billing?checkout=canceled`,
    client_reference_id:  account.id,
    metadata:             { accountId: account.id, ccn: account.ccn, clerkUserId },
    subscription_data: {
      metadata: { accountId: account.id, ccn: account.ccn, clerkUserId },
    },
  }, { idempotencyKey: `cms-checkout-${account.id}-${priceId}` });

  if (!session.url) {
    return res.status(502).json({ error: "Stripe did not return a checkout URL." });
  }
  return res.status(201).json({ url: session.url });
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

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   account.stripeCustomerId,
    return_url: `${base}/billing`,
  });

  return res.json({ url: portalSession.url });
});

// GET /api/billing/token-usage — current month aggregate for the user's account
router.get("/token-usage", requireAuth, async (req, res) => {
  const membership = await getUserAccount((req as any).clerkUserId);
  const account = membership?.account;
  if (!account) return res.json({
    currentMonth: {
      inputTokens: 0, outputTokens: 0, totalTokens: 0,
      requestCount: 0, rawCostUsd: 0, markupUsd: 0,
      totalAdditionalChargeUsd: 0, monthLabel: currentMonthLabel(),
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
  const rawCostUsd   = rows.reduce((s, r) => s + (r.rawCostUsd   ?? 0), 0);
  const markupUsd    = rows.reduce((s, r) => s + (r.markedUpCostUsd ?? 0), 0) - rawCostUsd;

  return res.json({
    currentMonth: {
      inputTokens,
      outputTokens,
      totalTokens:              inputTokens + outputTokens,
      requestCount:             rows.length,
      rawCostUsd:               round(rawCostUsd),
      markupUsd:                round(markupUsd),
      totalAdditionalChargeUsd: round(rawCostUsd + markupUsd),
      monthLabel:               currentMonthLabel(),
    },
  });
});

function round(n: number) { return Math.round(n * 1_000_000) / 1_000_000; }

function currentMonthLabel() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default router;
