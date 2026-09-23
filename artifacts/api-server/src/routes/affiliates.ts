import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import {
  accounts,
  affiliates,
  affiliateCommissions,
  affiliatePayouts,
  affiliateRateChanges,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { requireAnyAdmin, requireCronOrSuperAdmin, requireSuperAdmin } from "../lib/admin-guards.js";
import { affiliateActivationEnabled, isBlockedAffiliateActivation } from "../lib/affiliate-activation.js";
import { monthBounds, money, sendCsv, toCsv } from "../lib/report-format.js";
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

function activationBlocked(res: Response): boolean {
  if (affiliateActivationEnabled()) return false;
  res.status(403).json({
    code: "AFFILIATE_ACTIVATION_PAUSED",
    error: "New paid affiliate activations are paused until the owner enables reviewed program terms.",
  });
  return true;
}
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
 * An application also grants NOTHING. It creates a pending row for the operator
 * to review. No portal access, no commission, no rate.
 */
router.post("/apply", async (req, res) => {
  const body = req.body ?? {};

  const retainingActiveStatus = body.status === "active" && !affiliateActivationEnabled();
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const about = typeof body.about === "string" ? body.about.trim() : "";

  if (companyName.length < 2 || companyName.length > 200) {
    return res.status(400).json({ error: "Please enter your company or practice name." });
  }
  if (contactName.length < 2 || contactName.length > 200) {
    return res.status(400).json({ error: "Please enter your name." });
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (phone.length < 7 || phone.length > 50) {
    return res.status(400).json({ error: "Please enter a phone number." });
  }
  if (about.length < 10 || about.length > 2000) {
    return res.status(400).json({ error: "Please describe how you plan to refer clients (10–2,000 characters)." });
  }

  try {
    // One application per email. Returns the same 200 either way — an endpoint
    // that said "already applied" would let anyone test whether a given company
    // is in the programme.
    const [existing] = await db.select().from(affiliatePayouts).where(and(
      eq(affiliatePayouts.affiliateId, affiliateId),
      eq(affiliatePayouts.periodLabel, bounds.label),
      inArray(affiliatePayouts.status, ["draft", "approved", "paid"]),
    )).limit(1);
    if (existing) {
      return res.status(200).json({ ok: true, received: true });
    }

    const assignedCode = await provisionalReferralCode(companyName);

    await db.insert(affiliates).values({
      referralCode: assignedCode,
      companyName,
      contactName,
      email,
      phone,
      status: "pending",
      // No rate is in effect until approval. Recorded as 0 rather than 20 so a
      // pending applicant cannot accrue anything even if their status were
      // flipped by mistake without a deliberate rate decision.
      commissionRatePct: 0,
      rateEffectiveAt: new Date(),
      adminNotes: `Application note: ${about}`,
    });

    return res.status(201).json({ ok: true, received: true });
  } catch (error: any) {
    // Unique violation on the provisional code — vanishingly unlikely given the
    // random suffix, and not the applicant's problem. Same shape as success so
    // the endpoint reveals nothing about internal state.
    if (error?.code === "23505") return res.status(200).json({ ok: true, received: true });
    return res.status(500).json({ error: "We could not record your application. Please email us instead." });
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

  try {
    if (type === "affiliates") {
      const rows = await db
        .select({
          facilityName: accounts.facilityName,
          referralCode: accounts.referralCode,
          subscriptionStatus: accounts.subscriptionStatus,
          createdAt: accounts.createdAt,
          state: accounts.state,
          affiliateName: affiliates.companyName,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));
    if (rows.length === 0) return res.json([]);

    const ids = rows.map((r) => r.id);

    const [referredCounts, commissionRollup] = await Promise.all([
      db
        .select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        })
        .from(accounts)
        .groupBy(accounts.referralCode),
      db
        .select({
          affiliateId: affiliateCommissions.affiliateId,
          status: affiliateCommissions.status,
          total: sql<number>`coalesce(sum(${affiliateCommissions.commissionUsd}), 0)`,
          count: sql<number>`count(*)::int`,
        })
        .from(affiliateCommissions)
        .where(inArray(affiliateCommissions.affiliateId, ids))
        .groupBy(affiliateCommissions.affiliateId, affiliateCommissions.status),
    ]);

      const referredByCode = new Map(referred.filter((r) => r.referralCode).map((r) => [r.referralCode as string, r]));

    const commissionsById = new Map<string, Record<string, { total: number; count: number }>>();
    for (const row of commissionRollup) {
    const bucket = (id: string) => {
      let b = byAffiliate.get(id);
      if (!b) { b = { lines: [], reversed: 0, carried: 0 }; byAffiliate.set(id, b); }
      return b;
    };
      bucket[row.status] = { total: Number(row.total) || 0, count: row.count };
      commissionsById.set(row.affiliateId, bucket);
    }

    return res.json(rows.map((row) => {
      const referred = await db
        .select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        })
        .from(accounts).groupBy(accounts.referralCode);
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
        referralPlan: row.status === "pending" && row.adminNotes?.startsWith("Application note: ")
          ? row.adminNotes.slice("Application note: ".length)
          : null,
        status: row.status,
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
    }));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to load affiliates" });
  }
});

