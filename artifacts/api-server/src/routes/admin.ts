import { Router, type IRouter } from "express";
import { getReturnBase } from "../lib/return-base.js";
import {
  requireAnyAdmin,
  requireCronOrSuperAdmin,
  requireSuperAdmin,
} from "../lib/admin-guards.js";
import { monthBounds, toCsv, sendCsv } from "../lib/report-format.js";
import { deliver } from "../lib/resend-mailer.js";
import { db } from "@workspace/db";
import { adminUsers, adminTestFlagAudit, accounts, accountUsers, tokenUsage, affiliates } from "@workspace/db";
import { eq, and, gte, lt, desc, isNull, inArray } from "drizzle-orm";
import {
  TRIAL_WARNING_SUBJECT,
  trialWarningEmailHtml,
  trialWarningWindow,
} from "../lib/trial-warning-email";
import {
  APP_TRIAL_STATUS,
  STRIPE_TRIAL_STATUS,
  isTrialStatus,
} from "../middlewares/subscriptionAccess";
import {
  USAGE_ALERT_SUBJECT,
  getAlertThresholdUsd,
  getUsageAlertRecipient,
  usageAlertEmailHtml,
  type UsageAlertRow,
} from "../lib/usage-alert";
import { affiliateReportRateFields, getAffiliateWorkspaceReport, type ConsultantWorkspaceLink } from "../lib/admin-affiliate-report.js";
import { resolveAccountContact, resolveAccountContacts } from "../lib/account-contact.js";
import {
  includeActiveAffiliateContacts,
  includeTestRows,
  parseIncludeTest,
} from "../lib/admin-client-rows.js";

/**
 * Sender for transactional mail. Resend's onboarding@resend.dev is a shared
 * test domain: hospital mail filters drop it, and Resend restricts it to the
 * account owner's own address until a domain is verified. Set
 * TRIAL_EMAIL_FROM to a verified address on your own domain before relying
 * on these notices reaching a customer.
 */
function getTrialEmailFrom(): string {
  return process.env.TRIAL_EMAIL_FROM?.trim()
    // CLERK_EMAIL_FROM is already set to a verified address on our own domain
    // for login codes. Falling back to it means these notices send correctly
    // with no extra configuration, instead of defaulting to a shared test
    // domain that cannot reach a customer at all.
    || process.env.CLERK_EMAIL_FROM?.trim()
    || "CMS Compliance Suite <onboarding@resend.dev>";
}

const router: IRouter = Router();
const TEST_FLAG_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Guards (requireSuperAdmin / requireCronOrSuperAdmin / requireAnyAdmin) and
// the report helpers (monthBounds / toCsv) now live in ../lib/admin-guards.ts
// and ../lib/report-format.ts, so routes/affiliates.ts uses the same ones
// rather than a second copy that could drift weaker. Imported at the top.

// ─── Internal AI cost monitoring ─────────────────────────────────────────────

// POST /api/admin/cron/usage-alerts
// One digest to the operator listing accounts whose month-to-date raw AI cost
// has passed the alert threshold. Nothing is capped, throttled, billed or sent
// to a customer — token cost is included in the subscription fee. The point is
// to learn the real usage distribution before deciding whether metered pricing
// is ever worth building.
//
// Stateless by design: a single digest means no per-account sent-flag, so this
// can run on any schedule without a schema change or duplicate-send guard.
router.post("/cron/usage-alerts", requireCronOrSuperAdmin, async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thresholdUsd = getAlertThresholdUsd();

  try {
    const [allAccounts, monthRows] = await Promise.all([
      db.select().from(accounts),
      db.select().from(tokenUsage).where(gte(tokenUsage.createdAt, monthStart)),
    ]);

    const byAccount = new Map<string, { rawCostUsd: number; requestCount: number }>();
    for (const row of monthRows) {
      if (!row.accountId) continue;
      const current = byAccount.get(row.accountId) ?? { rawCostUsd: 0, requestCount: 0 };
      current.rawCostUsd += row.rawCostUsd ?? 0;
      current.requestCount += 1;
      byAccount.set(row.accountId, current);
    }

    const rows: UsageAlertRow[] = [];
    for (const account of allAccounts) {
      const usage = byAccount.get(account.id);
      if (!usage || usage.rawCostUsd < thresholdUsd) continue;
      rows.push({
        facilityName: account.facilityName,
        ccn: account.ccn,
        rawCostUsd: usage.rawCostUsd,
        requestCount: usage.requestCount,
      });
    }
    rows.sort((a, b) => b.rawCostUsd - a.rawCostUsd);

    if (rows.length === 0) {
      return res.json({
        ok: true,
        matched: 0,
        thresholdUsd,
        sent: false,
        note: "No account is over the threshold; no email sent.",
      });
    }

    const emailResult = await deliver({
      from: getTrialEmailFrom(),
      to: [getUsageAlertRecipient()],
      subject: USAGE_ALERT_SUBJECT,
      html: usageAlertEmailHtml({
        rows,
        thresholdUsd,
        monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
        totalAccounts: allAccounts.length,
      }),
    });
    if (!emailResult.sent) throw new Error(emailResult.error);

    return res.json({ ok: true, matched: rows.length, thresholdUsd, sent: true });
  } catch (error: any) {
    return res.status(502).json({
      ok: false,
      error: error?.message ?? "Usage alert failed",
    });
  }
});

// ─── Platform stats ───────────────────────────────────────────────────────────

