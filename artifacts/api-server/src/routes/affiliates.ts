import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  accounts,
  affiliates,
  affiliateCommissions,
  affiliatePayouts,
  affiliateRateChanges,
  affiliateAgreementAcceptances,
  affiliateAgreements,
  affiliateComplianceAuditLog,
  affiliateRateNoticeDeliveries,
} from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { requireAnyAdmin, requireCronOrSuperAdmin, requireSuperAdmin } from "../lib/admin-guards.js";
import { currentReviewedAffiliateAcceptanceCondition, hasReviewedAffiliateAcceptance, reviewedAffiliateAgreementExists, reviewedAffiliateAgreementVersion } from "../lib/affiliate-agreement-state.js";
import { applicationAcceptanceEvidence } from "../lib/affiliate-application-acceptance.js";
import { generateAffiliateReferralCode } from "../lib/affiliate-referral-code.js";
import { sendViaResend } from "../lib/resend-mailer.js";
import { getReturnBase } from "../lib/return-base.js";
import { monthBounds, money, sendCsv, toCsv } from "../lib/report-format.js";
import { auditBlockedPayoutAttempt, calculateAffiliatePayoutEligibility } from "../lib/affiliate-payout-eligibility.js";
import {
  approvalRateChangeNote, containsSensitiveFinancialNumber, hasSensitiveContact,
  isSafeAffiliateIdentifier, redactSensitiveFinancialData,
} from "../lib/affiliate-sensitive-boundary.js";
import {
  activityStatus,
  activityWindow,
  assemblePayout,
  computeCommissionUsd,
  COMMISSION_RATE_LADDER,
  holdbackEndsAt,
  isValidReferralCode,
  MINIMUM_PAYOUT_USD,
  normalizeReferralCode,
  pendingRateReductions,
  quarterBounds,
  quarterOf,
  roundUsd,
} from "../lib/affiliate-commission.js";
import {
  affiliateRateNoticeEmail,
  affiliateRateNoticeCandidates,
  applyPendingAffiliateRateReductions,
  dueAffiliateRateNotices,
  isAffiliateRateNoticeDue,
  type AffiliateRateNoticeCandidate,
} from "../lib/affiliate-rate-automation.js";
import {
  AFFILIATE_AGREEMENT_V4_VERSION,
  prepareAffiliateAgreementV4,
} from "../lib/affiliate-agreement-v4.js";
import affiliateAgreementV4Source from "../legal/affiliate-partner-agreement-v4-source.txt";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AFFILIATE ROUTES — mounted at /api/affiliates
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything here is ADMIN-ONLY. The affiliate's own view of their figures is
 * a separate, deliberately narrower surface (see the §29 note on
 * GET /portal/summary at the bottom of this file) because §29 lists exactly
 * what an affiliate may see about a referred customer and exactly what they
 * may not. Serving both audiences from one set of handlers would mean that
 * limit lived in a filter somebody has to remember to apply.
 *
 * Money is never recalculated on read. Commission rows carry the rate and the
 * amount they accrued with (§12/§13 protect commissions already earned), so
 * these handlers sum stored values and never re-derive them from the
 * affiliate's current rate.
 */

const router: IRouter = Router();

/** Statuses that represent money still owed, as opposed to settled or void. */
const OUTSTANDING_STATUSES = ["pending", "payable"] as const;

function affiliateSummaryFields(row: typeof affiliates.$inferSelect, now: Date) {
  const clock = {
    currentRatePct: row.commissionRatePct,
    lastQualifyingReferralAt: row.lastQualifyingReferralAt ?? null,
    rateEffectiveAt: row.rateEffectiveAt ?? row.createdAt ?? now,
  };
  const window = activityWindow(clock);
  return {
    activityStatus: activityStatus(clock, now),
    activityPeriodEndsAt: window.activityPeriodEndsAt,
    graceEndsAt: window.graceEndsAt,
    /** Non-empty means a reduction is DUE but has not been applied yet. */
    pendingReductions: pendingRateReductions(clock, now),
  };
}

// ─── POST /api/affiliates/apply — PUBLIC ─────────────────────────────────────

/**
 * The only unauthenticated endpoint in this file. Everything below it is
 * admin-only; this one is the affiliate programme's front door, and it is
 * written defensively because of that.
 *
 * THE APPLICANT DOES NOT CHOOSE THEIR REFERRAL CODE. This is the important
 * decision here, and it is deliberate:
 *
 *  - A code is the thing attribution is decided by. Letting a stranger pick one
 *    invites squatting on the obvious codes, and worse, on codes that look
 *    official — an applicant who claimed "CMS" or "MEDICARE" would be handing
 *    themselves a code that implies endorsement.
 *  - Codes are permanent and never reused (see the schema), so a bad code
 *    chosen at application time could not be cleaned up later without
 *    orphaning attribution.
 *
 * So the applicant gets a provisional code derived from their company name,
 * and the operator sets the real one when approving. The provisional code
 * attributes nothing, because a "pending" affiliate never accrues commission
 * (see lib/affiliate-accrual.ts).
 *
 * The application records acceptance and remains pending only until the
 * applicant completes real, verified Clerk signup and consultant workspace
 * registration. That authenticated registration activates it at 20%; no
 * operator approval or feature flag is involved.
 */
router.post("/apply", async (req, res) => {
  // The browser supplies a random attempt ID so even a lost response can be
  // investigated. Never log a caller-supplied value without validating it.
  const suppliedReference = req.get("X-Application-Reference");
  const reference = suppliedReference && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedReference)
    ? suppliedReference.toLowerCase() : randomUUID();
  res.set("X-Application-Reference", reference);
  const outcome = (value: "received" | "validation_rejected" | "duplicate" | "inserted" | "persistence_failed") =>
    req.log.info({ applicationReference: reference, outcome: value }, "Affiliate application outcome");
  const reject = (message: string) => {
    outcome("validation_rejected");
    return res.status(400).json({ error: message });
  };
  const duplicate = () => {
    outcome("duplicate");
    return res.status(409).json({
      code: "APPLICATION_ALREADY_EXISTS",
      error: "This email already has an affiliate application or account. Sign in to continue or contact support if you need help.",
    });
  };
  outcome("received");
  const body = req.body ?? {};
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const about = typeof body.about === "string" ? body.about.trim() : "";
  const agreementVersion = typeof body.agreementVersion === "string" ? body.agreementVersion : "";
  const agreementSha256 = typeof body.agreementSha256 === "string" ? body.agreementSha256 : "";

  if (companyName.length < 2 || companyName.length > 200) {
    return reject("Please enter your company or practice name.");
  }
  if (contactName.length < 2 || contactName.length > 200) {
    return reject("Please enter your name.");
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return reject("Please enter a valid email address.");
  }
  if (phone.length < 7 || phone.length > 50) {
    return reject("Please enter a phone number.");
  }
  if (about.length < 10 || about.length > 2000) {
    return reject("Please describe how you plan to refer clients (10–2,000 characters).");
  }
  if ([companyName, contactName, about].some(containsSensitiveFinancialNumber)
      || hasSensitiveContact({ email, phone })) {
    return reject("Do not enter tax identifiers or payment account numbers.");
  }
  if (body.agreed !== true || !agreementVersion || !/^[a-f0-9]{64}$/.test(agreementSha256)) {
    return reject("Read and agree to the current affiliate agreement before applying.");
  }

  try {
    // One application per email, regardless of the existing record's status.
    // Report duplicates explicitly rather than implying a new application was created.
    const [existing] = await db.select({ id: affiliates.id })
      .from(affiliates).where(eq(sql`lower(trim(${affiliates.email}))`, email)).limit(1);
    if (existing) {
      return duplicate();
    }

    const accepted = await db.transaction(async (tx) => {
      const currentVersion = reviewedAffiliateAgreementVersion();
      if (!currentVersion || agreementVersion !== currentVersion) return false;
      const [agreement] = await tx.select({
        version: affiliateAgreements.version,
        contentSha256: affiliateAgreements.contentSha256,
      }).from(affiliateAgreements).where(eq(affiliateAgreements.version, currentVersion)).limit(1);
      if (!agreement || agreement.contentSha256 !== agreementSha256) return false;
      const now = new Date();
      const [application] = await tx.insert(affiliates).values({
        referralCode: await provisionalReferralCode(companyName),
        companyName,
        contactName,
        email,
        phone,
        status: "pending",
        commissionRatePct: 0,
        rateEffectiveAt: now,
        createdAt: now,
        adminNotes: `Application note: ${about}`,
      }).returning({ id: affiliates.id, identityEpoch: affiliates.agreementIdentityEpoch });
      await tx.insert(affiliateAgreementAcceptances).values(applicationAcceptanceEvidence({
        affiliateId: application.id,
        version: agreement.version,
        contentSha256: agreement.contentSha256,
        contactName,
        companyName,
        email,
        identityEpoch: application.identityEpoch,
        acceptedAt: now,
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent"),
      }));
      return true;
    });
    if (!accepted) {
      outcome("validation_rejected");
      return res.status(409).json({ error: "The affiliate agreement changed or is unavailable. Reload it before applying." });
    }

    outcome("inserted");
    return res.status(201).json({
      ok: true,
      received: true,
      nextStep: "create_account",
      message: "Agreement accepted. Create your secure account to activate your affiliate membership and start your 30-day workspace access.",
    });
  } catch (error: unknown) {
    // A concurrent submission for the same email is a duplicate. A unique
    // collision on the provisional code is NOT a successful application.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      try {
        const [existing] = await db.select({ id: affiliates.id })
          .from(affiliates).where(eq(sql`lower(trim(${affiliates.email}))`, email)).limit(1);
        if (existing) {
          return duplicate();
        }
      } catch {
        // The lookup failed as well; report failure, not a false success.
      }
    }
    // DB errors can contain SQL parameters and applicant data: never log them.
    outcome("persistence_failed");
    return res.status(500).json({ error: "We could not record your application. Please try again or contact support." });
  }
});

/**
 * A provisional, non-colliding code from the company name.
 *
 * Never shown to the applicant and never used for real attribution — the
 * operator replaces it at approval. It exists only because referral_code is
 * NOT NULL, and a nullable code would mean every query that matches an account
 * to an affiliate has to handle null, which is how an account ends up
 * attributed to whichever pending application happened to have no code.
 */
