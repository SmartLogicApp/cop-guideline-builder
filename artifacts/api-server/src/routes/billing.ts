import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { accounts, accountUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