// POST /api/admin/cron/trial-warnings
// External schedulers authenticate with Authorization: Bearer <SESSION_SECRET>.
router.post("/cron/trial-warnings", requireCronOrSuperAdmin, async (req, res) => {
  const now = new Date();
  const { start, end } = trialWarningWindow(now);
  // This URL goes into an email we send to a CUSTOMER, so it must not be built
  // from raw request headers: Host and X-Forwarded-Host are attacker-controlled,
  // and a trial-expiry notice with the right sender and the wrong host is a
  // ready-made phishing mail. getReturnBase prefers PUBLIC_APP_URL and
  // otherwise refuses anything that is not plainly a hostname.
  let billingUrl: string;
  try {
    billingUrl = `${getReturnBase(req)}/billing`;
  } catch {
    return res.status(400).json({ error: "Unable to determine billing URL" });
  }

  try {
    const candidates = await db
      .select()
      .from(accounts)
      .where(and(
        inArray(accounts.subscriptionStatus, [APP_TRIAL_STATUS, STRIPE_TRIAL_STATUS]),
        gte(accounts.trialEndsAt, start),
        lt(accounts.trialEndsAt, end),
        isNull(accounts.trialWarningEmailSentAt),
      ));

    const users = candidates.length
      ? await db.select().from(accountUsers).where(
          inArray(accountUsers.accountId, candidates.map((account) => account.id)),
        )
      : [];
    const usersByAccount = new Map<string, typeof users>();
    for (const user of users) {
      if (!user.accountId) continue;
      const current = usersByAccount.get(user.accountId) ?? [];
      current.push(user);
      usersByAccount.set(user.accountId, current);
    }

    let sent = 0;
    let skipped = 0;
    let warningCount = 0;
    const failed: Array<{ accountId: string; error: string }> = [];

    for (const account of candidates) {
      let recipient: string | null;
      try {
        recipient = (await resolveAccountContact(usersByAccount.get(account.id) ?? [])).email;
      } catch {
        failed.push({ accountId: account.id, error: "Unable to resolve account contact from Clerk." });
        continue;
      }
      if (!recipient) {
        req.log.warn({ accountId: account.id }, "Trial reminder skipped: no email on file.");
        warningCount++;
        skipped++;
        continue;
      }
      if (!account.trialEndsAt) {
        skipped++;
        continue;
      }

      // Claim before sending so concurrent scheduler calls cannot send duplicates.
      const [claimed] = await db.update(accounts)
        .set({ trialWarningEmailSentAt: now })
        .where(and(eq(accounts.id, account.id), isNull(accounts.trialWarningEmailSentAt)))
        .returning({ id: accounts.id });
      if (!claimed) continue;

      try {
        const emailResult = await deliver({
          from: getTrialEmailFrom(),
          to: [recipient],
          subject: TRIAL_WARNING_SUBJECT,
          html: trialWarningEmailHtml({
            facilityName: account.facilityName,
            trialEndsAt: account.trialEndsAt,
            billingUrl,
          }),
        });
        if (!emailResult.sent) throw new Error(emailResult.error);
        sent++;
      } catch (error: any) {
        // Release the claim so a later scheduler run can retry a provider failure.
        await db.update(accounts)
          .set({ trialWarningEmailSentAt: null })
          .where(and(
            eq(accounts.id, account.id),
            eq(accounts.trialWarningEmailSentAt, now),
          ));
        failed.push({ accountId: account.id, error: error?.message ?? "Email provider error" });
      }
    }

    return res.status(failed.length ? 207 : 200).json({
      ok: failed.length === 0,
      matched: candidates.length,
      sent,
      skipped,
      warningCount,
      failed,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Trial warning cron failed");
    return res.status(500).json({ error: "Failed to process trial warnings" });
  }
});

// GET /api/admin/stats
router.get("/stats", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end, label } = monthBounds(req.query.month as string | undefined);

    const [allAccounts, allTokenRows] = await Promise.all([
      db.select().from(accounts),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
    ]);

    const testAccountIds = new Set(allAccounts.filter((account) => account.isTest).map((account) => account.id));
    const reportedAccounts = includeTestRows(allAccounts);
    const reportedTokenRows = allTokenRows.filter((row) => !row.accountId || !testAccountIds.has(row.accountId));
    const now = new Date();
    const active  = reportedAccounts.filter((a) => a.subscriptionStatus === "active").length;
    const trial   = reportedAccounts.filter((a) =>
      isTrialStatus(a.subscriptionStatus) && a.trialEndsAt != null && a.trialEndsAt > now
    ).length;
    const expired = reportedAccounts.filter((a) =>
      isTrialStatus(a.subscriptionStatus) && (a.trialEndsAt == null || a.trialEndsAt <= now)
    ).length;
    const cancelled = reportedAccounts.filter((a) => a.subscriptionStatus === "cancelled").length;

    const rawCost    = reportedTokenRows.reduce((s, r) => s + (r.rawCostUsd ?? 0), 0);
    const totalCharge = reportedTokenRows.reduce((s, r) => s + (r.markedUpCostUsd ?? 0), 0);

    return res.json({
      monthLabel: label,
      totalFacilities:     reportedAccounts.length,
      activeSubscriptions: active,
      trialAccounts:       trial,
      expiredTrials:       expired,
      cancelledAccounts:   cancelled,
      thisMonth: {
        requests:    reportedTokenRows.length,
        inputTokens:  reportedTokenRows.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
        outputTokens: reportedTokenRows.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
        rawCostUsd:   Math.round(rawCost * 1e6) / 1e6,
        totalChargeUsd: Math.round(totalCharge * 1e6) / 1e6,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── Clients list ─────────────────────────────────────────────────────────────

// GET /api/admin/clients?month=YYYY-MM
router.get("/clients", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end } = monthBounds(req.query.month as string | undefined);
    const includeTest = parseIncludeTest(req.query.includeTest);

    const [accountRows, allUsers, allTokenRows, lifetimeRows, affiliateRowsRaw] = await Promise.all([
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(accountUsers),
      db.select().from(tokenUsage).where(
        and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))
      ),
      db.select().from(tokenUsage),
      db.select({
        id: affiliates.id, referralCode: affiliates.referralCode, companyName: affiliates.companyName,
        status: affiliates.status, clerkUserId: affiliates.clerkUserId, contactName: affiliates.contactName,
        isTest: affiliates.isTest,
        email: affiliates.email, phone: affiliates.phone, createdAt: affiliates.createdAt,
      }).from(affiliates),
    ]);
    const allAccounts = includeTestRows(accountRows, includeTest);
    const affiliateRows = includeTestRows(affiliateRowsRaw, includeTest);

    // Alongside cost, count how many distinct facilities and provider types
    // each account generated for this month. Nothing is blocked on these —
    // they exist to answer whether a subscription is serving the one facility
    // it registered or a dozen, which the app does not otherwise record.
    // Both come from unverified client input, so read them as a signal to
    // look into, never as proof.
    type AccountUsage = {
      requests: number;
      rawCost: number;
      totalCharge: number;
      facilities: Set<string>;
      institutions: Set<string>;
    };
    const tokenByAccount = new Map<string, AccountUsage>();
    const tokenCountByAccount = new Map<string, number>();
    for (const row of allTokenRows) {
      if (!row.accountId) continue;
      const cur = tokenByAccount.get(row.accountId) ?? {
        requests: 0, rawCost: 0, totalCharge: 0,
        facilities: new Set<string>(), institutions: new Set<string>(),
      };
      cur.requests++;
      cur.rawCost    += row.rawCostUsd ?? 0;
      cur.totalCharge += row.markedUpCostUsd ?? 0;
      if (row.facilityLabel) cur.facilities.add(row.facilityLabel.toLowerCase());
      if (row.institution) cur.institutions.add(row.institution);
      tokenByAccount.set(row.accountId, cur);
      tokenCountByAccount.set(row.accountId, (tokenCountByAccount.get(row.accountId) ?? 0)
        + (row.inputTokens ?? 0) + (row.outputTokens ?? 0));
    }

    const userCountByAccount = new Map<string, number>();
    const allTokensByAccount = new Map<string, number>();
    for (const row of lifetimeRows) {
      if (!row.accountId) continue;
      allTokensByAccount.set(row.accountId, (allTokensByAccount.get(row.accountId) ?? 0)
        + (row.inputTokens ?? 0) + (row.outputTokens ?? 0));
    }
    const affiliateByCode = new Map(affiliateRows.map((row) => [row.referralCode, row.companyName]));
    const usersByAccount = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      if (!u.accountId) continue;
      userCountByAccount.set(u.accountId, (userCountByAccount.get(u.accountId) ?? 0) + 1);
      const current = usersByAccount.get(u.accountId) ?? [];
      current.push(u);
      usersByAccount.set(u.accountId, current);
    }
    const contacts = await resolveAccountContacts(usersByAccount, allAccounts.map((account) => account.id));

    const clients = allAccounts.map((a) => {
      const tok = tokenByAccount.get(a.id) ?? {
        requests: 0, rawCost: 0, totalCharge: 0,
        facilities: new Set<string>(), institutions: new Set<string>(),
      };
      return {
        id:                  a.id,
        isTest:              a.isTest,
        isClientAccount:     true,
        uniqueId:            a.id,
        facilityName:        a.facilityName,
        ccn:                 a.ccn,
        identifierType:      a.identifierType,
        facilityType:        a.facilityType,
        state:               a.state,
        subscriptionStatus:  a.subscriptionStatus,
        status:              adminClientStatus(a.subscriptionStatus, a.subscriptionCancelAtPeriodEnd, a.subscriptionCurrentPeriodEnd),
        nextBillingDate:     a.subscriptionCurrentPeriodEnd,
        trialEndsAt:         a.trialEndsAt,
        termsAcceptedAt:     a.termsAcceptedAt,
        termsVersion:        a.termsVersion,
        createdAt:           a.createdAt,
        userCount:           userCountByAccount.get(a.id) ?? 0,
        contact: contacts.get(a.id),
        referredBy: a.referralCode ? affiliateByCode.get(a.referralCode) ?? a.referralCode : null,
        totalTokens: allTokensByAccount.get(a.id) ?? 0,
        thisMonth: {
          requests:      tok.requests,
          totalTokens: tokenCountByAccount.get(a.id) ?? 0,
          rawCostUsd:    Math.round(tok.rawCost    * 1e6) / 1e6,
          totalChargeUsd: Math.round(tok.totalCharge * 1e6) / 1e6,
          // Distinct facilities and provider types this account generated for.
          // distinctFacilities stays 0 until the client starts sending a
          // facility label; distinctProviderTypes works from today, because
          // institutionValue is already on every request. An account showing
          // hospital, snf and hospice in one month is plainly serving more
          // than the facility it registered.
          distinctFacilities:    tok.facilities.size,
          distinctProviderTypes: tok.institutions.size,
          providerTypes:         [...tok.institutions].sort(),
        },
      };
    });

    return res.json(includeActiveAffiliateContacts(clients, allUsers, affiliateRowsRaw, includeTest));
  } catch {
    return res.status(500).json({ error: "Failed to load clients" });
  }
});

