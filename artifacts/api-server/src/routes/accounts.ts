import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { accounts, accountUsers, affiliates, affiliateRateChanges, termsAcceptances } from "@workspace/db";
import { eq, and, or, ne, isNull, inArray, sql } from "drizzle-orm";
import { normalizeReferralCode } from "../lib/affiliate-commission.js";
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
import { LEGACY_INSTITUTION_TYPES } from "@workspace/cms-compliance-data";
import { getSubscriptionAccess } from "../middlewares/requireActiveSubscription.js";
import { currentReviewedAffiliateAcceptanceCondition } from "../lib/affiliate-agreement-state.js";
import { getSuperAdminIds, isSuperAdminId } from "../lib/super-admin-identities.js";
import { generateAffiliateReferralCode } from "../lib/affiliate-referral-code.js";

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
// GET /api/accounts/provider-types
//
// The provider-type list the registration form offers. It lives in
// @workspace/cms-compliance-data, which the marketing site does not depend on,
// so it is served rather than bundled — one list, one source, no second copy to
// drift. Requires auth only because registration does; nothing here is secret.
//
// `contentStatus` matters to the caller: generation is refused for provider
// types whose CMS content is not yet verified, so the form warns at signup
// rather than letting someone register and discover it later.
router.get("/provider-types", requireAuth, (_req, res) => {
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.json({
    providerTypes: LEGACY_INSTITUTION_TYPES.map((type) => ({
      value:         type.value,
      label:         type.label,
      cfr:           type.cfr,
      contentStatus: type.contentStatus,
    })),
  });
});

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
  const ids = getSuperAdminIds();
  const isSuperAdmin = isSuperAdminId(userId);
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
  const isSuperAdmin = isSuperAdminId(userId);
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
      // current version wins, and this one reports its result instead —
      // handled by the select below when nothing comes back from here.
      //
      // Both halves are needed: in SQL `termsVersion != 'x'` is NULL rather
      // than true when the column is NULL, so an account that has never
      // accepted would be excluded by the inequality on its own. That is the
      // common case — termsVersion has no default.
      //
      // This previously repeated the id predicate instead, which is a no-op:
      // the guard the comment describes did not exist and the last writer won.
      or(
        isNull(accounts.termsVersion),
        ne(accounts.termsVersion, CURRENT_TERMS_VERSION),
      ),
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

