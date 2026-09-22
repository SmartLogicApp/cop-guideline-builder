import { Router, type IRouter } from "express";
import { getReturnBase } from "../lib/return-base.js";
import {
  getSuperAdminIds,
  requireAnyAdmin,
  requireCronOrSuperAdmin,
  requireSuperAdmin,
} from "../lib/admin-guards.js";
import { monthBounds, toCsv } from "../lib/report-format.js";
import { deliver } from "../lib/resend-mailer.js";
import { db } from "@workspace/db";
import { adminUsers, accounts, accountUsers, tokenUsage } from "@workspace/db";
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
      if (!user.accountId || !user.email) continue;
      const current = usersByAccount.get(user.accountId) ?? [];
      current.push(user);
      usersByAccount.set(user.accountId, current);
    }

    let sent = 0;
    let skipped = 0;
    const failed: Array<{ accountId: string; error: string }> = [];

    for (const account of candidates) {
      const recipient = (usersByAccount.get(account.id) ?? [])
        .sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin"))[0]?.email;
      if (!recipient || !account.trialEndsAt) {
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

    const now = new Date();
    const active  = allAccounts.filter((a) => a.subscriptionStatus === "active").length;
    const trial   = allAccounts.filter((a) =>
      isTrialStatus(a.subscriptionStatus) && a.trialEndsAt != null && a.trialEndsAt > now
    ).length;
    const expired = allAccounts.filter((a) =>
      isTrialStatus(a.subscriptionStatus) && (a.trialEndsAt == null || a.trialEndsAt <= now)
    ).length;
    const cancelled = allAccounts.filter((a) => a.subscriptionStatus === "cancelled").length;

    const rawCost    = allTokenRows.reduce((s, r) => s + (r.rawCostUsd ?? 0), 0);
    const totalCharge = allTokenRows.reduce((s, r) => s + (r.markedUpCostUsd ?? 0), 0);

    return res.json({
      monthLabel: label,
      totalFacilities:     allAccounts.length,
      activeSubscriptions: active,
      trialAccounts:       trial,
      expiredTrials:       expired,
      cancelledAccounts:   cancelled,
      thisMonth: {
        requests:    allTokenRows.length,
        inputTokens:  allTokenRows.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
        outputTokens: allTokenRows.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
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

    const [allAccounts, allUsers, allTokenRows] = await Promise.all([
      db.select().from(accounts).orderBy(desc(accounts.createdAt)),
      db.select().from(accountUsers),
      db.select().from(tokenUsage).where(
        and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))
      ),
    ]);

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
    }

    const userCountByAccount = new Map<string, number>();
    for (const u of allUsers) {
      if (!u.accountId) continue;
      userCountByAccount.set(u.accountId, (userCountByAccount.get(u.accountId) ?? 0) + 1);
    }

    const clients = allAccounts.map((a) => {
      const tok = tokenByAccount.get(a.id) ?? {
        requests: 0, rawCost: 0, totalCharge: 0,
        facilities: new Set<string>(), institutions: new Set<string>(),
      };
      return {
        id:                  a.id,
        facilityName:        a.facilityName,
        ccn:                 a.ccn,
        identifierType:      a.identifierType,
        facilityType:        a.facilityType,
        state:               a.state,
        subscriptionStatus:  a.subscriptionStatus,
        trialEndsAt:         a.trialEndsAt,
        termsAcceptedAt:     a.termsAcceptedAt,
        termsVersion:        a.termsVersion,
        createdAt:           a.createdAt,
        userCount:           userCountByAccount.get(a.id) ?? 0,
        thisMonth: {
          requests:      tok.requests,
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

    return res.json(clients);
  } catch {
    return res.status(500).json({ error: "Failed to load clients" });
  }
});

// ─── Token usage by account ───────────────────────────────────────────────────

// GET /api/admin/token-usage?month=YYYY-MM
router.get("/token-usage", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end, label } = monthBounds(req.query.month as string | undefined);

    const [allAccounts, allTokenRows] = await Promise.all([
      db.select({ id: accounts.id, facilityName: accounts.facilityName, ccn: accounts.ccn }).from(accounts),
      db.select().from(tokenUsage).where(
        and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))
      ),
    ]);

    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    // Aggregate by account
    const byAccount = new Map<string, {
      facilityName: string; ccn: string;
      requests: number; inputTokens: number; outputTokens: number;
      rawCost: number; totalCharge: number;
    }>();

    for (const row of allTokenRows) {
      const aid = row.accountId ?? "__unknown__";
      const acct = accountMap.get(aid);
      const cur = byAccount.get(aid) ?? {
        facilityName: acct?.facilityName ?? "(unlinked)",
        ccn: acct?.ccn ?? "—",
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
  const { start, end, label } = monthBounds(month);

  try {
    let csv = "";
    let filename = "";

    if (type === "clients") {
      const [allAccounts, allUsers] = await Promise.all([
        db.select().from(accounts).orderBy(accounts.facilityName),
        db.select().from(accountUsers),
      ]);
      const userCount = new Map<string, number>();
      for (const u of allUsers) {
        if (u.accountId) userCount.set(u.accountId, (userCount.get(u.accountId) ?? 0) + 1);
      }
      const headers = ["Facility Name", "Identifier", "Identifier Type", "Type", "State", "City", "Subscription Status", "Trial End Date", "Registered", "User Count"];
      const rows = allAccounts.map((a) => [
        a.facilityName, a.ccn, a.identifierType, a.facilityType, a.state, a.city,
        a.subscriptionStatus,
        a.trialEndsAt ? new Date(a.trialEndsAt).toLocaleDateString("en-US") : "",
        a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US") : "",
        userCount.get(a.id) ?? 0,
      ]);
      csv = toCsv(headers, rows);
      filename = `cop-suite-clients-${new Date().toISOString().slice(0, 10)}.csv`;

    } else if (type === "tokens") {
      const [allAccounts, allTokenRows] = await Promise.all([
        db.select().from(accounts),
        db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      ]);
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
      const byAccount = new Map<string, any>();
      for (const row of allTokenRows) {
        const aid = row.accountId ?? "__unknown__";
        const cur = byAccount.get(aid) ?? {
          facilityName: accountMap.get(aid)?.facilityName ?? "(unlinked)",
          ccn: accountMap.get(aid)?.ccn ?? "—",
          requests: 0, inputTokens: 0, outputTokens: 0, rawCost: 0, totalCharge: 0,
          facilities: new Set<string>(), institutions: new Set<string>(),
        };
        cur.requests++; cur.inputTokens += row.inputTokens ?? 0; cur.outputTokens += row.outputTokens ?? 0;
        cur.rawCost += row.rawCostUsd ?? 0; cur.totalCharge += row.markedUpCostUsd ?? 0;
        if (row.facilityLabel) cur.facilities.add(row.facilityLabel.toLowerCase());
        if (row.institution) cur.institutions.add(row.institution);
        byAccount.set(aid, cur);
      }
      const headers = ["Facility Name", "CCN", "Month", "AI Requests", "Distinct Facilities", "Provider Types", "Input Tokens", "Output Tokens", "Total Tokens", "API Cost (USD)", "50% Markup (USD)", "Total Charge (USD)"];
      const rows = [...byAccount.values()].sort((a, b) => b.totalCharge - a.totalCharge).map((v) => [
        v.facilityName, v.ccn, label, v.requests,
        v.facilities.size,
        [...v.institutions].sort().join(" / "),
        v.inputTokens, v.outputTokens,
        v.inputTokens + v.outputTokens,
        (v.rawCost).toFixed(6), (v.totalCharge - v.rawCost).toFixed(6), (v.totalCharge).toFixed(6),
      ]);
      csv = toCsv(headers, rows);
      filename = `cop-suite-token-usage-${label.replace(/ /g, "-")}.csv`;

    } else if (type === "revenue") {
      const [allAccounts, allTokenRows] = await Promise.all([
        db.select().from(accounts),
        db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
      ]);
      const tokByAcct = new Map<string, number>();
      for (const r of allTokenRows) { if (r.accountId) tokByAcct.set(r.accountId, (tokByAcct.get(r.accountId) ?? 0) + (r.markedUpCostUsd ?? 0)); }
      const headers = ["Facility Name", "CCN", "Subscription Status", "Month", "Token Charge (USD)"];
      const rows = allAccounts.map((a) => [
        a.facilityName, a.ccn, a.subscriptionStatus, label, ((tokByAcct.get(a.id) ?? 0)).toFixed(6),
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

    const [allAccounts, allTokenRows] = await Promise.all([
      db.select().from(accounts),
      db.select().from(tokenUsage).where(and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))),
    ]);

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