function adminClientStatus(status: string | null, cancelAtPeriodEnd: boolean, periodEnd: Date | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "removed") return "Removed";
  if (cancelAtPeriodEnd) {
    return `Canceled${periodEnd ? ` - ends ${new Date(periodEnd).toLocaleDateString("en-US")}` : ""}`;
  }
  if (normalized === "trial" || normalized === "trialing") return "Trial";
  if (normalized === "active") return "Active";
  if (["incomplete", "incomplete_expired", "past_due", "unpaid", "payment_pending"].includes(normalized)) return "Payment pending";
  if (["canceled", "cancelled", "expired"].includes(normalized)) return "Canceled";
  return normalized ? normalized.replace(/_/g, " ") : "Payment pending";
}

const CLIENT_CSV_HEADERS = [
  "Client name", "Type", "Test", "Client Test", "Affiliate Test", "Affiliate ID", "Unique ID",
  "Contact (name, email, phone)", "Sign-up date", "Status",
  "Next billing date", "Tokens this month", "Tokens total", "Referred by",
];
const AFFILIATE_CSV_HEADERS = [
  "Name", "Contact (email, phone, company)", "Referral code", "Status", "Current rate",
  "Next rate change date and new rate", "Restoration deadline if at 0%",
  "Clients active/canceled", "Workspace access status + end date", "Test",
];
const AFFILIATE_CLIENT_CSV_HEADERS = [
  "Affiliate", "Client name", "Test", "Client Test", "Affiliate Test", "Sign-up date", "Status",
  "Tokens this month", "Tokens total",
];

function adminClientCsvRows(clients: any[]) {
  return clients.map((client) => [
    client.facilityName, client.type, client.isTest ? "Yes" : "No",
    client.clientIsTest ? "Yes" : "No", client.affiliateIsTest ? "Yes" : "No", client.affiliateId ?? "", client.id,
    [client.contact?.name, client.contact?.email?.trim() || "No email on file", client.contact?.phone].filter(Boolean).join("; "),
    client.createdAt ? new Date(client.createdAt).toISOString().slice(0, 10) : "",
    client.status,
    client.nextBillingDate ? new Date(client.nextBillingDate).toISOString().slice(0, 10) : "",
    client.thisMonth.totalTokens, client.totalTokens, client.referredBy,
  ]);
}