// POST /api/accounts/affiliate/activate
// Recover affiliate access for an authenticated user who already owns a direct
// client workspace. This only updates the affiliate and that user's membership;
// it never creates or relinks an account, nor changes its Stripe state.
router.post("/affiliate/activate", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const clerkUser = await clerkClient.users.getUser(userId);
  const primaryEmail = clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId);
  if (primaryEmail?.verification?.status !== "verified") {
    return res.status(403).json({
      error: "Verify your primary Clerk email before activating an affiliate application.",
      code: "AFFILIATE_EMAIL_UNVERIFIED",
    });
  }
  const verifiedEmail = primaryEmail.emailAddress.trim().toLowerCase();

  const [linked] = await db.select({
    accountId: accountUsers.accountId,
    identifierType: accounts.identifierType,
    subscriptionStatus: accounts.subscriptionStatus,
  }).from(accountUsers)
    .innerJoin(accounts, eq(accountUsers.accountId, accounts.id))
    .where(eq(accountUsers.clerkUserId, userId))
    .limit(1);
  if (!linked || linked.identifierType === "consultant" || linked.subscriptionStatus === "removed") {
    return res.status(409).json({
      error: "Complete direct-client workspace registration before activating an affiliate.",
      code: "AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED",
    });
  }

  const failure = (error: unknown) => {
    if (!(error instanceof Error)) return null;
    switch (error.message) {
      case "AFFILIATE_APPLICATION_EMAIL_MISMATCH":
        return res.status(404).json({
          error: "No affiliate application matches your verified primary email.",
          code: "AFFILIATE_APPLICATION_EMAIL_MISMATCH",
        });
      case "AFFILIATE_APPLICATION_ON_HOLD":
        return res.status(409).json({
          error: "This affiliate application is on hold. Contact support before activating it.",
          code: "AFFILIATE_APPLICATION_ON_HOLD",
        });
      case "AFFILIATE_FOREIGN_CLERK_BINDING":
        return res.status(409).json({
          error: "This affiliate application is linked to another Clerk account.",
          code: "AFFILIATE_APPLICATION_ALREADY_BOUND",
        });
      case "AFFILIATE_CURRENT_AGREEMENT_ACCEPTANCE_REQUIRED":
        return res.status(409).json({
          error: "Accept the current published affiliate agreement before activation.",
          code: "AFFILIATE_AGREEMENT_ACCEPTANCE_REQUIRED",
        });
      case "AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED":
        return res.status(409).json({
          error: "Complete direct-client workspace registration before activating an affiliate.",
          code: "AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED",
        });
      default:
        return null;
    }
  };

  try {
    const result = await db.transaction(async (tx) => {
      // Lock both records that determine eligibility and idempotency. The
      // workspace is revalidated under lock; its account is never modified.
      const [accountUser] = await tx.select().from(accountUsers)
        .where(eq(accountUsers.clerkUserId, userId))
        .for("update")
        .limit(1);
      if (!accountUser?.accountId || accountUser.accountId !== linked.accountId) {
        throw new Error("AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED");
      }
      const [account] = await tx.select({
        identifierType: accounts.identifierType,
        subscriptionStatus: accounts.subscriptionStatus,
      })
        .from(accounts).where(eq(accounts.id, accountUser.accountId)).limit(1);
      if (!account || account.identifierType === "consultant" || account.subscriptionStatus === "removed") {
        throw new Error("AFFILIATE_WORKSPACE_REGISTRATION_REQUIRED");
      }

      const matchingApplications = await tx.select().from(affiliates)
        .where(eq(sql`lower(trim(${affiliates.email}))`, verifiedEmail))
        .for("update")
        .limit(2);
      if (matchingApplications.length !== 1) {
        throw new Error("AFFILIATE_APPLICATION_EMAIL_MISMATCH");
      }
      const affiliate = matchingApplications[0];
      if (affiliate.clerkUserId && affiliate.clerkUserId !== userId) {
        throw new Error("AFFILIATE_FOREIGN_CLERK_BINDING");
      }

      if (affiliate.status === "active" && affiliate.clerkUserId === userId) {
        // An already bound partner may have joined before this self-service
        // entitlement existed. Grant it once, never renew it after expiry or
        // after an administrator revokes the affiliate grant.
        if (!accountUser.hasComplimentaryAccess &&
            accountUser.complimentaryAccessGrantedBy !== "affiliate-self-service") {
          const now = new Date();
          const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await tx.update(accountUsers).set({
            hasComplimentaryAccess: true,
            complimentaryAccessGrantedBy: "affiliate-self-service",
            complimentaryAccessGrantedAt: now,
            complimentaryAccessEndsAt: trialEndsAt,
          }).where(eq(accountUsers.id, accountUser.id));
          return { status: "active", trialEndsAt };
        }
        return {
          status: "active",
          trialEndsAt: accountUser.complimentaryAccessGrantedBy === "affiliate-self-service"
            ? accountUser.complimentaryAccessEndsAt
            : null,
        };
      }
      if (affiliate.status !== "pending") {
        throw new Error("AFFILIATE_APPLICATION_EMAIL_MISMATCH");
      }
      if (affiliate.applicationHeldAt) {
        throw new Error("AFFILIATE_APPLICATION_ON_HOLD");
      }

      const now = new Date();
      const referralCode = generateAffiliateReferralCode();
      const [activated] = await tx.update(affiliates).set({
        clerkUserId: userId,
        referralCode,
        status: "active",
        commissionRatePct: 20,
        rateEffectiveAt: now,
        updatedAt: now,
      }).where(and(
        eq(affiliates.id, affiliate.id),
        eq(affiliates.status, "pending"),
        eq(sql`lower(trim(${affiliates.email}))`, verifiedEmail),
        isNull(affiliates.applicationHeldAt),
        currentReviewedAffiliateAcceptanceCondition(),
      )).returning({ id: affiliates.id });
      if (!activated) {
        throw new Error("AFFILIATE_CURRENT_AGREEMENT_ACCEPTANCE_REQUIRED");
      }
      await tx.insert(affiliateRateChanges).values({
        affiliateId: affiliate.id,
        fromPct: affiliate.commissionRatePct,
        toPct: 20,
        reason: "enrollment",
        note: "Affiliate self-service activation with current agreement acceptance.",
        changedBy: userId,
        effectiveAt: now,
      });

      // An existing complimentary grant is left untouched (including legacy
      // indefinite grants). A fresh grant is written only once.
      let trialEndsAt = accountUser.complimentaryAccessGrantedBy === "affiliate-self-service"
        ? accountUser.complimentaryAccessEndsAt
        : null;
      if (!accountUser.hasComplimentaryAccess &&
          accountUser.complimentaryAccessGrantedBy !== "affiliate-self-service") {
        trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await tx.update(accountUsers).set({
          hasComplimentaryAccess: true,
          complimentaryAccessGrantedBy: "affiliate-self-service",
          complimentaryAccessGrantedAt: now,
          complimentaryAccessEndsAt: trialEndsAt,
        }).where(and(
          eq(accountUsers.id, accountUser.id),
          eq(accountUsers.clerkUserId, userId),
        ));
      }
      return { status: "active", trialEndsAt };
    });
    return res.json({
      status: result.status,
      trialEndsAt: result.trialEndsAt?.toISOString() ?? null,
    });
  } catch (error) {
    const response = failure(error);
    if (response) return response;
    throw error;
  }
});

