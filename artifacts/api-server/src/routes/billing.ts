import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accounts, accountUsers, tokenUsage } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "./accounts";

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
  return account ?? null;
}

// GET /api/billing/subscription
router.get("/subscription", requireAuth, async (req, res) => {
  const account = await getUserAccount((req as any).clerkUserId);
  if (!account) return res.json({ subscription: null });

  const now = new Date();
  const trialActive = account.subscriptionStatus === "trial" &&
    account.trialEndsAt != null && account.trialEndsAt > now;

  return res.json({
    subscription: {
      status:          account.subscriptionStatus,
      stripeId:        account.stripeSubscriptionId,
      trialEndsAt:     account.trialEndsAt,
      isActive:        account.subscriptionStatus === "active" || trialActive,
      daysLeftInTrial: trialActive
        ? Math.ceil((account.trialEndsAt!.getTime() - now.getTime()) / 86_400_000)
        : 0,
    },
  });
});

// POST /api/billing/checkout  { priceId }
router.post("/checkout", requireAuth, async (req, res) => {
  const stripe = await getStripeOptional();
  if (!stripe) {
    return res.status(503).json({ error: "Payment processing is not yet configured." });
  }

  const account = await getUserAccount((req as any).clerkUserId);
  if (!account) return res.status(404).json({ error: "No facility account found" });

  const { priceId } = req.body as { priceId: string };
  if (!priceId) return res.status(400).json({ error: "priceId is required" });

  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host     = req.headers["x-forwarded-host"] ?? req.headers.host;
  const base     = `${protocol}://${host}`;

  // Create or reuse Stripe customer
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name:     account.facilityName,
      metadata: { accountId: account.id, ccn: account.ccn },
    });
    await db.update(accounts).set({ stripeCustomerId: customer.id })
      .where(eq(accounts.id, account.id));
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    mode:                 "subscription",
    success_url:          `${base}/billing?success=1`,
    cancel_url:           `${base}/billing?canceled=1`,
    metadata:             { accountId: account.id, ccn: account.ccn },
  });

  return res.json({ url: session.url });
});

// GET /api/billing/portal
router.get("/portal", requireAuth, async (req, res) => {
  const stripe = await getStripeOptional();
  if (!stripe) {
    return res.status(503).json({ error: "Payment processing is not yet configured." });
  }

  const account = await getUserAccount((req as any).clerkUserId);
  if (!account?.stripeCustomerId) {
    return res.status(404).json({ error: "No billing account found" });
  }

  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host     = req.headers["x-forwarded-host"] ?? req.headers.host;
  const base     = `${protocol}://${host}`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   account.stripeCustomerId,
    return_url: `${base}/billing`,
  });

  return res.json({ url: portalSession.url });
});

// GET /api/billing/token-usage — current month aggregate for the user's account
router.get("/token-usage", requireAuth, async (req, res) => {
  const account = await getUserAccount((req as any).clerkUserId);
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