async function provisionalReferralCode(companyName: string): Promise<string> {
  const base = normalizeReferralCode(companyName.replace(/[^A-Za-z0-9]+/g, "-"))
    ?.replace(/^-+|-+$/g, "")
    .slice(0, 40) || "APPLICANT";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const candidate = `PENDING-${base}-${suffix}`.slice(0, 64);
    const [clash] = await db.select({ id: affiliates.id })
      .from(affiliates).where(eq(affiliates.referralCode, candidate)).limit(1);
    if (!clash) return candidate;
  }
  return `PENDING-${Date.now().toString(36).toUpperCase()}`;
}

// ─── GET /api/affiliates — the admin list ────────────────────────────────────

/**
 * One row per affiliate with their attribution and commission rollup.
 *
 * Deliberately three queries and an in-memory join rather than one grouped SQL
 * statement: the programme is small enough that this is not a performance
 * question, and the shape mirrors GET /api/admin/clients, which an operator
 * reads side by side with this.
 */
router.get("/", requireAnyAdmin, async (req, res) => {
  const now = new Date();
  const includeTest = req.query.includeTest === "true";
  try {
    const rows = includeTest
      ? await db.select().from(affiliates).orderBy(desc(affiliates.createdAt))
      : await db.select().from(affiliates).where(eq(affiliates.isTest, false)).orderBy(desc(affiliates.createdAt));
    if (rows.length === 0) return res.json([]);

    const ids = rows.map((r) => r.id);

    const [referredCounts, commissionRollup, acceptedAgreements] = await Promise.all([
      db
        .select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(includeTest ? undefined : and(eq(accounts.isTest, false),
          or(isNull(affiliates.id), eq(affiliates.isTest, false))))
        .groupBy(accounts.referralCode),
      db
        .select({
          affiliateId: affiliateCommissions.affiliateId,
          status: affiliateCommissions.status,
          total: sql<number>`coalesce(sum(${affiliateCommissions.commissionUsd}), 0)`,
          count: sql<number>`count(*)::int`,
        })
        .from(affiliateCommissions)
        .innerJoin(accounts, eq(accounts.id, affiliateCommissions.accountId))
        .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
        .where(and(inArray(affiliateCommissions.affiliateId, ids),
          ...(includeTest ? [] : [eq(accounts.isTest, false), eq(affiliates.isTest, false)])))
        .groupBy(affiliateCommissions.affiliateId, affiliateCommissions.status),
      db.select({
        affiliateId: affiliateAgreementAcceptances.affiliateId,
        version: affiliateAgreementAcceptances.agreementVersion,
        acceptedAt: affiliateAgreementAcceptances.acceptedAt,
        invitationId: affiliateAgreementAcceptances.invitationId,
        signerName: affiliateAgreementAcceptances.signerName,
        legalBusinessName: affiliateAgreementAcceptances.legalBusinessName,
      }).from(affiliateAgreementAcceptances)
        .innerJoin(affiliateAgreements, and(
          eq(affiliateAgreementAcceptances.agreementVersion, affiliateAgreements.version),
          eq(affiliateAgreementAcceptances.contentSha256, affiliateAgreements.contentSha256),
        )).innerJoin(affiliates, and(
          eq(affiliateAgreementAcceptances.affiliateId, affiliates.id),
          eq(affiliateAgreementAcceptances.signerEmail, sql`lower(trim(${affiliates.email}))`),
          eq(affiliateAgreementAcceptances.identityEpoch, affiliates.agreementIdentityEpoch),
        )).where(inArray(affiliateAgreementAcceptances.affiliateId, ids)),
    ]);
    const currentAgreementVersion = reviewedAffiliateAgreementVersion();
    const acceptedById = new Map(acceptedAgreements
      .filter((record) => record.version === currentAgreementVersion)
      .map((record) => [record.affiliateId, record]));

    const referredByCode = new Map(
      referredCounts
        .filter((r) => r.referralCode)
        .map((r) => [r.referralCode as string, { total: r.total, active: r.active }]),
    );

    const commissionsById = new Map<string, Record<string, { total: number; count: number }>>();
    for (const row of commissionRollup) {
      const bucket = commissionsById.get(row.affiliateId) ?? {};
      bucket[row.status] = { total: Number(row.total) || 0, count: row.count };
      commissionsById.set(row.affiliateId, bucket);
    }

    return res.json(redactSensitiveFinancialData(rows.map((row) => {
      const referred = referredByCode.get(row.referralCode) ?? { total: 0, active: 0 };
      const buckets = commissionsById.get(row.id) ?? {};
      const sumOf = (...statuses: string[]) =>
        money(statuses.reduce((sum, s) => sum + (buckets[s]?.total ?? 0), 0));

      return {
        id: row.id,
        referralCode: row.referralCode,
        companyName: row.companyName,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
        isTest: row.isTest,
        referralPlan: row.status === "pending" && row.adminNotes?.startsWith("Application note: ")
          ? row.adminNotes.slice("Application note: ".length)
          : null,
        status: row.status,
        applicationHeldAt: row.applicationHeldAt,
        applicationHoldReason: row.applicationHoldReason,
        agreementAcceptance: acceptedById.get(row.id) ?? null,
        commissionRatePct: row.commissionRatePct,
        lastQualifyingReferralAt: row.lastQualifyingReferralAt,
        taxInfoReceivedAt: row.taxInfoReceivedAt,
        enrollmentSignedAt: row.enrollmentSignedAt,
        subscriptionFeeWaived: row.subscriptionFeeWaived,
        createdAt: row.createdAt,
        referredAccounts: referred.total,
        activeReferredAccounts: referred.active,
        commissions: {
          pendingUsd:  sumOf("pending"),
          payableUsd:  sumOf("payable"),
          paidUsd:     sumOf("paid"),
          reversedUsd: sumOf("reversed"),
          lifetimeEarnedUsd: sumOf("pending", "payable", "paid"),
        },
        ...affiliateSummaryFields(row, now),
      };
    })));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to load affiliates" });
  }
});

// ─── GET /api/affiliates/stats — the panel header ────────────────────────────

router.get("/stats", requireAnyAdmin, async (req, res) => {
  const { start, end, label } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
  const now = new Date();
  const includeTest = req.query.includeTest === "true";
  try {
    const [affiliateRows, monthCommissions, outstanding, monthSignups] = await Promise.all([
      includeTest ? db.select().from(affiliates)
        : db.select().from(affiliates).where(eq(affiliates.isTest, false)),
      db.select({
        affiliateId: affiliateCommissions.affiliateId,
        status: affiliateCommissions.status,
        commissionUsd: affiliateCommissions.commissionUsd,
        qualifyingRevenueUsd: affiliateCommissions.qualifyingRevenueUsd,
      }).from(affiliateCommissions)
        .innerJoin(accounts, eq(accounts.id, affiliateCommissions.accountId))
        .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
        .where(and(
          gte(affiliateCommissions.accruedAt, start),
          lt(affiliateCommissions.accruedAt, end),
          ...(includeTest ? [] : [eq(accounts.isTest, false), eq(affiliates.isTest, false)]),
        )),
      db.select({
        status: affiliateCommissions.status,
        total: sql<number>`coalesce(sum(${affiliateCommissions.commissionUsd}), 0)`,
      }).from(affiliateCommissions)
        .innerJoin(accounts, eq(accounts.id, affiliateCommissions.accountId))
        .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
        .where(and(inArray(affiliateCommissions.status, [...OUTSTANDING_STATUSES]),
          ...(includeTest ? [] : [eq(accounts.isTest, false), eq(affiliates.isTest, false)])))
        .groupBy(affiliateCommissions.status),
      db.select({ total: sql<number>`count(*)::int` })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(and(
          sql`${accounts.referralCode} is not null`,
          gte(accounts.createdAt, start),
          lt(accounts.createdAt, end),
          ...(includeTest ? [] : [
            eq(accounts.isTest, false),
            or(isNull(affiliates.id), eq(affiliates.isTest, false))!,
          ]),
        )),
    ]);

    const outstandingByStatus = new Map(outstanding.map((r) => [r.status, Number(r.total) || 0]));
    const lapsing = affiliateRows.filter((row) => {
      const state = affiliateSummaryFields(row, now).activityStatus;
      return state === "in-grace" || state === "lapsed";
    }).length;

    return res.json({
      monthLabel: label,
      totalAffiliates:   affiliateRows.length,
      activeAffiliates:  affiliateRows.filter((r) => r.status === "active").length,
      pendingAffiliates: affiliateRows.filter((r) => r.status === "pending").length,
      // Compatibility flag for the legacy admin screen: never report a
      // feature-pause. Activation still independently requires the current
      // published agreement and an applicant acceptance at the mutation edge.
      activationEnabled: true,
      /** Affiliates inside the §11 grace period or already past it. */
      lapsingAffiliates: lapsing,
      thisMonth: {
        referredSignups: monthSignups[0]?.total ?? 0,
        commissionsAccruedUsd: money(
          monthCommissions
            .filter((c) => c.status !== "reversed" && c.status !== "cancelled")
            .reduce((sum, c) => sum + (c.commissionUsd ?? 0), 0),
        ),
        qualifyingRevenueUsd: money(
          monthCommissions
            .filter((c) => c.status !== "reversed" && c.status !== "cancelled")
            .reduce((sum, c) => sum + (c.qualifyingRevenueUsd ?? 0), 0),
        ),
      },
      outstanding: {
        /** §24 — accrued but still inside the 60-day holdback. */
        pendingUsd: money(outstandingByStatus.get("pending") ?? 0),
        /** Holdback elapsed; awaiting the next quarterly payout (§8). */
        payableUsd: money(outstandingByStatus.get("payable") ?? 0),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to load affiliate stats" });
  }
});

// ─── GET /api/affiliates/:id — one affiliate in full ─────────────────────────

router.get("/:id", requireAnyAdmin, async (req, res) => {
  const now = new Date();
  try {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Affiliate not found" });

    const [referred, commissions, payouts, rateChanges] = await Promise.all([
      db.select({
        id: accounts.id,
        facilityName: accounts.facilityName,
        subscriptionStatus: accounts.subscriptionStatus,
        createdAt: accounts.createdAt,
      }).from(accounts).where(eq(accounts.referralCode, row.referralCode)).orderBy(desc(accounts.createdAt)),
      db.select({
        affiliateId: affiliateCommissions.affiliateId,
        commissionUsd: affiliateCommissions.commissionUsd,
      }).from(affiliateCommissions)
        .where(eq(affiliateCommissions.affiliateId, row.id))
        .orderBy(desc(affiliateCommissions.accruedAt)).limit(500),
      db.select({
        affiliateId: affiliatePayouts.affiliateId,
        netUsd: affiliatePayouts.netUsd,
      }).from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, row.id))
        .orderBy(desc(affiliatePayouts.createdAt)),
      db.select().from(affiliateRateChanges)
        .where(eq(affiliateRateChanges.affiliateId, row.id))
        .orderBy(desc(affiliateRateChanges.effectiveAt)),
    ]);

    return res.json(redactSensitiveFinancialData({
      ...row,
      ...affiliateSummaryFields(row, now),
      referredAccounts: referred,
      commissions,
      payouts,
      rateChanges,
    }));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to load affiliate" });
  }
});

// ─── POST /api/affiliates — enroll ───────────────────────────────────────────

router.post("/", requireSuperAdmin, async (req, res) => {
  // Direct enrollment may only create a pending, unpaid applicant. No admin
  // supplied signature date/version is evidence of the applicant's acceptance.
  const {
    referralCode, companyName, contactName, email, phone,
    adminNotes, status,
  } = req.body ?? {};
  // An applicant must accept the reviewed document before activation. A new
  // admin-created row has no verified applicant identity or acceptance yet.
  if (status != null && status !== "pending") {
    return res.status(409).json({ code: "AGREEMENT_ACCEPTANCE_REQUIRED",
      error: "Create a pending application, invite the applicant to accept, then approve it." });
  }
  if (req.body?.agreementAcceptance != null || req.body?.agreementVersion != null
      || req.body?.acceptedAt != null || req.body?.enrollmentSignedAt != null
      || req.body?.enrollmentVersion != null || req.body?.commissionRatePct != null
      || req.body?.subscriptionFeeWaived === true) {
    return res.status(400).json({ error: "Agreement acceptance and paid rates cannot be supplied for a new application." });
  }

  const code = normalizeReferralCode(referralCode);
  if (!code || !isValidReferralCode(code) || !isSafeAffiliateIdentifier(code)) {
    return res.status(400).json({
      error: "Referral code must be 2–64 characters, letters, digits and hyphens, starting with a letter or digit.",
      code: "INVALID_REFERRAL_CODE",
    });
  }
  if (typeof companyName !== "string" || !companyName.trim()) {
    return res.status(400).json({ error: "Company name is required." });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "A contact email is required." });
  }
  if ([companyName, contactName, adminNotes]
    .some((value) => typeof value === "string" && containsSensitiveFinancialNumber(value))
      || hasSensitiveContact({ email, phone })) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }
  try {
    const now = new Date();
    const [created] = await db.insert(affiliates).values({
      referralCode: code,
      companyName: companyName.trim(),
      contactName: typeof contactName === "string" ? contactName.trim() || null : null,
      email: email.trim().toLowerCase(),
      phone: typeof phone === "string" ? phone.trim() || null : null,
      status: "pending",
      commissionRatePct: 0,
      rateEffectiveAt: now,
      subscriptionFeeWaived: false,
      adminNotes: typeof adminNotes === "string" ? adminNotes : null,
    }).returning();

    return res.status(201).json(redactSensitiveFinancialData(created));
  } catch (error: any) {
    // Unique violation on referral_code. Caught rather than pre-checked because
    // two enrollments can race a check-then-insert, and a reused code silently
    // attributes new customers to whoever printed the old flyer.
    if (error?.code === "23505") {
      return res.status(409).json({
        error: "That referral code is already in use. Codes are never reused, including after termination.",
        code: "REFERRAL_CODE_TAKEN",
      });
    }
    return res.status(500).json({ error: "Unable to create affiliate" });
  }
});