// POST /api/accounts/register — register an account and link the current user.
//
// The identifier may be a CCN (certified facilities), an NPI (practices and
// individual providers), a CLIA number (labs), or — for an affiliate consultant
// who has none of those — one this endpoint issues. A pending public enrollment
// becomes active here only after the verified Clerk email matches and the
// current published affiliate agreement acceptance is confirmed.
// Whichever it is, the account gets exactly one, and it is unique, so one
// organisation means one subscription.
//
// This endpoint CREATES accounts. It does not join existing ones: see the
// comment at the identifier lookup below for why that distinction is a
// security boundary and not a convenience. Adding a user to an existing
// account needs an invitation flow, which does not exist yet.
router.post("/register", requireAuth, async (req, res) => {
  const userId = (req as any).clerkUserId as string;
  const email  = (req as any).clerkEmail as string | null;
  const { ccn, identifierType, facilityName, facilityType, state, city, referralCode, termsVersion, acceptedAt, acceptsTerms } = req.body as {
    ccn?: string; identifierType?: string; facilityName?: string;
    facilityType?: string; state?: string; city?: string; referralCode?: string;
    termsVersion?: string; acceptedAt?: string; acceptsTerms?: boolean;
  };

  // Registration is the access boundary, especially for a consultant trial.
  // Never create an account that is missing an explicit, current Terms receipt.
  if (acceptsTerms !== true || termsVersion !== CURRENT_TERMS_VERSION
      || !isAcceptableVersion(termsVersion)
      || typeof acceptedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(acceptedAt)
      || Number.isNaN(Date.parse(acceptedAt))) {
    return res.status(400).json({ error: "Review and accept the current Terms before registering." });
  }

  // Affiliate attribution. Recorded on the account at creation and never
  // afterwards, so a referrer cannot be added or swapped once money is moving.
  //
  // Normalised through the SAME function the affiliate lookup uses. That is the
  // whole point of sharing it: a code normalised one way here and another way
  // at lookup is a customer attributed to nobody, and the failure is invisible
  // until an affiliate asks where their commission went.
  //
  // Still unverified client input. It is stored as given; whether it matches a
  // real affiliate is decided later, by the accrual path, not here.
  const normalReferral = normalizeReferralCode(referralCode);

  if (identifierType !== undefined && !isIdentifierType(identifierType)) {
    return res.status(400).json({
      error: `identifierType must be one of: ${IDENTIFIER_TYPES.join(", ")}`,
    });
  }
  const idType: IdentifierType = identifierType ?? DEFAULT_IDENTIFIER_TYPE;

  let consultantAffiliateEmail: string | null = null;
  let consultantAffiliateCompanyName: string | null = null;
  if (idType === "consultant") {
    // Never link an affiliate by a session email claim alone: resolve Clerk's
    // verified primary email server-side, then bind only the matching row.
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId);
    consultantAffiliateEmail = primaryEmail?.verification?.status === "verified"
      ? primaryEmail.emailAddress.trim().toLowerCase()
      : null;
    if (!consultantAffiliateEmail) {
      return res.status(403).json({
        error: "Verify your primary Clerk email before completing consultant registration.",
        code: "AFFILIATE_EMAIL_UNVERIFIED",
      });
    }
    const [activeAffiliate] = consultantAffiliateEmail
      ? await db.select({
        id: affiliates.id, clerkUserId: affiliates.clerkUserId, companyName: affiliates.companyName,
        status: affiliates.status, applicationHeldAt: affiliates.applicationHeldAt,
      }).from(affiliates)
        .where(and(
          eq(sql`lower(trim(${affiliates.email}))`, consultantAffiliateEmail),
          inArray(affiliates.status, ["active", "pending"]),
        ))
        .limit(1)
      : [];
    if (!activeAffiliate || (activeAffiliate.clerkUserId && activeAffiliate.clerkUserId !== userId)) {
      return res.status(403).json({
        error: "Consultant registration requires the verified email address on an affiliate account.",
        code: "CONSULTANT_REGISTRATION_REQUIRES_ACTIVE_AFFILIATE",
      });
    }
    if (activeAffiliate.status === "pending" && activeAffiliate.applicationHeldAt) {
      return res.status(409).json({
        error: "This affiliate application is on hold. Contact support before completing signup.",
        code: "AFFILIATE_APPLICATION_ON_HOLD",
      });
    }
    consultantAffiliateCompanyName = activeAffiliate.companyName.trim();
    if (!consultantAffiliateCompanyName) {
      return res.status(409).json({
        error: "The affiliate application needs a company or practice name before workspace activation.",
        code: "CONSULTANT_WORKSPACE_NAME_REQUIRED",
      });
    }
  }

  if (idType !== "consultant" && !facilityName?.trim()) {
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

  // Self-registration creates an account. It never joins an existing one.
  //
  // This used to be get-or-create: if the identifier already existed, the
  // caller was linked to that account as a member. CMS Certification Numbers
  // are PUBLIC — they are published in CMS Care Compare — so that let anyone
  // with a Clerk account type a hospital's CCN and be handed that hospital's
  // subscription, generated policies and gap-assessment results.
  //
  // Joining an existing account must be initiated by that account, not by the
  // person asking to join. Until an invitation flow exists, the answer is no.
  // Do not restore the get-or-create behaviour to support multi-user
  // facilities; build invitations instead.
  let [account] = await db.select().from(accounts)
    .where(eq(accounts.ccn, normalIdentifier)).limit(1);

  if (account) {
    return res.status(409).json({
      error:
        `That ${identifierLabel(idType)} is already registered. For security, an ` +
        `existing account can only add users by invitation — ask an administrator ` +
        `on that account to invite you.`,
      code: "IDENTIFIER_ALREADY_REGISTERED",
    });
  }

  const isConsultant = idType === "consultant";
  const trialEnds = isConsultant ? new Date() : null;
  if (trialEnds) trialEnds.setDate(trialEnds.getDate() + 30);

  const values = {
    facilityName:       idType === "consultant"
      ? consultantAffiliateCompanyName!
      : facilityName!.trim(),
    facilityType:       facilityType ?? null,
    state:              state ?? null,
    city:               city ?? null,
    identifierType:     idType,
    referralCode:       normalReferral,
    // Consultants retain the existing no-card local trial. Direct customers
    // must start their trial through Stripe checkout with a payment method.
    subscriptionStatus: isConsultant ? "trial" : "pending_payment",
    trialEndsAt:        trialEnds,
    termsVersion:       CURRENT_TERMS_VERSION,
  };

  const createWithAcceptance = async (identifier: string) => db.transaction(async (tx) => {
    const receiptTime = new Date();
    let workspaceName = values.facilityName;
    if (idType === "consultant" && consultantAffiliateEmail) {
      const [affiliate] = await tx.select().from(affiliates)
        .where(eq(sql`lower(trim(${affiliates.email}))`, consultantAffiliateEmail))
        .for("update")
        .limit(1);
      if (!affiliate || !["active", "pending"].includes(affiliate.status)
          || (affiliate.clerkUserId && affiliate.clerkUserId !== userId)) {
        throw new Error("AFFILIATE_SIGNUP_NOT_AVAILABLE");
      }
      if (affiliate.status === "pending" && affiliate.applicationHeldAt) {
        throw new Error("AFFILIATE_APPLICATION_ON_HOLD");
      }
      workspaceName = affiliate.companyName.trim();
      if (!workspaceName) throw new Error("AFFILIATE_WORKSPACE_NAME_REQUIRED");

      if (affiliate.status === "pending") {
        const [activated] = await tx.update(affiliates).set({
          clerkUserId: userId,
          referralCode: generateAffiliateReferralCode(),
          status: "active",
          commissionRatePct: 20,
          rateEffectiveAt: receiptTime,
          updatedAt: receiptTime,
        }).where(and(
          eq(affiliates.id, affiliate.id),
          eq(affiliates.status, "pending"),
          eq(sql`lower(trim(${affiliates.email}))`, consultantAffiliateEmail),
          isNull(affiliates.applicationHeldAt),
          currentReviewedAffiliateAcceptanceCondition(),
        )).returning({ id: affiliates.id });
        if (!activated) {
          throw new Error("AFFILIATE_CURRENT_AGREEMENT_ACCEPTANCE_REQUIRED");
        }
        await tx.insert(affiliateRateChanges).values({
          affiliateId: affiliate.id,
          fromPct: affiliate.commissionRatePct,
          toPct: 20,
          reason: "enrollment",
          note: "Affiliate self-service signup and current agreement acceptance.",
          changedBy: userId,
          effectiveAt: receiptTime,
        });
      } else if (!affiliate.clerkUserId) {
        const [bound] = await tx.update(affiliates).set({
          clerkUserId: userId,
          updatedAt: receiptTime,
        }).where(and(
          eq(affiliates.id, affiliate.id),
          eq(sql`lower(trim(${affiliates.email}))`, consultantAffiliateEmail),
          isNull(affiliates.clerkUserId),
        )).returning({ id: affiliates.id });
        if (!bound) throw new Error("AFFILIATE_SIGNUP_NOT_AVAILABLE");
      }
    }
    const [created] = await tx.insert(accounts).values({
      ...values,
      facilityName: workspaceName,
      ccn: identifier,
      termsAcceptedAt: receiptTime,
    }).returning();
    const [linked] = await tx.insert(accountUsers).values({
      clerkUserId: userId,
      accountId: created.id,
      role: "admin",
      email: consultantAffiliateEmail ?? email ?? null,
    }).returning();
    await tx.insert(termsAcceptances).values({
      accountId: created.id,
      clerkUserId: userId,
      termsVersion: CURRENT_TERMS_VERSION,
      acceptedAt: receiptTime,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    });
    return { account: created, accountUser: linked };
  });

  let registration: Awaited<ReturnType<typeof createWithAcceptance>> | undefined;
  if (idType === "consultant") {
    // The unique constraint, not the generator, decides. Retry on collision.
    for (let attempt = 0; attempt < 5 && !registration; attempt += 1) {
      try {
        registration = await createWithAcceptance(normalIdentifier);
      } catch (error) {
        if (error instanceof Error && error.message === "AFFILIATE_SIGNUP_NOT_AVAILABLE") {
          return res.status(403).json({
            error: "This affiliate signup is already linked to another account or is no longer active.",
            code: "CONSULTANT_REGISTRATION_REQUIRES_ACTIVE_AFFILIATE",
          });
        }
        if (error instanceof Error && error.message === "AFFILIATE_APPLICATION_ON_HOLD") {
          return res.status(409).json({
            error: "This affiliate application is on hold. Contact support before completing signup.",
            code: "AFFILIATE_APPLICATION_ON_HOLD",
          });
        }
        if (error instanceof Error && error.message === "AFFILIATE_CURRENT_AGREEMENT_ACCEPTANCE_REQUIRED") {
          return res.status(409).json({
            error: "Accept the current published affiliate agreement before completing signup.",
            code: "AFFILIATE_AGREEMENT_ACCEPTANCE_REQUIRED",
          });
        }
        if (error instanceof Error && error.message === "AFFILIATE_WORKSPACE_NAME_REQUIRED") {
          return res.status(409).json({
            error: "The affiliate application needs a company or practice name before workspace activation.",
            code: "CONSULTANT_WORKSPACE_NAME_REQUIRED",
          });
        }
        if (!isUniqueViolation(error) || attempt === 4) throw error;
        normalIdentifier = generateConsultantIdentifier();
      }
    }
  } else {
    // A second request racing with this one loses on the unique index rather
    // than silently joining the winner's account — the same rule as above,
    // enforced by the database instead of by the read a few lines up.
    try {
      registration = await createWithAcceptance(normalIdentifier);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return res.status(409).json({
        error:
          `That ${identifierLabel(idType)} is already registered. For security, an ` +
          `existing account can only add users by invitation — ask an administrator ` +
          `on that account to invite you.`,
        code: "IDENTIFIER_ALREADY_REGISTERED",
      });
    }
  }

  if (!registration) {
    req.log?.error({ idType }, "Account insert returned no row");
    return res.status(500).json({ error: "We could not create your account. Please try again." });
  }

  return res.status(201).json(registration);
});

export default router;