// The admin console's export deliberately uses the same fields/order as its table.
router.get("/clients/download", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
    const includeTest = parseIncludeTest(req.query.includeTest);
    const [accountRows, allUsers, monthRows, lifetimeRows, affiliateRowsRaw] = await Promise.all([
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(accountUsers),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      db.select().from(tokenUsage),
      db.select({
        id: affiliates.id, referralCode: affiliates.referralCode, companyName: affiliates.companyName,
        status: affiliates.status, clerkUserId: affiliates.clerkUserId, contactName: affiliates.contactName,
        isTest: affiliates.isTest,
        email: affiliates.email, phone: affiliates.phone, createdAt: affiliates.createdAt,
      }).from(affiliates),
    ]);
    const allAccounts = includeTestRows(accountRows, includeTest);
    const affiliateRows = includeTestRows(affiliateRowsRaw, includeTest);
    const usersByAccount = new Map<string, typeof allUsers>();
    for (const user of allUsers) {
      if (!user.accountId) continue;
      const group = usersByAccount.get(user.accountId) ?? [];
      group.push(user);
      usersByAccount.set(user.accountId, group);
    }
    const contacts = await resolveAccountContacts(usersByAccount, allAccounts.map((account) => account.id));
    const monthTokens = new Map<string, number>();
    const totalTokens = new Map<string, number>();
    for (const [rows, target] of [[monthRows, monthTokens], [lifetimeRows, totalTokens]] as const) {
      for (const row of rows) {
        if (!row.accountId) continue;
        target.set(row.accountId, (target.get(row.accountId) ?? 0) + (row.inputTokens ?? 0) + (row.outputTokens ?? 0));
      }
    }
    const companyByCode = new Map(affiliateRows.map((row) => [row.referralCode, row.companyName]));
    const clients = allAccounts.map((account) => {
      return {
        id: account.id, facilityName: account.facilityName, createdAt: account.createdAt, isTest: account.isTest,
        type: "Client" as const,
        isClientAccount: true,
        status: adminClientStatus(account.subscriptionStatus, account.subscriptionCancelAtPeriodEnd, account.subscriptionCurrentPeriodEnd),
        nextBillingDate: account.subscriptionCurrentPeriodEnd,
        contact: contacts.get(account.id),
        referredBy: account.referralCode ? companyByCode.get(account.referralCode) ?? account.referralCode : null,
        thisMonth: { totalTokens: monthTokens.get(account.id) ?? 0 },
        totalTokens: totalTokens.get(account.id) ?? 0,
      };
    });
    const rows = includeActiveAffiliateContacts(clients, allUsers, affiliateRowsRaw, includeTest);
    return sendCsv(res, "admin-clients.csv", toCsv(CLIENT_CSV_HEADERS, adminClientCsvRows(rows)));
  } catch (error: any) {
    req.log.error({ err: error }, "Admin clients CSV failed");
    return res.status(500).json({ error: "Failed to download clients CSV" });
  }
});

// Affiliate reporting used by the admin dashboard; commission calculations remain
// owned by the existing affiliate ladder and are not changed here.
router.get("/affiliates", requireAnyAdmin, async (req, res) => {
  try {
    const includeTest = parseIncludeTest(req.query.includeTest);
    const now = new Date();
    const { start, end } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
    const [affiliateRowsRaw, accountRows, users, monthRows, lifetimeRows, consultantWorkspacesRaw] = await Promise.all([
      db.select().from(affiliates).orderBy(desc(affiliates.createdAt)),
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(accountUsers),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      db.select().from(tokenUsage),
      db.select({
        clerkUserId: accountUsers.clerkUserId,
        email: accountUsers.email,
        hasComplimentaryAccess: accountUsers.hasComplimentaryAccess,
        accountId: accounts.id,
        accountIsTest: accounts.isTest,
        accountIdentifierType: accounts.identifierType,
        subscriptionStatus: accounts.subscriptionStatus,
        trialEndsAt: accounts.trialEndsAt,
        subscriptionCurrentPeriodEnd: accounts.subscriptionCurrentPeriodEnd,
        subscriptionCancelAtPeriodEnd: accounts.subscriptionCancelAtPeriodEnd,
        subscriptionCanceledAt: accounts.subscriptionCanceledAt,
      }).from(accountUsers)
        .innerJoin(accounts, eq(accountUsers.accountId, accounts.id))
        .where(eq(accounts.identifierType, "consultant")),
    ]);
    const affiliateRows = includeTestRows(affiliateRowsRaw, includeTest);
    const allAccounts = includeTestRows(accountRows, includeTest);
    const consultantWorkspaces = includeTestRows(
      consultantWorkspacesRaw.map(({ accountIsTest, ...row }) => ({ ...row, isTest: accountIsTest })),
      includeTest,
    );
    const usersByAccount = new Map(users.filter((user) => user.accountId).map((user) => [user.accountId!, user]));
    const monthTokens = new Map<string, number>();
    const totalTokens = new Map<string, number>();
    for (const [rows, target] of [[monthRows, monthTokens], [lifetimeRows, totalTokens]] as const) {
      for (const row of rows) {
        if (!row.accountId) continue;
        target.set(row.accountId, (target.get(row.accountId) ?? 0) + (row.inputTokens ?? 0) + (row.outputTokens ?? 0));
      }
    }
    return res.json(affiliateRows.map((affiliate) => {
      const referred = allAccounts.filter((account) => account.referralCode === affiliate.referralCode);
      const rate = affiliateReportRateFields(affiliate, now);
      const workspaceReport = getAffiliateWorkspaceReport(
        affiliate,
        consultantWorkspaces as ConsultantWorkspaceLink[],
        now,
      );
      const clientStatuses = referred.map((account) => adminClientStatus(
        account.subscriptionStatus, account.subscriptionCancelAtPeriodEnd, account.subscriptionCurrentPeriodEnd,
      ));
      return {
        id: affiliate.id,
        isTest: affiliate.isTest,
        name: affiliate.contactName || affiliate.companyName,
        companyName: affiliate.companyName,
        contact: { email: affiliate.email, phone: affiliate.phone, company: affiliate.companyName },
        referralCode: affiliate.referralCode,
        status: rate.status,
        currentRate: affiliate.commissionRatePct,
        nextRateChangeDate: rate.nextRateChangeDate,
        newRate: rate.newRate,
        restorationDeadline: rate.restorationDeadline,
        activeClients: clientStatuses.filter((status) => status === "Active" || status === "Trial").length,
        canceledClients: clientStatuses.filter((status) => status.startsWith("Canceled") || status === "Removed").length,
        workspaceAccessStatus: workspaceReport.workspaceAccessStatus,
        workspaceAccessEndDate: workspaceReport.workspaceAccessEndDate,
        clients: referred.map((account) => {
          const user = usersByAccount.get(account.id);
          const relevant = monthTokens.get(account.id) ?? 0;
          return {
            id: account.id, name: account.facilityName, createdAt: account.createdAt,
            isTest: account.isTest,
            status: adminClientStatus(account.subscriptionStatus, account.subscriptionCancelAtPeriodEnd, account.subscriptionCurrentPeriodEnd),
            tokensThisMonth: relevant, tokensTotal: totalTokens.get(account.id) ?? 0,
            contact: { name: null, email: user?.email ?? null, phone: null },
          };
        }),
      };
    }));
  } catch (error: any) {
    req.log.error({ err: error }, "Admin affiliate report failed");
    return res.status(500).json({ error: "Failed to load affiliate report" });
  }
});