// ─── PATCH /api/affiliates/:id ───────────────────────────────────────────────

/**
 * Editable fields only. `referralCode` is NOT among them: changing a live code
 * orphans every account already attributed to it, and there is no way to tell
 * afterwards which customers were whose. A mistyped code is fixed by creating
 * the correct affiliate and reassigning deliberately.
 */
router.patch("/:id", requireSuperAdmin, async (req, res) => {
  const patch: Record<string, unknown> = {};
  const body = req.body ?? {};

  if (["companyName", "contactName", "payoutMethod", "payoutReference", "adminNotes"].some((field) =>
    typeof body[field] === "string" && containsSensitiveFinancialNumber(body[field]))
      || hasSensitiveContact(body)) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }
  for (const field of ["companyName", "contactName", "email", "phone", "payoutMethod", "payoutReference", "adminNotes"]) {
    if (typeof body[field] === "string") patch[field] =
      field === "email" ? body[field].trim().toLowerCase() : body[field].trim() || null;
  }
  if (["pending", "active", "suspended", "terminated"].includes(body.status)) patch.status = body.status;
  if (typeof body.subscriptionFeeWaived === "boolean") patch.subscriptionFeeWaived = body.subscriptionFeeWaived;
  if (body.taxInfoReceivedAt !== undefined) {
    patch.taxInfoReceivedAt = body.taxInfoReceivedAt ? new Date(body.taxInfoReceivedAt) : null;
  }
  if (body.enrollmentSignedAt !== undefined) {
    patch.enrollmentSignedAt = body.enrollmentSignedAt ? new Date(body.enrollmentSignedAt) : null;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No editable fields supplied." });
  }
  if (patch.email !== undefined && (typeof patch.email !== "string"
      || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(patch.email))) {
    return res.status(400).json({ error: "Enter a valid contact email." });
  }
  patch.updatedAt = new Date();

  try {
    let expectedStatus: string | null = null;
    let expectedEmail: string | null = null;
    let expectedEpoch: number | null = null;
    if (body.status === "active") {
      const [existing] = await db.select({
        status: affiliates.status, email: affiliates.email, identityEpoch: affiliates.agreementIdentityEpoch,
        applicationHeldAt: affiliates.applicationHeldAt,
      })
        .from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
      if (!existing) return res.status(404).json({ error: "Affiliate not found" });
      expectedStatus = existing.status;
      expectedEmail = existing.email;
      expectedEpoch = existing.identityEpoch;
      if (typeof patch.email === "string" && patch.email.toLowerCase() !== existing.email.toLowerCase()) {
        patch.agreementIdentityEpoch = sql`${affiliates.agreementIdentityEpoch} + 1`;
      }
      if (existing.status !== "active" && existing.applicationHeldAt) {
        return res.status(409).json({ error: "Release the application hold before activating this applicant." });
      }
      if (existing.status !== "active" && typeof patch.email === "string"
          && patch.email.toLowerCase() !== existing.email.toLowerCase()) {
        return res.status(409).json({ error: "Change the email first, then invite that applicant to accept." });
      }
      if (existing.status !== "active" && !(await hasReviewedAffiliateAcceptance(String(req.params.id)))) {
        return res.status(409).json({ code: "AGREEMENT_ACCEPTANCE_REQUIRED",
          error: "The applicant must accept the current reviewed agreement before activation." });
      }
    }
    if (body.status !== "active" && typeof patch.email === "string") {
      const [existing] = await db.select({
        email: affiliates.email, status: affiliates.status, identityEpoch: affiliates.agreementIdentityEpoch,
      })
        .from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
      if (!existing) return res.status(404).json({ error: "Affiliate not found" });
      expectedEmail = existing.email;
      expectedStatus = existing.status;
      expectedEpoch = existing.identityEpoch;
      if (patch.email !== existing.email.toLowerCase()) {
        patch.agreementIdentityEpoch = sql`${affiliates.agreementIdentityEpoch} + 1`;
      }
    }
    const [updated] = await db.update(affiliates).set(patch)
      .where(expectedStatus !== null && expectedEmail !== null && expectedEpoch !== null
        ? and(eq(affiliates.id, String(req.params.id)),
          eq(affiliates.status, expectedStatus),
          eq(sql`lower(trim(${affiliates.email}))`, expectedEmail.trim().toLowerCase()),
          eq(affiliates.agreementIdentityEpoch, expectedEpoch),
          ...(body.status === "active" && expectedStatus !== "active"
            ? [currentReviewedAffiliateAcceptanceCondition(), isNull(affiliates.applicationHeldAt)] : []))
        : eq(affiliates.id, String(req.params.id)))
      .returning();
    if (!updated) return res.status(expectedStatus !== null ? 409 : 404).json({
      error: expectedStatus !== null ? "Affiliate changed; reload before editing." : "Affiliate not found",
    });
    return res.json(redactSensitiveFinancialData(updated));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to update affiliate" });
  }
});

// ─── Application review: hold, release, reject, approve ─────────────────────

router.post("/:id/hold", requireSuperAdmin, async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 2000 || containsSensitiveFinancialNumber(reason)) {
    return res.status(400).json({ error: "Provide a safe hold reason (5–2,000 characters)." });
  }
  try {
    const held = await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx.update(affiliates)
        .set({ applicationHeldAt: now, applicationHoldReason: reason, updatedAt: now })
        .where(and(eq(affiliates.id, String(req.params.id)), eq(affiliates.status, "pending"),
          isNull(affiliates.applicationHeldAt)))
        .returning({ id: affiliates.id, status: affiliates.status, applicationHeldAt: affiliates.applicationHeldAt,
          applicationHoldReason: affiliates.applicationHoldReason });
      if (!row) return null;
      await tx.insert(affiliateComplianceAuditLog).values({
        affiliateId: row.id, actorType: "admin", actorId: (req as any).clerkUserId,
        eventType: "application_held", reason,
        priorValue: { status: "pending", held: false }, newValue: { status: "pending", held: true },
      });
      return row;
    });
    if (!held) return res.status(409).json({ error: "Only an unheld pending application can be held." });
    return res.json(held);
  } catch {
    return res.status(500).json({ error: "Unable to hold application." });
  }
});

router.post("/:id/release-hold", requireSuperAdmin, async (req, res) => {
  try {
    const released = await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx.update(affiliates)
        .set({ applicationHeldAt: null, applicationHoldReason: null, updatedAt: now })
        .where(and(eq(affiliates.id, String(req.params.id)), eq(affiliates.status, "pending"),
          isNotNull(affiliates.applicationHeldAt)))
        .returning({ id: affiliates.id, status: affiliates.status });
      if (!row) return null;
      await tx.insert(affiliateComplianceAuditLog).values({
        affiliateId: row.id, actorType: "admin", actorId: (req as any).clerkUserId,
        eventType: "application_hold_released", reason: "Application review resumed",
        priorValue: { status: "pending", held: true }, newValue: { status: "pending", held: false },
      });
      return row;
    });
    if (!released) return res.status(409).json({ error: "Only a held pending application can be released." });
    return res.json(released);
  } catch {
    return res.status(500).json({ error: "Unable to release application hold." });
  }
});

