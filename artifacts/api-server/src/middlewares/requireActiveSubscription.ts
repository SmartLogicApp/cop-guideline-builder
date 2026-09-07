import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { accountUsers, accounts, adminUsers, db } from "@workspace/db";
import { hasActiveSubscription } from "./subscriptionAccess";

export const PAYMENT_REQUIRED_RESPONSE = {
  error: "An active subscription or trial is required",
  code: "SUBSCRIPTION_REQUIRED",
} as const;

export async function getSubscriptionAccess(clerkUserId: string, now = new Date()) {
  const [admin, membership] = await Promise.all([
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

  const account = membership[0]?.account ?? null;
  const isAdminUser = admin.length > 0;

  return {
    account,
    accountUser: membership[0]?.accountUser ?? null,
    isAdminUser,
    isActive: isAdminUser || hasActiveSubscription(account, now),
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