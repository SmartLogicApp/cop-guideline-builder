import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { accounts, accountUsers, termsAcceptances } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  lookupCCN,
  MANUAL_VERIFICATION_MESSAGE,
  MANUAL_VERIFICATION_TYPES,
} from "../lib/ccn-lookup.js";
import {
  DEFAULT_IDENTIFIER_TYPE,
  IDENTIFIER_TYPES,
  type IdentifierType,
  generateConsultantIdentifier,
  identifierError,
  identifierLabel,
  isIdentifierType,
  isValidIdentifier,
  normalizeIdentifier,
  supportsCmsLookup,
} from "../lib/provider-identifier.js";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription.js";

import {
  CURRENT_TERMS_VERSION,
  isAcceptableVersion,
  needsAcceptance,
} from "../lib/terms-versions.js";

const router: IRouter = Router();

/** Postgres 23505 — the unique constraint rejected the row. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { code?: unknown }).code === "23505";
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  (req as any).clerkUserId = userId;
  (req as any).clerkEmail = (auth as any)?.sessionClaims?.email ?? null;
  return next();
}
// GET /api/accounts/validate-ccn?ccn=XXXXXX&institutionType=TYPE&identifierType=ccn
//
// The name is kept for the existing client. `identifierType` is optional and
// defaults to "ccn", so a caller that predates NPI and CLIA support behaves
// exactly as it did.
router.get("/validate-ccn", requireAuth, async (req, res) => {
  const raw = req.query.ccn as string | undefined;
  const institutionType = (req.query.institutionType as string | undefined)?.trim().toLowerCase();
  const requestedType = req.query.identifierType as string | undefined;

  if (requestedType !== undefined && !isIdentifierType(requestedType)) {
    return res.status(400).json({
      error: `identifierType must be one of: ${IDENTIFIER_TYPES.join(", ")}`,
    });
  }
  const idType: IdentifierType = requestedType ?? DEFAULT_IDENTIFIER_TYPE;

  // Consultants never type an identifier — one is issued at registration —
  // so there is nothing here to validate or look up.
  if (idType === "consultant") {
    return res.status(400).json({ error: identifierError("consultant") });
  }

  const identifier = raw ? normalizeIdentifier(raw) : "";
  if (!identifier || !isValidIdentifier(idType, identifier, institutionType)) {
    return res.status(400).json({ error: identifierError(idType, institutionType) });
  }

  const existing = await db.select().from(accounts).where(eq(accounts.ccn, identifier)).limit(1);
  if (existing.length) {
    return res.json({
      ccn: identifier,
      identifierType: existing[0].identifierType,
      alreadyRegistered: true,
      facilityName: existing[0].facilityName,
      facilityType: existing[0].facilityType,
      state: existing[0].state,
      city: existing[0].city,
      verificationMode: "registered",
      message: null,
    });
  }

  // Only a CCN can be checked against CMS Care Compare. An NPI or CLIA number
  // is format-checked and then reviewed by hand — claiming otherwise would be
  // telling the buyer we verified something we did not.
  if (!supportsCmsLookup(idType)
      || (institutionType && MANUAL_VERIFICATION_TYPES.has(institutionType))) {
    return res.json({
      ccn: identifier,
      identifierType: idType,
      alreadyRegistered: false,
      found: false,
      facilityName: null,
      state: null,
      city: null,
      facilityType: institutionType ?? null,
      verificationMode: "manual",
      message: supportsCmsLookup(idType)
        ? MANUAL_VERIFICATION_MESSAGE
        : `CMS Care Compare does not cover ${identifierLabel(idType)} lookups. You can continue with registration and the account will be reviewed manually.`,
    });
  }

  const info = await lookupCCN(identifier, institutionType);
  return res.json({
    ccn: identifier,
    identifierType: idType,
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

// POST /api/accounts/register — register an account and link the current user.
//
// The identifier may be a CCN (certified facilities), an NPI (practices and
// individual providers), a CLIA number (labs), or — for a consultant who has
// none of those — one this endpoint issues. Whichever it is, the account gets
// exactly one, and it is what a second user from the same organisation joins
// on, so one organisation means one subscription.
router.post("/register", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const email  = (req as any).clerkEmail as string | null;
  const { ccn, identifierType, facilityName, facilityType, state, city } = req.body as {
    ccn?: string; identifierType?: string; facilityName: string;
    facilityType?: string; state?: string; city?: string;
  };

  if (identifierType !== undefined && !isIdentifierType(identifierType)) {
    return res.status(400).json({
      error: `identifierType must be one of: ${IDENTIFIER_TYPES.join(", ")}`,
    });
  }
  const idType: IdentifierType = identifierType ?? DEFAULT_IDENTIFIER_TYPE;

  if (!facilityName?.trim()) {
    return res.status(400).json({ error: "facilityName is required" });
  }

  // A consultant supplies no identifier; every other type must.
  if (idType !== "consultant" && !ccn) {
    return res.status(400).json({
      error: `${identifierLabel(idType)} is required`,
    });
  }

  let normalIdentifier: string;
  if (idType === "consultant") {
    // Ignore anything the client sent: a self-chosen consultant identifier
    // could collide with, or impersonate, a real one.
    normalIdentifier = generateConsultantIdentifier();
  } else {
    normalIdentifier = normalizeIdentifier(ccn as string);
    if (!isValidIdentifier(idType, normalIdentifier, facilityType)) {
      return res.status(400).json({ error: identifierError(idType, facilityType) });
    }
  }

  // Check if this user already has an account
  const [existingAU] = await db.select().from(accountUsers)
    .where(eq(accountUsers.clerkUserId, userId)).limit(1);
  if (existingAU) {
    return res.status(409).json({ error: "You are already linked to a facility account" });
  }

  // Get or create the account for this identifier.
  let [account] = await db.select().from(accounts)
    .where(eq(accounts.ccn, normalIdentifier)).limit(1);
  const isFirstUser = !account;

  if (!account) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    const values = {
      facilityName:       facilityName.trim(),
      facilityType:       facilityType ?? null,
      state:              state ?? null,
      city:               city ?? null,
      identifierType:     idType,
      subscriptionStatus: "trial",
      trialEndsAt:        trialEnds,
    };

    if (idType === "consultant") {
      // The unique constraint, not the generator, decides. Retry on collision.
      for (let attempt = 0; attempt < 5 && !account; attempt += 1) {
        try {
          [account] = await db.insert(accounts)
            .values({ ...values, ccn: normalIdentifier }).returning();
        } catch (error) {
          if (!isUniqueViolation(error) || attempt === 4) throw error;
          normalIdentifier = generateConsultantIdentifier();
        }
      }
    } else {
      [account] = await db.insert(accounts)
        .values({ ...values, ccn: normalIdentifier }).returning();
    }
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