// A declined application is not an enrolled partner. Keep its record for the
// review trail, but prevent subsequent approval or commission accrual.
router.post("/:id/reject", requireSuperAdmin, async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 2000 || containsSensitiveFinancialNumber(reason)) {
    return res.status(400).json({ error: "Provide a safe review reason (5–2,000 characters)." });
  }
  try {
    const rejected = await db.transaction(async (tx) => {
      const [row] = await tx.update(affiliates)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(affiliates.id, String(req.params.id)), eq(affiliates.status, "pending")))
        .returning({ id: affiliates.id, status: affiliates.status });
      if (!row) return null;
      await tx.insert(affiliateComplianceAuditLog).values({
        affiliateId: row.id, actorType: "admin", actorId: (req as any).clerkUserId,
        eventType: "application_rejected", reason,
        priorValue: { status: "pending" }, newValue: { status: "rejected" },
      });
      return row;
    });
    if (!rejected) return res.status(409).json({ error: "Only a pending application can be rejected." });
    return res.json(rejected);
  } catch {
    return res.status(500).json({ error: "Unable to reject application." });
  }
});

/**
 * Approve an application: generate a permanent referral code and put the rate
 * in effect. The pending affiliate row becomes the active Affiliate record.
 *
 * This is the ONLY place a referral code may be changed, and only while the
 * affiliate is still "pending". Once active, the code is frozen — PATCH refuses
 * it — because changing a live code orphans every account already attributed to
 * it, with no way afterwards to tell which customers were whose.
 *
 * Approval is also where the commission rate first becomes non-zero. An
 * applicant sits at 0% until a human decides otherwise, so an application that
 * is never reviewed can never quietly start earning.
 */
router.post("/:id/approve", requireSuperAdmin, async (req, res) => {
  const legacyCode = req.body?.referralCode === undefined ? null : normalizeReferralCode(req.body.referralCode);
  if (req.body?.referralCode !== undefined
      && (!legacyCode || !isValidReferralCode(legacyCode) || !isSafeAffiliateIdentifier(legacyCode))) {
    return res.status(400).json({ error: "Invalid referral code. Codes are now assigned automatically." });
  }
  if (req.body?.referralCode !== undefined) {
    return res.status(400).json({ error: "Referral codes are assigned automatically at approval." });
  }
  // Enrollment starts at 20%. Later changes continue through the existing
  // 20-10-0 ladder; this route never edits earned commission rows.
  const ratePct = 20;
  if (!(await reviewedAffiliateAgreementExists())) {
    return res.status(409).json({ code: "AGREEMENT_NOT_PUBLISHED",
      error: "Publish the reviewed agreement before approving applicants." });
  }

  try {
    const [row] = await db.select().from(affiliates)
      .where(eq(affiliates.id, String(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Affiliate not found" });
    if (row.status !== "pending") {
      return res.status(409).json({
        error: `This affiliate is already ${row.status}. Only a pending application can be approved.`,
      });
    }
    if (row.applicationHeldAt) {
      return res.status(409).json({ error: "Release the application hold before approving this applicant." });
    }
    if (!(await hasReviewedAffiliateAcceptance(row.id))) {
      return res.status(409).json({ code: "AGREEMENT_ACCEPTANCE_REQUIRED",
        error: `The applicant must accept agreement ${reviewedAffiliateAgreementVersion()} before approval.` });
    }

    let updated: typeof affiliates.$inferSelect | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        updated = await db.transaction(async (tx) => {
          const now = new Date();
          const [activated] = await tx.update(affiliates)
            .set({
              referralCode: generateAffiliateReferralCode(),
              status: "active",
              commissionRatePct: ratePct,
              rateEffectiveAt: now,
              updatedAt: now,
            })
            .where(and(
              eq(affiliates.id, row.id), eq(affiliates.status, "pending"),
              isNull(affiliates.applicationHeldAt),
              eq(sql`lower(trim(${affiliates.email}))`, row.email.trim().toLowerCase()),
              eq(affiliates.agreementIdentityEpoch, row.agreementIdentityEpoch),
              currentReviewedAffiliateAcceptanceCondition(),
            ))
            .returning();
          if (!activated) return undefined;
          await tx.insert(affiliateRateChanges).values({
            affiliateId: row.id,
            fromPct: row.commissionRatePct,
            toPct: ratePct,
            reason: "enrollment",
            note: approvalRateChangeNote(),
            changedBy: (req as any).clerkUserId ?? null,
            effectiveAt: now,
          });
          return activated;
        });
        break;
      } catch (error: any) {
        if (error?.code !== "23505" || attempt === 2) throw error;
      }
    }

    if (!updated) {
      return res.status(409).json({
        error: "The application or agreement acceptance changed. Refresh before approving.",
      });
    }

    const referralLink = `${getReturnBase(req)}/register?ref=${encodeURIComponent(updated.referralCode)}`;
    let emailSent = false;
    let emailError: string | null = null;
    if (updated.email) {
      const emailResult = await sendViaResend({
        to: updated.email,
        subject: "Your CMS Compliance Suite affiliate account is ready",
        html: `<p>Hi ${updated.contactName || updated.companyName},</p><p>Your affiliate account for <strong>${updated.companyName}</strong> is active at a ${updated.commissionRatePct}% commission rate.</p><p>Create your secure login and start your 30-day workspace access here: <a href="${getReturnBase(req)}/sign-up?affiliate=1&amp;email=${encodeURIComponent(updated.email)}&amp;company=${encodeURIComponent(updated.companyName)}">Create your affiliate login</a>.</p><p>Your referral link is <a href="${referralLink}">${referralLink}</a> (code <strong>${updated.referralCode}</strong>). Your commission participation remains active whether or not you continue a paid workspace subscription.</p>`,
        text: `Hi ${updated.contactName || updated.companyName}, your affiliate account is active at ${updated.commissionRatePct}%. Create your secure login and start your 30-day workspace access: ${getReturnBase(req)}/sign-up?affiliate=1&email=${encodeURIComponent(updated.email)}&company=${encodeURIComponent(updated.companyName)}. Referral link: ${referralLink}. Referral code: ${updated.referralCode}.`,
      });
      emailSent = emailResult.sent;
      if (!emailResult.sent) {
        emailError = emailResult.error;
        console.error(`[affiliates] approval email to ${updated.email} failed: ${emailResult.error}`);
      }
    } else {
      emailError = "Affiliate has no email on file.";
    }

    return res.json(redactSensitiveFinancialData({ ...updated, referralLink, emailSent, emailError }));
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({
        error: "That referral code is already in use. Codes are never reused, including after termination.",
        code: "REFERRAL_CODE_TAKEN",
      });
    }
    return res.status(500).json({ error: error?.message ?? "Unable to approve affiliate" });
  }
});

// ─── POST /api/affiliates/:id/rate — deliberate rate change (§15) ────────────

router.post("/:id/rate", requireSuperAdmin, async (req, res) => {
  const toPct = Number(req.body?.commissionRatePct);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (typeof req.body?.note === "string" && containsSensitiveFinancialNumber(req.body.note)) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }
  if (!COMMISSION_RATE_LADDER.includes(toPct as any)) {
    return res.status(400).json({ error: `Rate must be one of ${COMMISSION_RATE_LADDER.join(", ")} (§14).` });
  }

  try {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Affiliate not found" });
    if (row.status === "pending") {
      return res.status(409).json({ error: "Pending applications cannot receive a paid rate. Approve after reviewed terms are enabled." });
    }
    if (row.commissionRatePct === toPct) return res.json(row);

    const now = new Date();
    const [updated] = await db.update(affiliates)
      .set({ commissionRatePct: toPct, rateEffectiveAt: now, updatedAt: now })
      .where(eq(affiliates.id, row.id)).returning();

    await db.insert(affiliateRateChanges).values({
      affiliateId: row.id,
      fromPct: row.commissionRatePct,
      toPct,
      reason: ["inactivity", "restoration", "manual"].includes(reason) ? reason : "manual",
      note: typeof req.body?.note === "string" ? req.body.note : null,
      changedBy: (req as any).clerkUserId ?? null,
      effectiveAt: now,
    });

    // Existing commission rows are untouched on purpose — §12 and §13 both say
    // commissions properly earned before a reduction are not retroactively
    // reduced, and the rate is frozen on each row for exactly this reason.
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to change rate" });
  }
});

// ─── POST /api/affiliates/:id/commissions — manual adjustment ────────────────

/**
 * A hand-entered commission or correction. The normal path is the Stripe
 * webhook; this exists for the cases §22 anticipates — a payment taken outside
 * Stripe, a negotiated adjustment, a correction after a dispute.
 *
 * Writes a NEW row rather than editing an existing one, so the ledger stays
 * append-mostly and the original accrual remains visible next to its correction.
 */
