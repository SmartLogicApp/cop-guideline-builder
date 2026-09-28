import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { adminUsers } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { resolveSuperAdmin } from "./super-admin-identities.js";

/**
 * The admin authorization guards, in one place.
 *
 * WHY THIS EXISTS: these were private to routes/admin.ts. The affiliate routes
 * need the same protection, and the obvious move — copying the three functions
 * into a second router — is how one copy ends up weaker than the other. It is
 * the same failure that produced an unguarded return-URL helper in admin.ts
 * while billing.ts had a guarded one (see lib/return-base.ts).
 *
 * Affiliate routes expose commission amounts and customer attribution, so a
 * weaker guard there is worse than a weaker guard almost anywhere else in the
 * application. One implementation, imported by both.
 */

function markAdminAuthorization(
  req: Request,
  userId: string,
  source: string,
  isSuperAdmin: boolean,
) {
  (req as any).clerkUserId = userId;
  (req as any).isSuperAdmin = isSuperAdmin;
  (req as any).adminAuthorizationSource = source;
  if (isSuperAdmin) {
    (req as any).log?.info?.(
      { actorId: userId, authorizationSource: source },
      "Super-admin access granted",
    );
  }
}

// ─── requireSuperAdmin — exact ID allowlist or verified owner identity ───────

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const authorization = await resolveSuperAdmin(userId);
  if (authorization.lookupFailed) {
    return res.status(503).json({ error: "Super-admin identity could not be verified." });
  }
  if (!authorization.source)
    return res.status(403).json({ error: "Super-admin access required" });
  markAdminAuthorization(req, userId, authorization.source, true);
  return next();
}

/**
 * The secret an external scheduler presents to run the cron endpoints.
 *
 * This has to be handed to whatever service calls them — a scheduled job, a CI
 * runner, an uptime pinger — so it must NOT be the secret that signs sessions.
 * Sharing SESSION_SECRET with a third party means a compromise there is a
 * compromise of every session, and it makes the two impossible to rotate
 * independently. CRON_SECRET is therefore preferred; SESSION_SECRET remains a
 * fallback only so an existing schedule keeps working until CRON_SECRET is set.
 *
 * Set CRON_SECRET and the fallback stops being consulted.
 */
export function getSchedulerSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || undefined;
}

/** Constant-time compare, so a wrong token can't be found a byte at a time. */
export function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireCronOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const authorization = req.get("authorization");
  const schedulerSecret = getSchedulerSecret();
  if (schedulerSecret && authorization?.startsWith("Bearer ")
      && secretsMatch(authorization.slice("Bearer ".length), schedulerSecret)) {
    return next();
  }
  return requireSuperAdmin(req, res, next);
}

// ─── requireAnyAdmin — env-var OR active DB admin ────────────────────────────

export async function requireAnyAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Super-admin check first; only a verified primary email returned by Clerk
  // can grant the explicit owner-email identity.
  const authorization = await resolveSuperAdmin(userId);
  if (authorization.source) {
    markAdminAuthorization(req, userId, authorization.source, true);
    return next();
  }

  // DB-managed admin check
  try {
    const [row] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.clerkUserId, userId), eq(adminUsers.isActive, true)))
      .limit(1);

    if (!row) {
      if (authorization.lookupFailed) {
        return res.status(503).json({ error: "Admin identity could not be verified." });
      }
      return res.status(403).json({ error: "Admin access required" });
    }
    markAdminAuthorization(req, userId, "active_admin_database_record", false);
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}