router.get("/affiliates/download", requireAnyAdmin, async (req, res) => {
  try {
    const includeTest = parseIncludeTest(req.query.includeTest);
    const { start, end } = monthBounds(typeof req.query.month === "string" ? req.query.month : undefined);
    const [affiliateRowsRaw, accountRows, monthRows, lifetimeRows, consultantWorkspacesRaw] = await Promise.all([
      db.select().from(affiliates).orderBy(desc(affiliates.createdAt)),
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      db.select().from(tokenUsage),
      db.select({
        clerkUserId: accountUsers.clerkUserId,
        email: accountUsers.email,
        hasComplimentaryAccess: accountUsers.hasComplimentaryAccess,
        accountId: accounts.id,
        accountIsTest: accounts.isTest,
        accountIdentifierType: accounts.identifierType,
        subscriptionStatus: accounts.subscriptionStatus,
        trialEndsAt: accounts.trialEndsAt,
        subscriptionCurrentPeriodEnd: accounts.subscriptionCurrentPeriodEnd,
        subscriptionCancelAtPeriodEnd: accounts.subscriptionCancelAtPeriodEnd,
        subscriptionCanceledAt: accounts.subscriptionCanceledAt,
      }).from(accountUsers)
        .innerJoin(accounts, eq(accountUsers.accountId, accounts.id))
        .where(eq(accounts.identifierType, "consultant")),
    ]);
    const affiliateRows = includeTestRows(affiliateRowsRaw, includeTest);
    const allAccounts = includeTestRows(accountRows, includeTest);
    const consultantWorkspaces = includeTestRows(
      consultantWorkspacesRaw.map(({ accountIsTest, ...row }) => ({ ...row, isTest: accountIsTest })),
      includeTest,
    );
    const sumTokens = (rows: typeof monthRows) => {
      const totals = new Map<string, number>();
      for (const row of rows) if (row.accountId) totals.set(row.accountId, (totals.get(row.accountId) ?? 0) + (row.inputTokens ?? 0) + (row.outputTokens ?? 0));
      return totals;
    };
    const monthTokens = sumTokens(monthRows);
    const totalTokens = sumTokens(lifetimeRows);
    const type = req.query.type === "clients" ? "clients" : "affiliates";
    const affiliateId = typeof req.query.affiliateId === "string" ? req.query.affiliateId : null;
    const selected = affiliateRows.filter((affiliate) => !affiliateId || affiliate.id === affiliateId);
    if (type === "clients") {
      const rows = selected.flatMap((affiliate) => allAccounts
        .filter((account) => account.referralCode === affiliate.referralCode)
        .map((account) => [
          affiliate.contactName || affiliate.companyName, account.facilityName,
          account.isTest || affiliate.isTest ? "Yes" : "No", account.isTest ? "Yes" : "No", affiliate.isTest ? "Yes" : "No",
          account.createdAt ? new Date(account.createdAt).toISOString().slice(0, 10) : "",
          adminClientStatus(account.subscriptionStatus, account.subscriptionCancelAtPeriodEnd, account.subscriptionCurrentPeriodEnd),
          monthTokens.get(account.id) ?? 0, totalTokens.get(account.id) ?? 0,
        ]));
      return sendCsv(res, "affiliate-clients.csv", toCsv(AFFILIATE_CLIENT_CSV_HEADERS, rows));
    }
    const rows = selected.map((affiliate) => {
      const referred = allAccounts.filter((account) => account.referralCode === affiliate.referralCode);
      const now = new Date();
      const rate = affiliateReportRateFields(affiliate, now);
      const workspaceReport = getAffiliateWorkspaceReport(
        affiliate,
        consultantWorkspaces as ConsultantWorkspaceLink[],
        now,
      );
      return [
        affiliate.contactName || affiliate.companyName,
        [affiliate.email, affiliate.phone, affiliate.companyName].filter(Boolean).join("; "),
        affiliate.referralCode, rate.status, `${affiliate.commissionRatePct}%`,
        rate.nextRateChangeDate && rate.newRate !== null
          ? `${new Date(rate.nextRateChangeDate).toISOString().slice(0, 10)} → ${rate.newRate}%` : "—",
        rate.restorationDeadline ? new Date(rate.restorationDeadline).toISOString().slice(0, 10) : "—",
        `${referred.filter((a) => ["Active", "Trial"].includes(adminClientStatus(a.subscriptionStatus, a.subscriptionCancelAtPeriodEnd, a.subscriptionCurrentPeriodEnd))).length} active / ${referred.filter((a) => {
          const status = adminClientStatus(a.subscriptionStatus, a.subscriptionCancelAtPeriodEnd, a.subscriptionCurrentPeriodEnd);
          return status.startsWith("Canceled") || status === "Removed";
        }).length} canceled`,
        `${workspaceReport.workspaceAccessStatus}${workspaceReport.workspaceAccessEndDate ? ` — ${new Date(workspaceReport.workspaceAccessEndDate).toISOString().slice(0, 10)}` : ""}`,
        affiliate.isTest ? "Yes" : "No",
      ];
    });
    return sendCsv(res, "admin-affiliates.csv", toCsv(AFFILIATE_CSV_HEADERS, rows));
  } catch (error: any) {
    req.log.error({ err: error }, "Admin affiliates CSV failed");
    return res.status(500).json({ error: "Failed to download affiliates CSV" });
  }
});