router.post("/:id/commissions", requireSuperAdmin, async (req, res) => {
  const qualifyingRevenueUsd = Number(req.body?.qualifyingRevenueUsd);
  const accountId = req.body?.accountId;
  if (!Number.isFinite(qualifyingRevenueUsd) || qualifyingRevenueUsd <= 0) {
    return res.status(400).json({ error: "qualifyingRevenueUsd must be a positive number." });
  }
  if (typeof accountId !== "string" || !accountId) {
    return res.status(400).json({ error: "accountId is required — a commission is always tied to a customer." });
  }

  try {
    const activation = await getAffiliateV4Activation();
    if (!activation.active) {
      req.log.warn({ reason: activation.reason }, "Manual commission accrual blocked because affiliate v4 is not activated.");
      return res.status(409).json({
        code: "AFFILIATE_V4_NOT_ACTIVATED",
        error: "Manual commission accrual requires the canonical v4 agreement to be published and activated.",
        reason: activation.reason,
      });
    }

    const accruedAt = req.body?.accruedAt ? new Date(req.body.accruedAt) : new Date();
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(affiliates)
        .where(eq(affiliates.id, String(req.params.id)))
        .for("update")
        .limit(1);
      if (!row) return { kind: "not-found" as const };
      if (row.isTest) return { kind: "test-record" as const };
      if (row.status === "pending") return { kind: "pending" as const };
      const [account] = await tx.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update")
        .limit(1);
      if (!account) return { kind: "account-not-found" as const };
      if (account.isTest) return { kind: "test-record" as const };
      if (!await hasCurrentAffiliateV4Acceptance(
        row.id,
        row.email,
        row.agreementIdentityEpoch,
        activation.contentSha256,
      )) {
        return { kind: "acceptance-required" as const };
      }

      const ratePct = Number.isFinite(Number(req.body?.ratePct))
        ? Number(req.body.ratePct)
        : row.commissionRatePct;
      const [created] = await tx.insert(affiliateCommissions).values({
        affiliateId: row.id,
        accountId,
        qualifyingRevenueUsd: roundUsd(qualifyingRevenueUsd),
        ratePct,
        commissionUsd: computeCommissionUsd(qualifyingRevenueUsd, ratePct),
        status: "pending",
        accruedAt,
        payableAt: holdbackEndsAt(accruedAt),
        source: `manual:${(req as any).clerkUserId ?? "admin"}`,
      }).returning();
      return { kind: "created" as const, created };
    });

    if (outcome.kind === "not-found") return res.status(404).json({ error: "Affiliate not found" });
    if (outcome.kind === "account-not-found") return res.status(404).json({ error: "Client account not found" });
    if (outcome.kind === "test-record") {
      return res.status(409).json({ error: "Test clients and affiliates cannot accrue commissions." });
    }
    if (outcome.kind === "pending") {
      return res.status(409).json({ error: "Pending applications cannot accrue commissions." });
    }
    if (outcome.kind === "acceptance-required") {
      return res.status(409).json({
        code: "AFFILIATE_V4_ACCEPTANCE_REQUIRED",
        error: "This affiliate must accept the current canonical v4 agreement before manual commission accrual.",
      });
    }
    return res.status(201).json(outcome.created);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to record commission" });
  }
});

// ─── POST /api/affiliates/commissions/:commissionId/reverse (§25) ────────────

router.post("/commissions/:commissionId/reverse", requireSuperAdmin, async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) {
    return res.status(400).json({ error: "A reason is required — a reversal has to be explainable later." });
  }
  if (containsSensitiveFinancialNumber(reason)) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }
  try {
    const now = new Date();
    // Guarded so an already-reversed row cannot be reversed twice, which would
    // double-deduct from the affiliate's next payout.
    const [updated] = await db.update(affiliateCommissions)
      .set({ status: "reversed", reversedAt: now, reversalReason: reason })
      .where(and(
        eq(affiliateCommissions.id, String(req.params.commissionId)),
        inArray(affiliateCommissions.status, ["pending", "payable", "paid"]),
      ))
      .returning();
    if (!updated) {
      return res.status(409).json({
        error: "That commission is not in a reversible state — it may already be reversed or cancelled.",
      });
    }
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to reverse commission" });
  }
});

// ─── POST /api/affiliates/cron/maturity-sweep — pending → payable (§24) ──────

/**
 * Promotes commissions whose 60-day holdback has elapsed.
 *
 * Guarded by requireCronOrSuperAdmin, matching the other scheduled endpoints in
 * routes/admin.ts, so an external scheduler can run it with CRON_SECRET. That
 * matters more than it looks: without something calling this on a schedule,
 * commissions accrue and then sit at "pending" forever. Every quarterly payout
 * would come out empty, and the failure is silent — no error, no alert, just an
 * affiliate who is never paid.
 *
 * Idempotent and safe to run on any schedule: it selects on payableAt and the
 * current status, so running it twice in a day, or not at all for a month,
 * produces the same end state. Nothing here pays anybody; it only moves money
 * out of the holdback into "awaiting the next payout".
 *
 * Suggested schedule: daily. Nothing breaks if it runs hourly or weekly.
 */
router.post("/cron/maturity-sweep", requireCronOrSuperAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const promoted = await db.update(affiliateCommissions)
      .set({ status: "payable" })
      .where(and(
        eq(affiliateCommissions.status, "pending"),
        lt(affiliateCommissions.payableAt, now),
      ))
      .returning({ id: affiliateCommissions.id });
    return res.json({ ok: true, promoted: promoted.length });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Maturity sweep failed" });
  }
});

// ─── POST /api/affiliates/cron/rate-reductions — inactivity + notices ────────

type AffiliateV4Activation =
  | { active: true; contentSha256: string }
  | { active: false; reason: string };

async function getAffiliateV4Activation(): Promise<AffiliateV4Activation> {
  if (process.env.AFFILIATE_REVIEWED_TERMS_VERSION?.trim() !== AFFILIATE_AGREEMENT_V4_VERSION) {
    return { active: false, reason: "reviewed-version-not-v4" };
  }

  let canonicalBody: string;
  try {
    canonicalBody = prepareAffiliateAgreementV4(affiliateAgreementV4Source);
  } catch {
    return { active: false, reason: "canonical-v4-source-invalid" };
  }
  const contentSha256 = createHash("sha256").update(canonicalBody).digest("hex");
  const [published] = await db.select({
    body: affiliateAgreements.body,
    contentSha256: affiliateAgreements.contentSha256,
  }).from(affiliateAgreements)
    .where(eq(affiliateAgreements.version, AFFILIATE_AGREEMENT_V4_VERSION))
    .limit(1);

  if (!published) return { active: false, reason: "canonical-v4-not-published" };
  if (published.body !== canonicalBody || published.contentSha256 !== contentSha256) {
    return { active: false, reason: "published-v4-not-canonical" };
  }
  return { active: true, contentSha256 };
}

async function hasCurrentAffiliateV4Acceptance(
  affiliateId: string,
  email: string,
  identityEpoch: number,
  contentSha256: string,
): Promise<boolean> {
  const [acceptance] = await db.select({ id: affiliateAgreementAcceptances.id })
    .from(affiliateAgreementAcceptances)
    .where(and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliateId),
      eq(affiliateAgreementAcceptances.agreementVersion, AFFILIATE_AGREEMENT_V4_VERSION),
      eq(affiliateAgreementAcceptances.contentSha256, contentSha256),
      eq(affiliateAgreementAcceptances.signerEmail, sql`lower(${email})`),
      eq(affiliateAgreementAcceptances.identityEpoch, identityEpoch),
    ))
    .limit(1);
  return Boolean(acceptance);
}

/**
 * Applies due inactivity reductions and sends the 15-calendar-day notices for
 * activity-period, grace-period, and zero-rate restoration deadlines.
 *
 * Run once daily with Authorization: Bearer CRON_SECRET (or SESSION_SECRET
 * fallback). Notices are first attempted only on the UTC calendar day exactly
 * 15 days before the deadline; definite provider rejections may retry later
 * while the deadline remains ahead. Set AFFILIATE_RATE_AUTOMATION_SCHEDULER_CONFIGURED=true
 * only after an external daily invocation is actually configured.
 */
