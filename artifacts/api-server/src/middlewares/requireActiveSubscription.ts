import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { accountUsers, accounts, adminUsers, db } from "@workspace/db";
import { hasEffectiveAccess, hasUnexpiredComplimentaryAccess } from "./subscriptionAccess";
import { runAccountSubscriptionLifecycle } from "../lib/subscription-lifecycle";
import { resolveSuperAdmin, type SuperAdminResolution } from "../lib/super-admin-identities.js";

export const PAYMENT_REQUIRED_RESPONSE = {
  error: "An active subscription or trial is required",
  code: "SUBSCRIPTION_REQUIRED",
} as const;

export async function getSubscriptionAccess(
  clerkUserId: string,
  now = new Date(),
  resolvedSuperAdmin?: SuperAdminResolution,
) {
  const superAdminResolution = resolvedSuperAdmin ?? await resolveSuperAdmin(clerkUserId);
  const isSuperAdmin = Boolean(superAdminResolution.source);
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
  const isAdminUser = isSuperAdmin || admin.length > 0;
  const hasComplimentaryAccess = hasUnexpiredComplimentaryAccess(
    accountUser,
    account?.subscriptionStatus,
    now,
  );

  return {
    account,
    accountUser,
    isSuperAdmin,
    isAdminUser,
    superAdminAuthorizationSource: superAdminResolution.source,
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
    (req as any).isSuperAdmin = access.isSuperAdmin;
    if (access.superAdminAuthorizationSource) {
      (req as any).adminAuthorizationSource = access.superAdminAuthorizationSource;
      if (access.isSuperAdmin) {
        (req as any).log?.info?.({
          actorId: clerkUserId,
          authorizationSource: access.superAdminAuthorizationSource,
        }, "Super-admin access granted");
      }
    }
    if (!access.isActive) {
      res.status(402).json(PAYMENT_REQUIRED_RESPONSE);
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}