type AdminTestEntity = "account" | "affiliate";

async function setAdminTestFlag(req: any, res: any, entity: AdminTestEntity) {
  const id = String(req.params.id ?? "");
  const isTest = req.body?.isTest;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!TEST_FLAG_ID_PATTERN.test(id)) return res.status(400).json({ error: "A valid record ID is required." });
  if (typeof isTest !== "boolean" || reason.length < 10 || reason.length > 1000) {
    return res.status(400).json({ error: "Provide isTest (boolean) and a reason between 10 and 1000 characters." });
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      if (entity === "account") {
        const [current] = await tx.select({ isTest: accounts.isTest }).from(accounts)
          .where(eq(accounts.id, id)).for("update").limit(1);
        if (!current) return null;
        if (current.isTest !== isTest) {
          await tx.update(accounts).set({ isTest, updatedAt: new Date() }).where(eq(accounts.id, id));
          await tx.insert(adminTestFlagAudit).values({
            entityType: entity, entityId: id, actorId: req.clerkUserId,
            priorValue: current.isTest, newValue: isTest, reason,
          });
        }
        return { id, isTest, changed: current.isTest !== isTest };
      }

      const [current] = await tx.select({ isTest: affiliates.isTest }).from(affiliates)
        .where(eq(affiliates.id, id)).for("update").limit(1);
      if (!current) return null;
      if (current.isTest !== isTest) {
        await tx.update(affiliates).set({ isTest, updatedAt: new Date() }).where(eq(affiliates.id, id));
        await tx.insert(adminTestFlagAudit).values({
          entityType: entity, entityId: id, actorId: req.clerkUserId,
          priorValue: current.isTest, newValue: isTest, reason,
        });
      }
      return { id, isTest, changed: current.isTest !== isTest };
    });
    if (!outcome) return res.status(404).json({ error: `${entity === "account" ? "Client" : "Affiliate"} not found.` });
    return res.json(outcome);
  } catch (error) {
    req.log.error({ err: error, entity, id }, "Admin test flag update failed");
    return res.status(500).json({ error: "Failed to update test flag." });
  }
}

// Test labels are reversible and auditable; records and financial history are retained.
router.patch("/clients/:id/test", requireSuperAdmin, (req, res) => setAdminTestFlag(req, res, "account"));
router.patch("/affiliates/:id/test", requireSuperAdmin, (req, res) => setAdminTestFlag(req, res, "affiliate"));

// ─── Token usage by account ───────────────────────────────────────────────────

// GET /api/admin/token-usage?month=YYYY-MM
router.get("/token-usage", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end, label } = monthBounds(req.query.month as string | undefined);
    const includeTest = parseIncludeTest(req.query.includeTest);

    const [allAccounts, allTokenRows] = await Promise.all([
      db.select({ id: accounts.id, facilityName: accounts.facilityName, ccn: accounts.ccn, isTest: accounts.isTest }).from(accounts),
      db.select().from(tokenUsage).where(
        and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))
      ),
    ]);

    const reportedAccounts = includeTestRows(allAccounts, includeTest);
    const accountMap = new Map(reportedAccounts.map((a) => [a.id, a]));
    const testAccountIds = new Set(allAccounts.filter((account) => account.isTest).map((account) => account.id));
    const reportedTokenRows = includeTest
      ? allTokenRows
      : allTokenRows.filter((row) => !row.accountId || !testAccountIds.has(row.accountId));

    // Aggregate by account
    const byAccount = new Map<string, {
      facilityName: string; ccn: string;
      isTest: boolean;
      requests: number; inputTokens: number; outputTokens: number;
      rawCost: number; totalCharge: number;
    }>();

    for (const row of reportedTokenRows) {
      const aid = row.accountId ?? "__unknown__";
      const acct = accountMap.get(aid);
      const cur = byAccount.get(aid) ?? {
        facilityName: acct?.facilityName ?? "(unlinked)",
        ccn: acct?.ccn ?? "—",
        isTest: acct?.isTest ?? false,
        requests: 0, inputTokens: 0, outputTokens: 0, rawCost: 0, totalCharge: 0,
      };
      cur.requests++;
      cur.inputTokens  += row.inputTokens ?? 0;
      cur.outputTokens += row.outputTokens ?? 0;
      cur.rawCost      += row.rawCostUsd ?? 0;
      cur.totalCharge  += row.markedUpCostUsd ?? 0;
      byAccount.set(aid, cur);
    }

    const rows = [...byAccount.entries()]
      .sort((a, b) => b[1].totalCharge - a[1].totalCharge)
      .map(([, v]) => ({
        facilityName:   v.facilityName,
        isTest:         v.isTest,
        ccn:            v.ccn,
        requests:       v.requests,
        inputTokens:    v.inputTokens,
        outputTokens:   v.outputTokens,
        totalTokens:    v.inputTokens + v.outputTokens,
        rawCostUsd:     Math.round(v.rawCost    * 1e6) / 1e6,
        markupUsd:      Math.round((v.totalCharge - v.rawCost) * 1e6) / 1e6,
        totalChargeUsd: Math.round(v.totalCharge * 1e6) / 1e6,
      }));

    const totals = rows.reduce((s, r) => ({
      requests:       s.requests       + r.requests,
      inputTokens:    s.inputTokens    + r.inputTokens,
      outputTokens:   s.outputTokens   + r.outputTokens,
      totalTokens:    s.totalTokens    + r.totalTokens,
      rawCostUsd:     s.rawCostUsd     + r.rawCostUsd,
      markupUsd:      s.markupUsd      + r.markupUsd,
      totalChargeUsd: s.totalChargeUsd + r.totalChargeUsd,
    }), { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, rawCostUsd: 0, markupUsd: 0, totalChargeUsd: 0 });

    return res.json({ monthLabel: label, rows, totals });
  } catch {
    return res.status(500).json({ error: "Failed to load token usage" });
  }
});