router.post("/cron/rate-reductions", requireCronOrSuperAdmin, async (req, res) => {
  const now = new Date();
  let affiliatesReduced = 0;
  let reductionsApplied = 0;
  let affiliatesSkippedNoCurrentV4Acceptance = 0;
  let reductionsSkippedNoCurrentV4Acceptance = 0;
  const schedulerConfigured = process.env.AFFILIATE_RATE_AUTOMATION_SCHEDULER_CONFIGURED === "true";
  if (!schedulerConfigured) {
    req.log.warn(
      { route: "/api/affiliates/cron/rate-reductions" },
      "Affiliate rate automation has no configured daily scheduler; configure an authenticated daily caller.",
    );
  }

  try {
    const candidates = await db.select({
      id: affiliates.id,
      email: affiliates.email,
      commissionRatePct: affiliates.commissionRatePct,
      rateEffectiveAt: affiliates.rateEffectiveAt,
      lastQualifyingReferralAt: affiliates.lastQualifyingReferralAt,
      agreementIdentityEpoch: affiliates.agreementIdentityEpoch,
    })
      .from(affiliates)
      .where(eq(affiliates.status, "active"));

    const activation = await getAffiliateV4Activation();
    if (!activation.active) {
      const reductionsSkippedForV4NotActivated = candidates.reduce((total, affiliate) => (
        total + (affiliate.rateEffectiveAt
          ? pendingRateReductions({
            currentRatePct: affiliate.commissionRatePct,
            lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
            rateEffectiveAt: affiliate.rateEffectiveAt,
          }, now).length
          : 0)
      ), 0);
      const noticesSkippedForV4NotActivated = candidates.reduce((total, affiliate) => (
        total + (affiliate.rateEffectiveAt
          ? dueAffiliateRateNotices({
            currentRatePct: affiliate.commissionRatePct,
            lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
            rateEffectiveAt: affiliate.rateEffectiveAt,
          }, now).length
          : 0)
      ), 0);
      const retryCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const retryableNotices = await db.select({
        affiliateId: affiliateRateNoticeDeliveries.affiliateId,
      }).from(affiliateRateNoticeDeliveries).where(and(
        isNull(affiliateRateNoticeDeliveries.sentAt),
        isNull(affiliateRateNoticeDeliveries.claimedAt),
        isNotNull(affiliateRateNoticeDeliveries.lastError),
        lt(affiliateRateNoticeDeliveries.lastAttemptAt, retryCutoff),
        gt(affiliateRateNoticeDeliveries.deadlineAt, now),
      )).limit(500);
      const activeAffiliateIds = new Set(candidates.map(({ id }) => id));
      const retryNoticesSkippedForV4NotActivated = retryableNotices
        .filter(({ affiliateId }) => activeAffiliateIds.has(affiliateId)).length;
      const totalNoticesSkippedForV4NotActivated =
        noticesSkippedForV4NotActivated + retryNoticesSkippedForV4NotActivated;
      req.log.warn({
        reason: activation.reason,
        activeAffiliatesSkipped: candidates.length,
        reductionsSkipped: reductionsSkippedForV4NotActivated,
        noticesSkipped: totalNoticesSkippedForV4NotActivated,
      }, "Affiliate v4 is not activated; no inactivity changes or v4 notices were processed.");
      return res.json({
        ok: true,
        schedulerConfigured,
        v4AutomationActive: false,
        v4ActivationReason: activation.reason,
        affiliatesReduced: 0,
        reductionsApplied: 0,
        affiliatesSkippedForV4NotActivated: candidates.length,
        reductionsSkippedForV4NotActivated,
        noticesMatched: 0,
        noticesSent: 0,
        noticesSkippedForV4NotActivated: totalNoticesSkippedForV4NotActivated,
        noticesRetriedLater: 0,
        noticesWithUncertainDelivery: 0,
        noticesAlreadyClaimed: 0,
        affiliatesSkippedNoCurrentV4Acceptance: 0,
        reductionsSkippedNoCurrentV4Acceptance: 0,
        noticesSkippedNoCurrentV4Acceptance: 0,
        noticesSkippedStaleRetry: 0,
      });
    }

    for (const { id } of candidates) {
      const outcome = await db.transaction(async (tx) => {
        const [affiliate] = await tx.select().from(affiliates)
          .where(eq(affiliates.id, id))
          .for("update")
          .limit(1);
        if (!affiliate || affiliate.status !== "active" || !affiliate.rateEffectiveAt) {
          return { reductions: [], skippedForAcceptance: false, skippedReductionCount: 0 };
        }
        const pending = pendingRateReductions({
          currentRatePct: affiliate.commissionRatePct,
          lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
          rateEffectiveAt: affiliate.rateEffectiveAt,
        }, now);
        if (!await hasCurrentAffiliateV4Acceptance(
          affiliate.id,
          affiliate.email,
          affiliate.agreementIdentityEpoch,
          activation.contentSha256,
        )) {
          return {
            reductions: [],
            skippedForAcceptance: true,
            skippedReductionCount: pending.length,
          };
        }

        const reductions = await applyPendingAffiliateRateReductions({
          currentRatePct: affiliate.commissionRatePct,
          lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
          rateEffectiveAt: affiliate.rateEffectiveAt,
        }, now, async (reduction) => {
          await tx.update(affiliates)
            .set({
              commissionRatePct: reduction.toPct,
              rateEffectiveAt: reduction.effectiveAt,
              updatedAt: now,
            })
            .where(eq(affiliates.id, affiliate.id));
          await tx.insert(affiliateRateChanges).values({
            affiliateId: affiliate.id,
            fromPct: reduction.fromPct,
            toPct: reduction.toPct,
            reason: "inactivity",
            note: "Scheduled activity-period inactivity reduction.",
            changedBy: "system:inactivity-sweep",
            effectiveAt: reduction.effectiveAt,
            createdAt: now,
          });
        });
        return { reductions, skippedForAcceptance: false, skippedReductionCount: 0 };
      });

      if (outcome.skippedForAcceptance) affiliatesSkippedNoCurrentV4Acceptance += 1;
      reductionsSkippedNoCurrentV4Acceptance += outcome.skippedReductionCount;
      if (outcome.reductions.length > 0) affiliatesReduced += 1;
      reductionsApplied += outcome.reductions.length;
    }

    const noticeResult = await sendDueAffiliateRateNotices(now, req, activation.contentSha256);
    return res.status(noticeResult.failed > 0 || noticeResult.uncertain > 0 ? 207 : 200).json({
      ok: noticeResult.failed === 0 && noticeResult.uncertain === 0,
      schedulerConfigured,
      v4AutomationActive: true,
      affiliatesReduced,
      reductionsApplied,
      noticesMatched: noticeResult.matched,
      noticesSent: noticeResult.sent,
      noticesRetriedLater: noticeResult.failed,
      noticesWithUncertainDelivery: noticeResult.uncertain,
      noticesAlreadyClaimed: noticeResult.skipped,
      affiliatesSkippedForV4NotActivated: 0,
      reductionsSkippedForV4NotActivated: 0,
      noticesSkippedForV4NotActivated: 0,
      affiliatesSkippedNoCurrentV4Acceptance,
      reductionsSkippedNoCurrentV4Acceptance,
      noticesSkippedNoCurrentV4Acceptance: noticeResult.skippedNoCurrentV4Acceptance,
      noticesSkippedStaleRetry: noticeResult.skippedStaleRetry,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Affiliate rate-reduction cron failed");
    return res.status(500).json({ error: "Affiliate rate-reduction cron failed." });
  }
});

async function claimAffiliateRateNotice(
  affiliateId: string,
  recipientEmail: string,
  candidate: AffiliateRateNoticeCandidate,
  now: Date,
): Promise<{ id: string; claimedAt: Date } | null> {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(affiliateRateNoticeDeliveries).values({
      affiliateId,
      noticeType: candidate.type,
      deadlineAt: candidate.deadlineAt,
      currentRatePct: candidate.currentRatePct,
      nextRatePct: candidate.nextRatePct,
      recipientEmail,
      claimedAt: now,
      lastAttemptAt: now,
      attemptCount: 1,
    }).onConflictDoNothing().returning({
      id: affiliateRateNoticeDeliveries.id,
    });
    if (created) return { id: created.id, claimedAt: now };

    const [existing] = await tx.select().from(affiliateRateNoticeDeliveries)
      .where(and(
        eq(affiliateRateNoticeDeliveries.affiliateId, affiliateId),
        eq(affiliateRateNoticeDeliveries.noticeType, candidate.type),
        eq(affiliateRateNoticeDeliveries.deadlineAt, candidate.deadlineAt),
      ))
      .for("update")
      .limit(1);
    if (!existing || existing.sentAt || existing.claimedAt) return null;

    const [claimed] = await tx.update(affiliateRateNoticeDeliveries)
      .set({
        recipientEmail,
        claimedAt: now,
        lastAttemptAt: now,
        attemptCount: existing.attemptCount + 1,
        lastError: null,
      })
      .where(and(
        eq(affiliateRateNoticeDeliveries.id, existing.id),
        isNull(affiliateRateNoticeDeliveries.sentAt),
        isNull(affiliateRateNoticeDeliveries.claimedAt),
      ))
      .returning({ id: affiliateRateNoticeDeliveries.id });
    return claimed ? { id: claimed.id, claimedAt: now } : null;
  });
}

async function sendDueAffiliateRateNotices(
  now: Date,
  req: Request,
  contentSha256: string,
): Promise<{
  matched: number;
  sent: number;
  failed: number;
  uncertain: number;
  skipped: number;
  skippedNoCurrentV4Acceptance: number;
  skippedStaleRetry: number;
}> {
  const candidates = await db.select({
    id: affiliates.id,
    commissionRatePct: affiliates.commissionRatePct,
    rateEffectiveAt: affiliates.rateEffectiveAt,
    lastQualifyingReferralAt: affiliates.lastQualifyingReferralAt,
  }).from(affiliates).where(eq(affiliates.status, "active"));

  const result = {
    matched: 0,
    sent: 0,
    failed: 0,
    uncertain: 0,
    skipped: 0,
    skippedNoCurrentV4Acceptance: 0,
    skippedStaleRetry: 0,
  };
  for (const affiliate of candidates) {
    if (!affiliate.rateEffectiveAt) continue;
    const due = dueAffiliateRateNotices({
      currentRatePct: affiliate.commissionRatePct,
      rateEffectiveAt: affiliate.rateEffectiveAt,
      lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
    }, now);
    for (const candidate of due) {
      result.matched += 1;
      await deliverAffiliateRateNotice(
        affiliate.id, candidate, now, req, contentSha256, false, null, result,
      );
    }
  }

  // A definite provider rejection clears its claim. Retry those records on a
  // later daily run while the deadline is still in the future. A 24-hour
  // backoff avoids retrying a rejected message repeatedly in one day's runs.
  const retryCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const retryable = await db.select().from(affiliateRateNoticeDeliveries).where(and(
    isNull(affiliateRateNoticeDeliveries.sentAt),
    isNull(affiliateRateNoticeDeliveries.claimedAt),
    isNotNull(affiliateRateNoticeDeliveries.lastError),
    lt(affiliateRateNoticeDeliveries.lastAttemptAt, retryCutoff),
    gt(affiliateRateNoticeDeliveries.deadlineAt, now),
  )).limit(500);
  for (const notice of retryable) {
    result.matched += 1;
    await deliverAffiliateRateNotice(notice.affiliateId, {
      type: notice.noticeType as AffiliateRateNoticeCandidate["type"],
      deadlineAt: notice.deadlineAt,
      currentRatePct: notice.currentRatePct,
      nextRatePct: notice.nextRatePct,
    }, now, req, contentSha256, true, notice.id, result);
  }

  return result;
}

