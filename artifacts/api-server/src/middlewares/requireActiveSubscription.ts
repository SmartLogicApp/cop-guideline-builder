import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { accountUsers, accounts, adminUsers, db } from "@workspace/db";
import { hasEffectiveAccess, hasUnexpiredComplimentaryAccess } from "./subscriptionAccess";
import { runAccountSubscriptionLifecycle } from "../lib/subscription-lifecycle";

export const PAYMENT_REQUIRED_RESPONSE = {
  error: "An active subscription or trial is required",
  code: "SUBSCRIPTION_REQUIRED",
} as const;

export async function getSubscriptionAccess(clerkUserId: string, now = new Date()) {
  const isConfiguredSuperAdmin = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(clerkUserId);
  let [admin, membership] = await Promise.all([
    db.select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.clerkUserId, clerkUserId), eq(adminUsers.isActive, true)))
      .limit(1),
    db.select({ accountUser: accountUsers, account: accounts })
      .from(accountUsers)
      .leftJoin(accounts, eq(accountUsers.accountId, accounts.id))
      .where(eq(accountUsers.clerkUserId, clerkUserId))
      .limit(1),
  ]);

  let account = membership[0]?.account ?? null;
  let accountUser = membership[0]?.accountUser ?? null;
  if (account) {
    await runAccountSubscriptionLifecycle(account);
    // Re-read the canonical state before computing access. Stripe may have
    // changed it while the client was away; never grant access from stale data.
    [membership] = await Promise.all([
      db.select({ accountUser: accountUsers, account: accounts })
        .from(accountUsers)
        .leftJoin(accounts, eq(accountUsers.accountId, accounts.id))
        .where(eq(accountUsers.clerkUserId, clerkUserId))
        .limit(1),
    ]);
    account = membership[0]?.account ?? null;
    accountUser = membership[0]?.accountUser ?? null;
  }
  const isAdminUser = isConfiguredSuperAdmin || admin.length > 0;
  const hasComplimentaryAccess = hasUnexpiredComplimentaryAccess(
    accountUser,
    account?.subscriptionStatus,
    now,
  );

  return {
    account,
    accountUser,
    isAdminUser,
    hasComplimentaryAccess,
    accessSource: isAdminUser
      ? "admin"
      : hasComplimentaryAccess
        ? "complimentary"
        : "subscription",
    isActive: hasEffectiveAccess({
      isAdminUser,
      hasComplimentaryAccess,
      account,
      now,
    }),
  };
}

export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const clerkUserId = (req as Request & { clerkUserId?: string }).clerkUserId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const access = await getSubscriptionAccess(clerkUserId);
    if (!access.isActive) {
      res.status(402).json(PAYMENT_REQUIRED_RESPONSE);
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}