// ─── GET /api/affiliates/stats — the panel header ────────────────────────────

router.get("/stats", requireAnyAdmin, async (req, res) => {
      const { start, end, label } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
  const now = new Date();
  try {
    const [affiliateRows, monthCommissions, outstanding, monthSignups] = await Promise.all([
      db.select().from(affiliates),
      db.select().from(affiliateCommissions)
        .where(and(gte(affiliateCommissions.accruedAt, start), lt(affiliateCommissions.accruedAt, end))),
      db.select({
        status: affiliateCommissions.status,
        total: sql<number>`coalesce(sum(${affiliateCommissions.commissionUsd}), 0)`,
      }).from(affiliateCommissions)
        .where(inArray(affiliateCommissions.status, [...OUTSTANDING_STATUSES]))
        .groupBy(affiliateCommissions.status),
      db.select({ total: sql<number>`count(*)::int` })
        .from(accounts)
        .where(and(
          sql`${accounts.referralCode} is not null`,
          gte(accounts.createdAt, start),
          lt(accounts.createdAt, end),
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
      activationEnabled: affiliateActivationEnabled(),
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
      db.select().from(affiliateCommissions)
        .where(eq(affiliateCommissions.affiliateId, row.id))
        .orderBy(desc(affiliateCommissions.accruedAt)).limit(500),
      db.select().from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, row.id))
        .orderBy(desc(affiliatePayouts.createdAt)),
      db.select().from(affiliateRateChanges)
        .where(eq(affiliateRateChanges.affiliateId, row.id))
        .orderBy(desc(affiliateRateChanges.effectiveAt)),
    ]);

    return res.json({
      ...row,
      ...affiliateSummaryFields(row, now),
      referredAccounts: referred,
      commissions,
      payouts,
      rateChanges,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to load affiliate" });
  }
});

// ─── POST /api/affiliates — enroll ───────────────────────────────────────────

router.post("/", requireSuperAdmin, async (req, res) => {
  // Do not create even a pending legacy enrollment with a default paid rate.
  // Applicants can still use /apply, which stores a pending 0% record.
  if (activationBlocked(res)) return;
  const {
    referralCode, companyName, contactName, email, phone,
    commissionRatePct, enrollmentSignedAt, enrollmentVersion, agreementVersion,
    subscriptionFeeWaived, adminNotes, status,
  } = req.body ?? {};

  const code = normalizeReferralCode(referralCode);
  if (!code || !isValidReferralCode(code)) {
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

  const rate = Number.isFinite(Number(commissionRatePct)) ? Number(commissionRatePct) : 20;
  if (!COMMISSION_RATE_LADDER.includes(rate as any)) {
    return res.status(400).json({
      error: `Commission rate must be one of ${COMMISSION_RATE_LADDER.join(", ")} (§14).`,
    });
  }

  try {
  const now = new Date();
    const [created] = await db.insert(affiliateCommissions).values({
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

    await db.insert(affiliateRateChanges).values({
      affiliateId: created!.id,
      fromPct: rate,
      toPct: rate,
      reason: "enrollment",
      changedBy: (req as any).clerkUserId ?? null,
      effectiveAt: now,
    });

    return res.status(201).json(created);
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
    return res.status(500).json({ error: error?.message ?? "Unable to create affiliate" });
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
    const patch: Record<string, unknown> = { status };
  const body = req.body ?? {};

  const retainingActiveStatus = body.status === "active" && !affiliateActivationEnabled();
    const [updated] = await db.update(affiliatePayouts).set(patch)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).returning();
    if (!updated) return res.status(retainingActiveStatus ? 409 : 404).json({
      error: retainingActiveStatus ? "Affiliate status changed; reload before editing." : "Affiliate not found",
    });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Unable to update affiliate" });
  }
});

// ─── POST /api/affiliates/:id/approve — pending → active ─────────────────────

/**
 * Approve an application: assign the real referral code and put the rate in
 * effect.
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
  if (activationBlocked(res)) return;
  const requestedCode = normalizeReferralCode(req.body?.referralCode);
    const ratePct = Number.isFinite(Number(req.body?.ratePct))
      ? Number(req.body.ratePct)
      : row.commissionRatePct;

  if (!COMMISSION_RATE_LADDER.includes(ratePct as any) || ratePct <= 0) {
    return res.status(400).json({ error: "Approve at 20% or 10% (§14)." });
  }
  if (!requestedCode || !isValidReferralCode(requestedCode)) {
    return res.status(400).json({
      error: "A referral code is required to approve — 2–64 characters, letters, digits and hyphens.",
      code: "INVALID_REFERRAL_CODE",
    });
  }

  try {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Affiliate not found" });
    if (row.status === "pending") {
      return res.status(409).json({ error: "Pending applications cannot receive a paid rate. Approve after reviewed terms are enabled." });
    }
    if (row.commissionRatePct === toPct) return res.json(row);

  const now = new Date();
    const [updated] = await db.update(affiliatePayouts).set(patch)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).returning();

    if (!updated) {
      return res.status(409).json({ error: "That application was already approved." });
    }

    await db.insert(affiliateRateChanges).values({
      affiliateId: row.id,
      fromPct: row.commissionRatePct,
      toPct: ratePct,
      reason: "enrollment",
      note: `Approved; code assigned: ${requestedCode}`,
      changedBy: (req as any).clerkUserId ?? null,
      effectiveAt: now,
    });

    return res.json(updated);
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
    const [updated] = await db.update(affiliatePayouts).set(patch)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).returning();

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
    const [row] = await db.select().from(affiliates).where(eq(affiliates.id, String(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Affiliate not found" });
    if (row.status === "pending") {
      return res.status(409).json({ error: "Pending applications cannot accrue commissions." });
    }

    const accruedAt = req.body?.accruedAt ? new Date(req.body.accruedAt) : new Date();
    const ratePct = Number.isFinite(Number(req.body?.ratePct))
      ? Number(req.body.ratePct)
      : row.commissionRatePct;

    const [created] = await db.insert(affiliateCommissions).values({
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

    return res.status(201).json(created);
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
  try {
  const now = new Date();
    // Guarded so an already-reversed row cannot be reversed twice, which would
    // double-deduct from the affiliate's next payout.
    const [updated] = await db.update(affiliatePayouts).set(patch)
      .where(eq(affiliatePayouts.id, String(req.params.payoutId))).returning();
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

// ─── GET /api/affiliates/payouts/preview?quarter=YYYY-Qn (§8) ────────────────

/**
 * What each affiliate would be paid for a quarter, without writing anything.
 *
 * A preview rather than a create-then-review, because assembling a payout is
 * the moment errors become money. The operator sees the figures, and the
 * separate POST is what commits them.
 */
router.get("/payouts/preview", requireAnyAdmin, async (req, res) => {
  const label = typeof req.body?.quarter === "string" ? req.body.quarter : quarterOf(new Date());
  const bounds = quarterBounds(label);
  if (!bounds) return res.status(400).json({ error: "quarter must look like 2026-Q1." });

  try {
    const [affiliateRows, payable, reversals, priorCarried] = await Promise.all([
      db.select().from(affiliates),
      db.select().from(affiliateCommissions).where(and(
        eq(affiliateCommissions.status, "payable"),
        lt(affiliateCommissions.payableAt, bounds.end),
      )),
      // Reversals of ALREADY PAID commissions inside this quarter — these are
      // the §25 deductions. Reversals of unpaid rows need no adjustment: the
      // row simply never becomes payable.
      db.select().from(affiliateCommissions).where(and(
        eq(affiliateCommissions.status, "reversed"),
        gte(affiliateCommissions.reversedAt, bounds.start),
        lt(affiliateCommissions.reversedAt, bounds.end),
        sql`${affiliateCommissions.paidAt} is not null`,
      )),
      db.select().from(affiliatePayouts).where(eq(affiliatePayouts.status, "carried")),
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

      const rows = await db
        .select({
          facilityName: accounts.facilityName,
          referralCode: accounts.referralCode,
          subscriptionStatus: accounts.subscriptionStatus,
          createdAt: accounts.createdAt,
          state: accounts.state,
          affiliateName: affiliates.companyName,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));

    return res.json({
      quarter: bounds.label,
      minimumPayoutUsd: MINIMUM_PAYOUT_USD,
      rows,
      totals: {
        payableNowUsd: money(rows.filter((r) => r.meetsMinimum).reduce((s, r) => s + r.netUsd, 0)),
        carryingForwardUsd: money(rows.filter((r) => !r.meetsMinimum).reduce((s, r) => s + r.netUsd, 0)),
        affiliatesPaid: rows.filter((r) => r.meetsMinimum).length,
        /**
         * §18 — Company may require tax information before paying. Surfaced so
         * the operator sees a blocked payout before the quarter closes rather
         * than on the day they try to send the money.
         */
        blockedOnTaxInfo: rows.filter((r) => r.meetsMinimum && !r.taxInfoOnFile).length,
      },
    });
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
router.post("/payouts", requireSuperAdmin, async (req, res) => {
  const affiliateId = req.body?.affiliateId;
  const label = typeof req.body?.quarter === "string" ? req.body.quarter : quarterOf(new Date());
  const bounds = quarterBounds(label);
  if (typeof affiliateId !== "string" || !affiliateId) {
    return res.status(400).json({ error: "affiliateId is required." });
  }
  if (!bounds) return res.status(400).json({ error: "quarter must look like 2026-Q1." });

  try {
    const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!affiliate) return res.status(404).json({ error: "Affiliate not found" });

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

router.patch("/payouts/:payoutId", requireSuperAdmin, async (req, res) => {
  const status = req.body?.status;
  if (!["approved", "paid"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'paid'." });
  }
  try {
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
  const now = new Date();

  try {
    if (type === "affiliates") {
      const rows = await db
        .select({
          facilityName: accounts.facilityName,
          referralCode: accounts.referralCode,
          subscriptionStatus: accounts.subscriptionStatus,
          createdAt: accounts.createdAt,
          state: accounts.state,
          affiliateName: affiliates.companyName,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));
      const referred = await db
        .select({
          referralCode: accounts.referralCode,
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${accounts.subscriptionStatus} = 'active')::int`,
        })
        .from(accounts).groupBy(accounts.referralCode);
      const referredByCode = new Map(referred.filter((r) => r.referralCode).map((r) => [r.referralCode as string, r]));

      const csv = toCsv(
        ["Registered", "Customer", "State", "Subscription", "Referral Code", "Matched Affiliate"],
        rows.map((r) => [
          r.createdAt?.toISOString().slice(0, 10) ?? "",
          r.facilityName, r.state, r.subscriptionStatus, r.referralCode,
          r.affiliateName ?? "— UNMATCHED CODE —",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliates-${now.toISOString().slice(0, 10)}.csv`, csv);
    }

    if (type === "commissions") {
      const { start, end, label } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
      const rows = await db
        .select({
          facilityName: accounts.facilityName,
          referralCode: accounts.referralCode,
          subscriptionStatus: accounts.subscriptionStatus,
          createdAt: accounts.createdAt,
          state: accounts.state,
          affiliateName: affiliates.companyName,
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));

      const csv = toCsv(
        ["Registered", "Customer", "State", "Subscription", "Referral Code", "Matched Affiliate"],
        rows.map((r) => [
          r.createdAt?.toISOString().slice(0, 10) ?? "",
          r.facilityName, r.state, r.subscriptionStatus, r.referralCode,
          r.affiliateName ?? "— UNMATCHED CODE —",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-payouts-${now.toISOString().slice(0, 10)}.csv`, csv);
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
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));

      const csv = toCsv(
        ["Registered", "Customer", "State", "Subscription", "Referral Code", "Matched Affiliate"],
        rows.map((r) => [
          r.createdAt?.toISOString().slice(0, 10) ?? "",
          r.facilityName, r.state, r.subscriptionStatus, r.referralCode,
          r.affiliateName ?? "— UNMATCHED CODE —",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-payouts-${now.toISOString().slice(0, 10)}.csv`, csv);
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
        })
        .from(accounts)
        .leftJoin(affiliates, eq(accounts.referralCode, affiliates.referralCode))
        .where(sql`${accounts.referralCode} is not null`)
        .orderBy(desc(accounts.createdAt));

      const csv = toCsv(
        ["Registered", "Customer", "State", "Subscription", "Referral Code", "Matched Affiliate"],
        rows.map((r) => [
          r.createdAt?.toISOString().slice(0, 10) ?? "",
          r.facilityName, r.state, r.subscriptionStatus, r.referralCode,
          r.affiliateName ?? "— UNMATCHED CODE —",
        ]),
      );
      return sendCsv(res, `cop-suite-affiliate-attribution-${now.toISOString().slice(0, 10)}.csv`, csv);
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