async function deliverAffiliateRateNotice(
  affiliateId: string,
  expectedCandidate: AffiliateRateNoticeCandidate,
  now: Date,
  req: Request,
  contentSha256: string,
  isRetry: boolean,
  retryDeliveryId: string | null,
  result: {
    matched: number;
    sent: number;
    failed: number;
    uncertain: number;
    skipped: number;
    skippedNoCurrentV4Acceptance: number;
    skippedStaleRetry: number;
  },
): Promise<void> {
  const [affiliate] = await db.select().from(affiliates).where(and(
    eq(affiliates.id, affiliateId),
    eq(affiliates.status, "active"),
  )).limit(1);
  if (!affiliate || !affiliate.email.trim()) {
    if (isRetry && retryDeliveryId) {
      await suppressAffiliateRateNoticeRetry(retryDeliveryId, now, "Affiliate is no longer active or has no email.");
      result.skippedStaleRetry += 1;
    } else {
      result.skipped += 1;
    }
    return;
  }

  const currentCandidates = affiliate.rateEffectiveAt
    ? affiliateRateNoticeCandidates({
      currentRatePct: affiliate.commissionRatePct,
      lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
      rateEffectiveAt: affiliate.rateEffectiveAt,
    })
    : [];
  const currentCandidate = currentCandidates.find((candidate) => (
    candidate.type === expectedCandidate.type
      && candidate.deadlineAt.getTime() === expectedCandidate.deadlineAt.getTime()
      && candidate.currentRatePct === expectedCandidate.currentRatePct
      && candidate.nextRatePct === expectedCandidate.nextRatePct
      && (isRetry ? candidate.deadlineAt > now : isAffiliateRateNoticeDue(candidate.deadlineAt, now))
  ));
  if (!currentCandidate) {
    if (isRetry && retryDeliveryId) {
      await suppressAffiliateRateNoticeRetry(retryDeliveryId, now, "Notice no longer matches the affiliate's current rate clock.");
      result.skippedStaleRetry += 1;
    } else {
      result.skipped += 1;
    }
    return;
  }

  if (!await hasCurrentAffiliateV4Acceptance(
    affiliate.id,
    affiliate.email,
    affiliate.agreementIdentityEpoch,
    contentSha256,
  )) {
    if (isRetry && retryDeliveryId) {
      await suppressAffiliateRateNoticeRetry(retryDeliveryId, now, "Current v4 acceptance is missing or no longer matches the affiliate identity.");
      result.skippedStaleRetry += 1;
    }
    result.skippedNoCurrentV4Acceptance += 1;
    return;
  }

  const recipientEmail = affiliate.email;
  const candidate = currentCandidate;
  const claim = await claimAffiliateRateNotice(affiliateId, recipientEmail, candidate, now);
  if (!claim) {
    result.skipped += 1;
    return;
  }

  const message = affiliateRateNoticeEmail(candidate);
  const delivery = await sendViaResend({
    to: recipientEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (delivery.sent) {
    await db.update(affiliateRateNoticeDeliveries)
      .set({ sentAt: new Date(), lastError: null })
      .where(and(
        eq(affiliateRateNoticeDeliveries.id, claim.id),
        eq(affiliateRateNoticeDeliveries.claimedAt, claim.claimedAt),
        isNull(affiliateRateNoticeDeliveries.sentAt),
      ));
    result.sent += 1;
    return;
  }

  const error = delivery.error.slice(0, 1000);
  const definiteRejection = delivery.status !== undefined && delivery.status < 500;
  await db.update(affiliateRateNoticeDeliveries)
    .set({
      ...(definiteRejection ? { claimedAt: null } : {}),
      lastError: error,
    })
    .where(and(
      eq(affiliateRateNoticeDeliveries.id, claim.id),
      eq(affiliateRateNoticeDeliveries.claimedAt, claim.claimedAt),
      isNull(affiliateRateNoticeDeliveries.sentAt),
    ));
  if (definiteRejection) {
    result.failed += 1;
    req.log.warn({ noticeType: candidate.type, status: delivery.status }, "Affiliate rate notice was rejected and can be retried.");
  } else {
    // An absent status or HTTP 5xx leaves delivery uncertain. Preserve the
    // claim rather than risk a duplicate if Resend accepted before failing.
    result.uncertain += 1;
    req.log.error({ noticeType: candidate.type, status: delivery.status }, "Affiliate rate notice delivery is uncertain; its claim remains locked.");
  }
}

async function suppressAffiliateRateNoticeRetry(
  deliveryId: string,
  now: Date,
  reason: string,
): Promise<void> {
  await db.update(affiliateRateNoticeDeliveries)
    .set({ claimedAt: now, lastError: `Suppressed: ${reason}` })
    .where(and(
      eq(affiliateRateNoticeDeliveries.id, deliveryId),
      isNull(affiliateRateNoticeDeliveries.sentAt),
      isNull(affiliateRateNoticeDeliveries.claimedAt),
    ));
}

// ─── GET /api/affiliates/payouts/preview?quarter=YYYY-Qn (§8) ────────────────

/**
 * What each affiliate would be paid for a quarter, without writing anything.
 *
 * A preview rather than a create-then-review, because assembling a payout is
 * the moment errors become money. The operator sees the figures, and the
 * separate POST is what commits them.
 */
router.get("/payouts/preview", requireAnyAdmin, async (req, res) => {
  const label = typeof req.query.quarter === "string" ? req.query.quarter : quarterOf(new Date());
  const bounds = quarterBounds(label);
  if (!bounds) return res.status(400).json({ error: "quarter must look like 2026-Q1." });

  try {
    const [affiliateRows, payable, reversals, priorCarried] = await Promise.all([
      db.select().from(affiliates).where(eq(affiliates.isTest, false)),
      db.select({
        affiliateId: affiliateCommissions.affiliateId,
        commissionUsd: affiliateCommissions.commissionUsd,
      }).from(affiliateCommissions)
        .innerJoin(accounts, eq(accounts.id, affiliateCommissions.accountId))
        .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
        .where(and(
        eq(affiliateCommissions.status, "payable"),
        eq(accounts.isTest, false),
        eq(affiliates.isTest, false),
        lt(affiliateCommissions.payableAt, bounds.end),
      )),
      // Reversals of ALREADY PAID commissions inside this quarter — these are
      // the §25 deductions. Reversals of unpaid rows need no adjustment: the
      // row simply never becomes payable.
      db.select({
        affiliateId: affiliateCommissions.affiliateId,
        commissionUsd: affiliateCommissions.commissionUsd,
      }).from(affiliateCommissions)
        .innerJoin(accounts, eq(accounts.id, affiliateCommissions.accountId))
        .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
        .where(and(
        eq(affiliateCommissions.status, "reversed"),
        eq(accounts.isTest, false),
        eq(affiliates.isTest, false),
        gte(affiliateCommissions.reversedAt, bounds.start),
        lt(affiliateCommissions.reversedAt, bounds.end),
        sql`${affiliateCommissions.paidAt} is not null`,
      )),
      db.select({
        affiliateId: affiliatePayouts.affiliateId,
        netUsd: affiliatePayouts.netUsd,
      }).from(affiliatePayouts)
        .innerJoin(affiliates, eq(affiliates.id, affiliatePayouts.affiliateId))
        .where(and(eq(affiliatePayouts.status, "carried"), eq(affiliates.isTest, false))),
    ]);

    const byAffiliate = new Map<string, { lines: { commissionUsd: number }[]; reversed: number; carried: number }>();
    const bucket = (id: string) => {
      let b = byAffiliate.get(id);
      if (!b) { b = { lines: [], reversed: 0, carried: 0 }; byAffiliate.set(id, b); }
      return b;
    };
    for (const row of payable) bucket(row.affiliateId).lines.push({ commissionUsd: row.commissionUsd ?? 0 });
    for (const row of reversals) bucket(row.affiliateId).reversed += row.commissionUsd ?? 0;
    for (const row of priorCarried) bucket(row.affiliateId).carried += row.netUsd ?? 0;

    const rows = affiliateRows
      .map((affiliate) => {
        const b = byAffiliate.get(affiliate.id);
        if (!b || (b.lines.length === 0 && b.reversed === 0 && b.carried === 0)) return null;
        const assembly = assemblePayout(b.lines, b.reversed, b.carried);
        return {
          affiliateId: affiliate.id,
          referralCode: affiliate.referralCode,
          companyName: affiliate.companyName,
          taxInfoOnFile: affiliate.taxInfoReceivedAt != null,
          payoutMethod: affiliate.payoutMethod,
          commissionCount: b.lines.length,
          ...assembly,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.netUsd - a.netUsd);
    const reviewedRows = await Promise.all(rows.map(async (row) => ({
      ...row,
      payoutEligibility: await calculateAffiliatePayoutEligibility(row.affiliateId),
    })));

    return res.json(redactSensitiveFinancialData({
      quarter: bounds.label,
      minimumPayoutUsd: MINIMUM_PAYOUT_USD,
      rows: reviewedRows,
      totals: {
        payableNowUsd: money(reviewedRows.filter((r) => r.meetsMinimum && r.payoutEligibility.eligible).reduce((s, r) => s + r.netUsd, 0)),
        carryingForwardUsd: money(reviewedRows.filter((r) => !r.meetsMinimum).reduce((s, r) => s + r.netUsd, 0)),
        affiliatesPaid: reviewedRows.filter((r) => r.meetsMinimum && r.payoutEligibility.eligible).length,
        /**
         * §18 — Company may require tax information before paying. Surfaced so
         * the operator sees a blocked payout before the quarter closes rather
         * than on the day they try to send the money.
         */
        blockedOnTaxInfo: reviewedRows.filter((r) => r.meetsMinimum && r.payoutEligibility.compliance_status.taxStatus !== "verified_complete").length,
      },
    }));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to preview payouts" });
  }
});

// ─── POST /api/affiliates/payouts — commit one affiliate's quarter ───────────

/**
 * Turns a previewed quarter into a payout row and stamps its commissions paid.
 *
 * One affiliate per call, on purpose. A single "close the quarter" button that
 * writes every affiliate at once is one mis-click away from marking money paid
 * that was never sent, and there is no clean undo for that — the commissions
 * are stamped and the ledger says they were settled.
 *
 * Commissions are claimed with a guarded UPDATE (status must still be
 * "payable"), so two operators clicking at once cannot both settle the same
 * rows. The payout's gross is then summed from what was ACTUALLY claimed,
 * not from the preview — otherwise a row claimed by the other request would
 * still be paid for here.
 */
// Historical settlement stamps commissions paid before any transfer. Keep the
// route for callers, but never execute that unsafe handler while the new,
// reviewed workflow is the only payout path.
function blockUnsafeLegacySettlement(_req: Request, res: Response): void {
  res.status(409).json({
    error: "Legacy payout settlement is disabled. Use the reviewed workflow in /admin/affiliate-payouts.",
  });
}

router.post("/payouts", requireSuperAdmin, blockUnsafeLegacySettlement, async (req, res) => {
  const affiliateId = req.body?.affiliateId;
  const label = typeof req.body?.quarter === "string" ? req.body.quarter : quarterOf(new Date());
  const bounds = quarterBounds(label);
  if (typeof affiliateId !== "string" || !affiliateId) {
    return res.status(400).json({ error: "affiliateId is required." });
  }
  if (!bounds) return res.status(400).json({ error: "quarter must look like 2026-Q1." });
  if (typeof req.body?.notes === "string" && containsSensitiveFinancialNumber(req.body.notes)) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }

  try {
    const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!affiliate) return res.status(404).json({ error: "Affiliate not found" });
    const eligibility = await calculateAffiliatePayoutEligibility(affiliateId);
    if (!eligibility.eligible) {
      await auditBlockedPayoutAttempt(affiliateId, (req as any).clerkUserId ?? null, "legacy_payout_create", eligibility.blocking_reasons);
      return res.status(409).json({ error: "Affiliate is not eligible for payouts.", blockingReasons: eligibility.blocking_reasons });
    }

    const [existing] = await db.select().from(affiliatePayouts).where(and(
      eq(affiliatePayouts.affiliateId, affiliateId),
      eq(affiliatePayouts.periodLabel, bounds.label),
      inArray(affiliatePayouts.status, ["draft", "approved", "paid"]),
    )).limit(1);
    if (existing) {
      return res.status(409).json({
        error: `A ${bounds.label} payout already exists for this affiliate.`,
        payout: existing,
      });
    }

    const [payout] = await db.insert(affiliatePayouts).values({
      affiliateId,
      periodLabel: bounds.label,
      status: "draft",
      createdBy: (req as any).clerkUserId ?? null,
      notes: typeof req.body?.notes === "string" ? req.body.notes : null,
    }).returning();

    // Claim the rows. Guarded on status so a concurrent commit cannot settle
    // the same commission twice.
    const claimed = await db.update(affiliateCommissions)
      .set({ status: "paid", payoutId: payout!.id, paidAt: new Date() })
      .where(and(
        eq(affiliateCommissions.affiliateId, affiliateId),
        eq(affiliateCommissions.status, "payable"),
        lt(affiliateCommissions.payableAt, bounds.end),
      ))
      .returning({ commissionUsd: affiliateCommissions.commissionUsd });

    const carried = await db.select().from(affiliatePayouts).where(and(
      eq(affiliatePayouts.affiliateId, affiliateId),
      eq(affiliatePayouts.status, "carried"),
    ));
    const carriedBalance = carried.reduce((sum, row) => sum + (row.netUsd ?? 0), 0);

    const assembly = assemblePayout(
      claimed.map((row) => ({ commissionUsd: row.commissionUsd ?? 0 })),
      0,
      carriedBalance,
    );

    const [finalized] = await db.update(affiliatePayouts)
      .set({
        grossUsd: assembly.grossUsd,
        adjustmentsUsd: assembly.adjustmentsUsd,
        netUsd: assembly.netUsd,
        status: assembly.status,
      })
      .where(eq(affiliatePayouts.id, payout!.id)).returning();

    // Carried balances that have now been rolled into this payout are closed,
    // so the next quarter does not count them a second time.
    if (carried.length > 0) {
      await db.update(affiliatePayouts)
        .set({ status: "paid", notes: `Rolled into ${bounds.label}` })
        .where(inArray(affiliatePayouts.id, carried.map((row) => row.id)));
    }

    return res.status(201).json({
      ...finalized,
      commissionsSettled: claimed.length,
      meetsMinimum: assembly.meetsMinimum,
      minimumPayoutUsd: MINIMUM_PAYOUT_USD,
      taxInfoOnFile: affiliate.taxInfoReceivedAt != null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to create payout" });
  }
});

// ─── PATCH /api/affiliates/payouts/:payoutId — mark approved or paid ─────────

router.patch("/payouts/:payoutId", requireSuperAdmin, blockUnsafeLegacySettlement, async (req, res) => {
  const status = req.body?.status;
  if (!["approved", "paid"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'paid'." });
  }
  if (typeof req.body?.reference === "string" && containsSensitiveFinancialNumber(req.body.reference)) {
    return res.status(400).json({ error: "Do not enter tax identifiers or payment account numbers." });
  }
  try {
    const [existing] = await db.select().from(affiliatePayouts)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Payout not found" });
    const eligibility = await calculateAffiliatePayoutEligibility(existing.affiliateId);
    if (!eligibility.eligible) {
      await auditBlockedPayoutAttempt(existing.affiliateId, (req as any).clerkUserId ?? null, `legacy_payout_${status}`, eligibility.blocking_reasons);
      return res.status(409).json({ error: "Affiliate is not eligible for payouts.", blockingReasons: eligibility.blocking_reasons });
    }
    const patch: Record<string, unknown> = { status };
    if (status === "paid") patch.paidAt = new Date();
    // A reference, not an account number — see the payout field comments on
    // the affiliates table.
    if (typeof req.body?.reference === "string") patch.reference = req.body.reference.trim() || null;

    const [updated] = await db.update(affiliatePayouts).set(patch)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).returning();
    if (!updated) return res.status(404).json({ error: "Payout not found" });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to update payout" });
  }
});

// ─── GET /api/affiliates/reports/download?type=&month=|quarter= ──────────────

router.get("/reports/download", requireAnyAdmin, async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "";
  const includeTest = req.query.includeTest === "true";
  const now = new Date();

  try {
    if (type === "affiliates") {
      const affiliateQuery = db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
      const rows = includeTest ? await affiliateQuery
        : await affiliateQuery.where(eq(affiliates.isTest, false));
      const referredQuery = db
        .select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        })
        .from(accounts).groupBy(accounts.referralCode);
      const referred = includeTest ? await referredQuery
        : await db.select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        }).from(accounts).where(eq(accounts.isTest, false)).groupBy(accounts.referralCode);
      const referredByCode = new Map(referred.filter((r) => r.referralCode).map((r) => [r.referralCode as string, r]));

      const csv = toCsv(
        ["Referral Code", "Company", "Contact", "Email", "Status", "Rate %", "Activity Status",
         "Last Qualifying Referral", "Referred Accounts", "Active Referred", "Tax Info On File", "Enrolled", "Test"],
        rows.map((r) => {
          const ref = referredByCode.get(r.referralCode);
          return [
            r.referralCode, r.companyName, r.contactName, r.email, r.status, r.commissionRatePct,
            affiliateSummaryFields(r, now).activityStatus,
            r.lastQualifyingReferralAt?.toISOString().slice(0, 10) ?? "",
            ref?.total ?? 0, ref?.active ?? 0,
            r.taxInfoReceivedAt ? "yes" : "no",
            r.createdAt?.toISOString().slice(0, 10) ?? "",
            r.isTest ? "yes" : "no",
          ];
        }),
      );
      return sendCsv(res, `cop-suite-affiliates-${now.toISOString().slice(0, 10)}.csv`, redactSensitiveFinancialData(csv));
    }

    if (type === "commissions") {
      const { start, end, label } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
      const rows = await db
        .select({
          accruedAt: affiliateCommissions.accruedAt,
          payableAt: affiliateCommissions.payableAt,
          status: affiliateCommissions.status,
          qualifyingRevenueUsd: affiliateCommissions.qualifyingRevenueUsd,
          ratePct: affiliateCommissions.ratePct,
          commissionUsd: affiliateCommissions.commissionUsd,
          referralCode: affiliates.referralCode,
          companyName: affiliates.companyName,
          facilityName: accounts.facilityName,
          affiliateIsTest: affiliates.isTest,
          clientIsTest: accounts.isTest,
        })
        .from(affiliateCommissions)
        .innerJoin(affiliates, eq(affiliateCommissions.affiliateId, affiliates.id))
        .innerJoin(accounts, eq(affiliateCommissions.accountId, accounts.id))
        .where(and(
          gte(affiliateCommissions.accruedAt, start),
          lt(affiliateCommissions.accruedAt, end),
          ...(includeTest ? [] : [eq(affiliates.isTest, false), eq(accounts.isTest, false)]),
        ))
        .orderBy(desc(affiliateCommissions.accruedAt));

      const csv = toCsv(
        ["Accrued", "Payable", "Status", "Referral Code", "Affiliate", "Customer",
         "Qualifying Revenue USD", "Rate %", "Commission USD", "Test Affiliate", "Test Client"],
        rows.map((r) => [
          r.accruedAt?.toISOString().slice(0, 10) ?? "",
          r.payableAt?.toISOString().slice(0, 10) ?? "",
          r.status, r.referralCode, r.companyName, r.facilityName,
          (r.qualifyingRevenueUsd ?? 0).toFixed(2), r.ratePct, (r.commissionUsd ?? 0).toFixed(2),
          r.affiliateIsTest ? "yes" : "no", r.clientIsTest ? "yes" : "no",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-commissions-${label.replace(/ /g, "-")}.csv`, redactSensitiveFinancialData(csv));
    }

    if (type === "payouts") {
      const rows = await db
        .select({
          periodLabel: affiliatePayouts.periodLabel,
          status: affiliatePayouts.status,
          grossUsd: affiliatePayouts.grossUsd,
          adjustmentsUsd: affiliatePayouts.adjustmentsUsd,
          netUsd: affiliatePayouts.netUsd,
          paidAt: affiliatePayouts.paidAt,
          reference: affiliatePayouts.reference,
          referralCode: affiliates.referralCode,
          companyName: affiliates.companyName,
          affiliateIsTest: affiliates.isTest,
        })
        .from(affiliatePayouts)
        .innerJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
        .where(includeTest ? undefined : eq(affiliates.isTest, false))
        .orderBy(desc(affiliatePayouts.createdAt));

      const csv = toCsv(
        ["Quarter", "Referral Code", "Affiliate", "Status", "Gross USD", "Adjustments USD", "Net USD", "Paid", "Reference", "Test Affiliate"],
        rows.map((r) => [
          r.periodLabel, r.referralCode, r.companyName, r.status,
          (r.grossUsd ?? 0).toFixed(2), (r.adjustmentsUsd ?? 0).toFixed(2), (r.netUsd ?? 0).toFixed(2),
          r.paidAt?.toISOString().slice(0, 10) ?? "", r.reference ?? "",
          r.affiliateIsTest ? "yes" : "no",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-payouts-${now.toISOString().slice(0, 10)}.csv`, redactSensitiveFinancialData(csv));
    }

    if (type === "attribution") {
      // Every account carrying a referral code, including codes that match no
      // affiliate — an unmatched code is a real operational problem (a customer
      // who believes they were referred and an affiliate who will ask why they
      // were not credited), so it belongs in the report rather than filtered out.
      const rows = await db
        .select({
          facilityName: accounts.facilityName,
          referralCode: accounts.referralCode,
          subscriptionStatus: accounts.subscriptionStatus,
          createdAt: accounts.createdAt,
          state: accounts.state,
          affiliateName: affiliates.companyName,
          clientIsTest: accounts.isTest,
          affiliateIsTest: affiliates.isTest,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(and(sql`${accounts.referralCode} is not null`,
          ...(includeTest ? [] : [
            eq(accounts.isTest, false),
            or(isNull(affiliates.id), eq(affiliates.isTest, false))!,
          ])))
        .orderBy(desc(accounts.createdAt));

      const csv = toCsv(
        ["Registered", "Customer", "State", "Subscription", "Referral Code", "Matched Affiliate", "Test Client", "Test Affiliate"],
        rows.map((r) => [
          r.createdAt?.toISOString().slice(0, 10) ?? "",
          r.facilityName, r.state, r.subscriptionStatus, r.referralCode,
          r.affiliateName ?? "— UNMATCHED CODE —",
          r.clientIsTest ? "yes" : "no", r.affiliateIsTest ? "yes" : "no",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-attribution-${now.toISOString().slice(0, 10)}.csv`, redactSensitiveFinancialData(csv));
    }

    // Unlike the client report endpoint, an unknown type is an explicit error
    // rather than an empty 200 with a blank filename.
    return res.status(400).json({
      error: "Unknown report type.",
      supported: ["affiliates", "commissions", "payouts", "attribution"],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to build report" });
  }
});

export default router;
