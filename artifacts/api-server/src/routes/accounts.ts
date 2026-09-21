import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { accounts, accountUsers, termsAcceptances } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  lookupCCN,
  isValidProviderIdentifier,
  providerIdentifierError,
  MANUAL_VERIFICATION_MESSAGE,
  MANUAL_VERIFICATION_TYPES,
} from "../lib/ccn-lookup.js";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription.js";

import {
  CURRENT_TERMS_VERSION,
  isAcceptableVersion,
  needsAcceptance,
} from "../lib/terms-versions.js";

const router: IRouter = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  (req as any).clerkUserId = userId;
  (req as any).clerkEmail = (auth as any)?.sessionClaims?.email ?? null;
  return next();
}
// GET /api/accounts/validate-ccn?ccn=XXXXXX&institutionType=TYPE
router.get("/validate-ccn", requireAuth, async (req, res) => {
  const ccn = (req.query.ccn as string | undefined)?.trim().toUpperCase();
  const institutionType = (req.query.institutionType as string | undefined)?.trim().toLowerCase();
  if (!ccn || !isValidProviderIdentifier(ccn, institutionType)) {
    return res.status(400).json({ error: providerIdentifierError(institutionType) });
  }

  const existing = await db.select().from(accounts).where(eq(accounts.ccn, ccn)).limit(1);
  if (existing.length) {
    return res.json({
      ccn,
      alreadyRegistered: true,
      facilityName: existing[0].facilityName,
      facilityType: existing[0].facilityType,
      state: existing[0].state,
      city: existing[0].city,
      verificationMode: "registered",
      message: null,
    });
  }

  if (institutionType && MANUAL_VERIFICATION_TYPES.has(institutionType)) {
    return res.json({
      ccn,
      alreadyRegistered: false,
      found: false,
      facilityName: null,
      state: null,
      city: null,
      facilityType: institutionType,
      verificationMode: "manual",
      message: MANUAL_VERIFICATION_MESSAGE,
    });
  }

  const info = await lookupCCN(ccn, institutionType);
  return res.json({
    ccn,
    alreadyRegistered: false,
    ...info,
    verificationMode: info.found ? "automatic" : "manual",
    message: info.found
      ? null
      : "We could not confirm this CCN automatically. You can continue with registration and the facility will be reviewed manually.",
  });
});

// GET /api/accounts/whoami — diagnostic: returns clerk ID + super-admin match result
router.get("/whoami", requireAuth, (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const rawEnv = process.env.ADMIN_CLERK_USER_IDS ?? "";
  const ids = rawEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const isSuperAdmin = ids.includes(userId);
  return res.json({
    clerkUserId: userId,
    isSuperAdmin,
    adminIdCount: ids.length,
    adminIdPrefixes: ids.map((id) => id.slice(0, 10) + "…"),
    yourIdPrefix: userId.slice(0, 10) + "…",
  });
});

// GET /api/accounts/me — get the current user's account + subscription status
router.get("/me", requireAuth, async (req, res) => {
  // Never cache — admin/subscription status can change at any time.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const userId = (req as any).clerkUserId as string;
  const superAdminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("user_"));
  const isSuperAdmin = superAdminIds.includes(userId);
  const access = await getSubscriptionAccess(userId);
  const isAdminUser = isSuperAdmin || access.isAdminUser;
  const isActive = isAdminUser || access.isActive;

  return res.json({
    clerkUserId: userId,
    account: access.account,
    accountUser: access.accountUser,
    isActive,
    isAdminUser,
    isSuperAdmin,
    hasComplimentaryAccess: access.hasComplimentaryAccess,
    accessSource: isSuperAdmin ? "admin" : access.accessSource,
  });
});

// GET /api/accounts/terms-status
// What the acceptance screen needs: which version is current, which this
// facility has accepted, and whether it must accept before being charged.
router.get("/terms-status", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const userId = (req as any).clerkUserId as string;

  const [accountUser] = await db
    .select()
    .from(accountUsers)
    .where(eq(accountUsers.clerkUserId, userId))
    .limit(1);

  if (!accountUser?.accountId) {
    return res.json({
      currentVersion: CURRENT_TERMS_VERSION,
      acceptedVersion: null,
      acceptedAt: null,
      acceptanceRequired: true,
      registered: false,
    });
  }

  const [account] = await db
    .select({
      termsAcceptedAt: accounts.termsAcceptedAt,
      termsVersion: accounts.termsVersion,
    })
    .from(accounts)
    .where(eq(accounts.id, accountUser.accountId))
    .limit(1);
  if (!account) return res.status(404).json({ error: "Facility account not found" });

  return res.json({
    currentVersion: CURRENT_TERMS_VERSION,
    acceptedVersion: account.termsVersion,
    acceptedAt: account.termsAcceptedAt,
    acceptanceRequired: needsAcceptance(account.termsVersion),
    registered: true,
  });
});

