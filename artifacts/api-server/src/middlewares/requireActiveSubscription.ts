import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { accountUsers, accounts, adminUsers, db } from "@workspace/db";
import { hasEffectiveAccess } from "./subscriptionAccess";

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
  const accountUser = membership[0]?.accountUser ?? null;
  const isAdminUser = isConfiguredSuperAdmin || admin.length > 0;
  const hasComplimentaryAccess = accountUser?.hasComplimentaryAccess === true;

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