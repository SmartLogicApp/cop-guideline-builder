import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { accounts, accountUsers } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  lookupCCN,
  isValidProviderIdentifier,
  providerIdentifierError,
  MANUAL_VERIFICATION_MESSAGE,
  MANUAL_VERIFICATION_TYPES,
} from "../lib/ccn-lookup.js";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription.js";

const router: IRouter = Router();
const CURRENT_TERMS_VERSION = "2026-08-13";

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

// POST /api/accounts/terms-acceptance
// Records the first acceptance only. The authenticated server receipt time is
// authoritative so a client cannot backdate or overwrite the legal record.
router.post("/terms-acceptance", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const { termsVersion, acceptedAt } = req.body as {
    termsVersion?: string;
    acceptedAt?: string;
  };

  if (termsVersion !== CURRENT_TERMS_VERSION) {
    return res.status(400).json({
      error: `termsVersion must be ${CURRENT_TERMS_VERSION}`,
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

  if (existing.termsAcceptedAt) {
    return res.json({
      termsAcceptedAt: existing.termsAcceptedAt,
      termsVersion: existing.termsVersion,
      recorded: false,
    });
  }

  const [updated] = await db
    .update(accounts)
    .set({
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      updatedAt: new Date(),
    })
    .where(and(
      eq(accounts.id, accountUser.accountId),
      isNull(accounts.termsAcceptedAt),
    ))
    .returning({
      termsAcceptedAt: accounts.termsAcceptedAt,
      termsVersion: accounts.termsVersion,
    });

  if (updated) return res.status(201).json({ ...updated, recorded: true });

  // A concurrent first request won the update; return its immutable record.
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