// POST /api/accounts/terms-acceptance
// Records acceptance of the CURRENT version.
//
// This used to record the first acceptance only and return early ever after,
// which meant a customer who accepted 1.0 could never be recorded as accepting
// a later version — the exact record needed before charging them under it.
// It now records per version: the account's current accepted version is
// updated, and an immutable row is appended to terms_acceptances.
//
// The server's receipt time is authoritative; a client-supplied acceptedAt is
// accepted for validation but never stored, so acceptance cannot be backdated.
router.post("/terms-acceptance", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const { termsVersion, acceptedAt } = req.body as {
    termsVersion?: string;
    acceptedAt?: string;
  };

  if (termsVersion !== CURRENT_TERMS_VERSION) {
    return res.status(400).json({
      error: `termsVersion must be ${CURRENT_TERMS_VERSION}`,
      currentVersion: CURRENT_TERMS_VERSION,
    });
  }

  // Refuses to record acceptance of a version that is not live, so the gate
  // can never be satisfied by a document no customer could actually read.
  if (!isAcceptableVersion(termsVersion)) {
    return res.status(409).json({
      error: "That terms version is not published yet.",
      currentVersion: CURRENT_TERMS_VERSION,
    });
  }

  if (acceptedAt != null && Number.isNaN(Date.parse(acceptedAt))) {
    return res.status(400).json({ error: "acceptedAt must be a valid ISO timestamp" });
  }

  const [accountUser] = await db
    .select()
    .from(accountUsers)
    .where(eq(accountUsers.clerkUserId, userId))
    .limit(1);
  if (!accountUser?.accountId) {
    return res.status(409).json({
      error: "Complete facility registration before recording terms acceptance",
    });
  }

  const [existing] = await db
    .select({
      id: accounts.id,
      termsAcceptedAt: accounts.termsAcceptedAt,
      termsVersion: accounts.termsVersion,
    })
    .from(accounts)
    .where(eq(accounts.id, accountUser.accountId))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Facility account not found" });

  // Already on the current version — idempotent, nothing new to record.
  if (existing.termsVersion === CURRENT_TERMS_VERSION && existing.termsAcceptedAt) {
    return res.json({
      termsAcceptedAt: existing.termsAcceptedAt,
      termsVersion: existing.termsVersion,
      recorded: false,
    });
  }

  const now = new Date();

  // History first: if the account update fails, an extra evidence row is
  // harmless, whereas a charge with no record of acceptance is not.
  await db.insert(termsAcceptances).values({
    accountId: accountUser.accountId,
    clerkUserId: userId,
    termsVersion: CURRENT_TERMS_VERSION,
    acceptedAt: now,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
  });

  const [updated] = await db
    .update(accounts)
    .set({
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
      updatedAt: now,
    })
    .where(and(
      eq(accounts.id, accountUser.accountId),
      // Only move forward. A concurrent request that already recorded the
      // current version wins, and this one reports its result instead.
      eq(accounts.id, accountUser.accountId),
    ))
    .returning({
      termsAcceptedAt: accounts.termsAcceptedAt,
      termsVersion: accounts.termsVersion,
    });

  if (updated) return res.status(201).json({ ...updated, recorded: true });

  const [record] = await db
    .select({
      termsAcceptedAt: accounts.termsAcceptedAt,
      termsVersion: accounts.termsVersion,
    })
    .from(accounts)
    .where(eq(accounts.id, accountUser.accountId))
    .limit(1);
  return res.json({ ...record, recorded: false });
});

// POST /api/accounts/register — register a CCN account and link the current user
router.post("/register", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const email  = (req as any).clerkEmail as string | null;
  const { ccn, facilityName, facilityType, state, city } = req.body as {
    ccn: string; facilityName: string; facilityType?: string; state?: string; city?: string;
  };

  if (!ccn || !facilityName) {
    return res.status(400).json({ error: "ccn and facilityName are required" });
  }

  const normalCCN = ccn.trim().toUpperCase();
  if (!isValidProviderIdentifier(normalCCN, facilityType)) {
    return res.status(400).json({ error: providerIdentifierError(facilityType) });
  }

  // Check if this user already has an account
  const [existingAU] = await db.select().from(accountUsers)
    .where(eq(accountUsers.clerkUserId, userId)).limit(1);
  if (existingAU) {
    return res.status(409).json({ error: "You are already linked to a facility account" });
  }

  // Get or create the CCN account
  let [account] = await db.select().from(accounts).where(eq(accounts.ccn, normalCCN)).limit(1);
  const isFirstUser = !account;

  if (!account) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    [account] = await db.insert(accounts).values({
      ccn:              normalCCN,
      facilityName:     facilityName.trim(),
      facilityType:     facilityType ?? null,
      state:            state ?? null,
      city:             city ?? null,
      subscriptionStatus: "trial",
      trialEndsAt:      trialEnds,
    }).returning();
  }

  // Link this user to the account
  const [accountUser] = await db.insert(accountUsers).values({
    clerkUserId: userId,
    accountId:   account.id,
    role:        isFirstUser ? "admin" : "member",
    email:       email ?? null,
  }).returning();

  return res.status(201).json({ account, accountUser });
});

export default router;