// ─── CSV report download ──────────────────────────────────────────────────────

// GET /api/admin/reports/download?type=clients|tokens|revenue
router.get("/reports/download", requireAnyAdmin, async (req, res) => {
  const type  = (req.query.type  as string) || "clients";
  const month = req.query.month as string | undefined;
  const includeTest = parseIncludeTest(req.query.includeTest);
  const { start, end, label } = monthBounds(month);

  try {
    let csv = "";
    let filename = "";

    if (type === "clients") {
      const [accountRows, allUsers] = await Promise.all([
        db.select().from(accounts).orderBy(accounts.facilityName),
        db.select().from(accountUsers),
      ]);
      const allAccounts = includeTestRows(accountRows, includeTest);
      const userCount = new Map<string, number>();
      for (const u of allUsers) {
        if (u.accountId) userCount.set(u.accountId, (userCount.get(u.accountId) ?? 0) + 1);
      }
      const headers = ["Facility Name", "Identifier", "Identifier Type", "Type", "Test", "State", "City", "Subscription Status", "Trial End Date", "Registered", "User Count"];
      const rows = allAccounts.map((a) => [
        a.facilityName, a.ccn, a.identifierType, a.facilityType, a.isTest ? "Yes" : "No", a.state, a.city,
        a.subscriptionStatus,
        a.trialEndsAt ? new Date(a.trialEndsAt).toLocaleDateString("en-US") : "",
        a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US") : "",
        userCount.get(a.id) ?? 0,
      ]);
      csv = toCsv(headers, rows);
      filename = `cop-suite-clients-${new Date().toISOString().slice(0, 10)}.csv`;

    } else if (type === "tokens") {
      const [accountRows, tokenRows] = await Promise.all([
        db.select().from(accounts),
        db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      ]);
      const allAccounts = includeTestRows(accountRows, includeTest);
      const testAccountIds = new Set(accountRows.filter((account) => account.isTest).map((account) => account.id));
      const allTokenRows = includeTest ? tokenRows : tokenRows.filter((row) => !row.accountId || !testAccountIds.has(row.accountId));
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
      const byAccount = new Map<string, any>();
      for (const row of allTokenRows) {
        const aid = row.accountId ?? "__unknown__";
        const cur = byAccount.get(aid) ?? {
          facilityName: accountMap.get(aid)?.facilityName ?? "(unlinked)",
          ccn: accountMap.get(aid)?.ccn ?? "—",
          isTest: accountMap.get(aid)?.isTest ?? false,
          requests: 0, inputTokens: 0, outputTokens: 0, rawCost: 0, totalCharge: 0,
          facilities: new Set<string>(), institutions: new Set<string>(),
        };
        cur.requests++; cur.inputTokens += row.inputTokens ?? 0; cur.outputTokens += row.outputTokens ?? 0;
        cur.rawCost += row.rawCostUsd ?? 0; cur.totalCharge += row.markedUpCostUsd ?? 0;
        if (row.facilityLabel) cur.facilities.add(row.facilityLabel.toLowerCase());
        if (row.institution) cur.institutions.add(row.institution);
        byAccount.set(aid, cur);
      }
      const headers = ["Facility Name", "CCN", "Test", "Month", "AI Requests", "Distinct Facilities", "Provider Types", "Input Tokens", "Output Tokens", "Total Tokens", "API Cost (USD)", "50% Markup (USD)", "Total Charge (USD)"];
      const rows = [...byAccount.values()].sort((a, b) => b.totalCharge - a.totalCharge).map((v) => [
        v.facilityName, v.ccn, v.isTest ? "Yes" : "No", label, v.requests,
        v.facilities.size,
        [...v.institutions].sort().join(" / "),
        v.inputTokens, v.outputTokens,
        v.inputTokens + v.outputTokens,
        (v.rawCost).toFixed(6), (v.totalCharge - v.rawCost).toFixed(6), (v.totalCharge).toFixed(6),
      ]);
      csv = toCsv(headers, rows);
      filename = `cop-suite-token-usage-${label.replace(/ /g, "-")}.csv`;

    } else if (type === "revenue") {
      const [accountRows, tokenRows] = await Promise.all([
        db.select().from(accounts),
        db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      ]);
      const allAccounts = includeTestRows(accountRows, includeTest);
      const testAccountIds = new Set(accountRows.filter((account) => account.isTest).map((account) => account.id));
      const allTokenRows = includeTest ? tokenRows : tokenRows.filter((row) => !row.accountId || !testAccountIds.has(row.accountId));
      const tokByAcct = new Map<string, number>();
      for (const r of allTokenRows) { if (r.accountId) tokByAcct.set(r.accountId, (tokByAcct.get(r.accountId) ?? 0) + (r.markedUpCostUsd ?? 0)); }
      const headers = ["Facility Name", "CCN", "Test", "Subscription Status", "Month", "Token Charge (USD)"];
      const rows = allAccounts.map((a) => [
        a.facilityName, a.ccn, a.isTest ? "Yes" : "No", a.subscriptionStatus, label, ((tokByAcct.get(a.id) ?? 0)).toFixed(6),
      ]);
      csv = toCsv(headers, rows);
      filename = `cop-suite-revenue-${label.replace(/ /g, "-")}.csv`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch {
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

// ─── Email report ─────────────────────────────────────────────────────────────

// POST /api/admin/reports/email  { type, month, recipients: string[] }
router.post("/reports/email", requireAnyAdmin, async (req, res) => {
  const { type = "clients", month, recipients = [] } = req.body as {
    type?: string; month?: string; recipients?: string[];
  };

  if (!recipients.length) return res.status(400).json({ error: "At least one recipient email is required" });

  try {
    // Host headers are attacker-controlled, and this URL is emailed to our own
    // administrators — an unguarded one is a phishing link with our wording on
    // it. getReturnBase prefers PUBLIC_APP_URL and otherwise refuses a host
    // that is not plainly a hostname. Query values are encoded for the same
    // reason: they arrive from the request body.
    const downloadUrl =
      `${getReturnBase(req)}/api/admin/reports/download` +
      `?type=${encodeURIComponent(type)}&month=${encodeURIComponent(month ?? "")}`;
    const { start, end, label } = monthBounds(month);

    const [accountRows, tokenRows] = await Promise.all([
      db.select().from(accounts),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
    ]);

    const allAccounts = includeTestRows(accountRows);
    const testAccountIds = new Set(accountRows.filter((account) => account.isTest).map((account) => account.id));
    const allTokenRows = tokenRows.filter((row) => !row.accountId || !testAccountIds.has(row.accountId));
    const totalCharge = allTokenRows.reduce((s, r) => s + (r.markedUpCostUsd ?? 0), 0);

    const subjectMap: Record<string, string> = {
      clients: "Client List Report",
      tokens:  "Token Usage Report",
      revenue: "Revenue Summary Report",
    };

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1A2B4A;">
        <div style="background: #0B3D8E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 20px;">CMS Compliance Suite — ${subjectMap[type] ?? "Report"}</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 14px;">${label}</p>
        </div>
        <div style="background: #fff; padding: 28px 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
            <tr><td style="padding: 6px 0; color: #64748B;">Total facilities</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${allAccounts.length}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748B;">AI requests this month</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${allTokenRows.length.toLocaleString()}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748B;">Total token charge (incl. markup)</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0B3D8E;">$${totalCharge.toFixed(4)}</td></tr>
          </table>
          <p style="font-size: 13px; color: #64748B; margin: 0 0 20px; line-height: 1.6;">Download the full CSV report directly from the admin dashboard using the link below.</p>
          <a href="${downloadUrl}" style="display: inline-block; padding: 10px 20px; background: #0B3D8E; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">Download CSV Report</a>
          <p style="font-size: 11px; color: #94A3B8; margin: 20px 0 0;">This report was generated by CMS Compliance Suite. Do not reply to this email.</p>
        </div>
      </div>
    `;

    // getTrialEmailFrom(), not a hardcoded onboarding@resend.dev. That shared
    // test domain only delivers to the Resend account owner, so this report
    // could never reach anyone else -- and it failed silently when it tried.
    const emailRes = await deliver({
      from:    getTrialEmailFrom(),
      to:      recipients,
      subject: `[CMS Compliance Suite] ${subjectMap[type] ?? "Report"} — ${label}`,
      html:    htmlBody,
    });

    if (!emailRes.sent) {
      return res.status(502).json({ error: `Email provider error: ${emailRes.error}` });
    }

    return res.json({ ok: true, sent: recipients.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to send email" });
  }
});

// ─── Complimentary workspace access (platform admins only) ──────────────────

router.get("/facility-users", requireAnyAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: accountUsers.id,
      clerkUserId: accountUsers.clerkUserId,
      email: accountUsers.email,
      role: accountUsers.role,
      hasComplimentaryAccess: accountUsers.hasComplimentaryAccess,
      complimentaryAccessGrantedAt: accountUsers.complimentaryAccessGrantedAt,
      facilityName: accounts.facilityName,
    })
    .from(accountUsers)
    .leftJoin(accounts, eq(accountUsers.accountId, accounts.id))
    .orderBy(accounts.facilityName, accountUsers.email);
  return res.json(rows);
});

router.patch("/facility-users/:id/access", requireAnyAdmin, async (req, res) => {
  const id = String(req.params.id);
  const grantedBy = (req as any).clerkUserId as string;
  const { hasComplimentaryAccess } = req.body as { hasComplimentaryAccess?: boolean };

  if (typeof hasComplimentaryAccess !== "boolean") {
    return res.status(400).json({ error: "hasComplimentaryAccess (boolean) is required" });
  }

  const [updated] = await db
    .update(accountUsers)
    .set({
      hasComplimentaryAccess,
      complimentaryAccessGrantedBy: hasComplimentaryAccess ? grantedBy : null,
      complimentaryAccessGrantedAt: hasComplimentaryAccess ? new Date() : null,
    })
    .where(eq(accountUsers.id, id))
    .returning({
      id: accountUsers.id,
      clerkUserId: accountUsers.clerkUserId,
      email: accountUsers.email,
      hasComplimentaryAccess: accountUsers.hasComplimentaryAccess,
      complimentaryAccessGrantedAt: accountUsers.complimentaryAccessGrantedAt,
    });

  if (!updated) return res.status(404).json({ error: "Facility user not found" });
  return res.json(updated);
});

// ─── Admin user management (super-admin only) ─────────────────────────────────

router.get("/users", requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(adminUsers).orderBy(adminUsers.addedAt);
  return res.json(rows);
});

router.post("/users", requireSuperAdmin, async (req, res) => {
  const addedBy = (req as any).clerkUserId as string;
  const { clerkUserId, email, label } = req.body as { clerkUserId: string; email: string; label?: string };
  if (!clerkUserId || !email) return res.status(400).json({ error: "clerkUserId and email are required" });
  const trimmedId = clerkUserId.trim();
  if (!trimmedId.startsWith("user_")) return res.status(400).json({ error: "clerkUserId must start with user_" });

  const existing = await db.select().from(adminUsers).where(eq(adminUsers.clerkUserId, trimmedId)).limit(1);
  if (existing.length > 0) {
    const [updated] = await db.update(adminUsers)
      .set({ email: email.trim(), label: label?.trim() ?? null, isActive: true, addedBy })
      .where(eq(adminUsers.clerkUserId, trimmedId)).returning();
    return res.json(updated);
  }
  const [row] = await db.insert(adminUsers)
    .values({ clerkUserId: trimmedId, email: email.trim(), label: label?.trim() ?? null, isActive: true, addedBy })
    .returning();
  return res.status(201).json(row);
});

router.patch("/users/:id", requireSuperAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive (boolean) is required" });
  const [updated] = await db.update(adminUsers).set({ isActive }).where(eq(adminUsers.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Admin user not found" });
  return res.json(updated);
});

router.delete("/users/:id", requireSuperAdmin, async (req, res) => {
  const id = String(req.params.id);
  const deleted = await db.delete(adminUsers).where(eq(adminUsers.id, id)).returning();
  if (!deleted.length) return res.status(404).json({ error: "Admin user not found" });
  return res.json({ ok: true });
});

// DELETE /api/admin/users — revoke ALL DB-managed admin users at once
router.delete("/users", requireSuperAdmin, async (_req, res) => {
  const removed = await db.update(adminUsers).set({ isActive: false }).returning();
  return res.json({ revokedCount: removed.length });
});

export default router;
