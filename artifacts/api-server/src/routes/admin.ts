import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { adminUsers, accounts, accountUsers, tokenUsage } from "@workspace/db";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

// ─── Super-admin IDs (env var) ───────────────────────────────────────────────

function getSuperAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// ─── requireSuperAdmin — env-var only ────────────────────────────────────────

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!getSuperAdminIds().includes(userId))
    return res.status(403).json({ error: "Super-admin access required" });
  (req as any).clerkUserId = userId;
  next();
}

// ─── requireAnyAdmin — env-var OR active DB admin ────────────────────────────

async function requireAnyAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as any);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Super-admin check first (no DB hit)
  if (getSuperAdminIds().includes(userId)) {
    (req as any).clerkUserId = userId;
    (req as any).isSuperAdmin = true;
    return next();
  }

  // DB-managed admin check
  try {
    const [row] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.clerkUserId, userId), eq(adminUsers.isActive, true)))
      .limit(1);

    if (!row) return res.status(403).json({ error: "Admin access required" });
    (req as any).clerkUserId = userId;
    (req as any).isSuperAdmin = false;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthBounds(monthStr?: string): { start: Date; end: Date; label: string } {
  let start: Date;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    start = new Date(y, m - 1, 1);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const label = start.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

// ─── Platform stats ───────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get("/stats", requireAnyAdmin, async (req, res) => {
  try {
    const { start, end, label } = monthBounds(req.query.month as string | undefined);

    const [allAccounts, allTokenRows] = await Promise.all([
      db.select().from(accounts),
      db.select().from(tokenUsage).where(
        and(gte(tokenUsage.createdAt, start), lt(tokenUsage.createdAt, end))
      ),
    ]);

    const now = new Date();
    const active  = allAccounts.filter((a) => a.subscriptionStatus === "active").length;
    const trial   = allAccounts.filter((a) =>
      a.subscriptionStatus === "trial" && a.trialEndsAt != null && a.trialEndsAt > now
    ).length;
    const expired = allAccounts.filter((a) =>
      a.subscriptionStatus === "trial" && (a.trialEndsAt == null || a.trialEndsAt <= now)
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
    res.status(500).json({ error: "Failed to load stats" });
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

    const tokenByAccount = new Map<string, { requests: number; rawCost: number; totalCharge: number }>();
    for (const row of allTokenRows) {
      if (!row.accountId) continue;
      const cur = tokenByAccount.get(row.accountId) ?? { requests: 0, rawCost: 0, totalCharge: 0 };
      cur.requests++;
      cur.rawCost    += row.rawCostUsd ?? 0;
      cur.totalCharge += row.markedUpCostUsd ?? 0;
      tokenByAccount.set(row.accountId, cur);
    }

    const userCountByAccount = new Map<string, number>();
    for (const u of allUsers) {
      if (!u.accountId) continue;
      userCountByAccount.set(u.accountId, (userCountByAccount.get(u.accountId) ?? 0) + 1);
    }

    const clients = allAccounts.map((a) => {
      const tok = tokenByAccount.get(a.id) ?? { requests: 0, rawCost: 0, totalCharge: 0 };
      return {
        id:                  a.id,
        facilityName:        a.facilityName,
        ccn:                 a.ccn,
        facilityType:        a.facilityType,
        state:               a.state,
        subscriptionStatus:  a.subscriptionStatus,
        trialEndsAt:         a.trialEndsAt,
        createdAt:           a.createdAt,
        userCount:           userCountByAccount.get(a.id) ?? 0,
        thisMonth: {
          requests:      tok.requests,
          rawCostUsd:    Math.round(tok.rawCost    * 1e6) / 1e6,
          totalChargeUsd: Math.round(tok.totalCharge * 1e6) / 1e6,
        },
      };
    });

    return res.json(clients);
  } catch {
    res.status(500).json({ error: "Failed to load clients" });
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
    res.status(500).json({ error: "Failed to load token usage" });
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
      const headers = ["Facility Name", "CCN", "Type", "State", "City", "Subscription Status", "Trial End Date", "Registered", "User Count"];
      const rows = allAccounts.map((a) => [
        a.facilityName, a.ccn, a.facilityType, a.state, a.city,
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
        const cur = byAccount.get(aid) ?? { facilityName: accountMap.get(aid)?.facilityName ?? "(unlinked)", ccn: accountMap.get(aid)?.ccn ?? "—", requests: 0, inputTokens: 0, outputTokens: 0, rawCost: 0, totalCharge: 0 };
        cur.requests++; cur.inputTokens += row.inputTokens ?? 0; cur.outputTokens += row.outputTokens ?? 0;
        cur.rawCost += row.rawCostUsd ?? 0; cur.totalCharge += row.markedUpCostUsd ?? 0;
        byAccount.set(aid, cur);
      }
      const headers = ["Facility Name", "CCN", "Month", "AI Requests", "Input Tokens", "Output Tokens", "Total Tokens", "API Cost (USD)", "50% Markup (USD)", "Total Charge (USD)"];
      const rows = [...byAccount.values()].sort((a, b) => b.totalCharge - a.totalCharge).map((v) => [
        v.facilityName, v.ccn, label, v.requests, v.inputTokens, v.outputTokens,
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
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
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
    res.status(500).json({ error: "Failed to generate report" });
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
    const downloadUrl = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers.host}/api/admin/reports/download?type=${type}&month=${month ?? ""}`;
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
          <h1 style="color: #fff; margin: 0; font-size: 20px;">CMS CoP Suite — ${subjectMap[type] ?? "Report"}</h1>
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
          <p style="font-size: 11px; color: #94A3B8; margin: 20px 0 0;">This report was generated by CMS CoP Compliance Suite. Do not reply to this email.</p>
        </div>
      </div>
    `;

    // Send via Replit Connectors (Resend integration)
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    const connectors = new ReplitConnectors();

    const emailRes = await connectors.proxy("resend", "/emails", {
      method: "POST",
      body: JSON.stringify({
        from:    "CMS CoP Suite <onboarding@resend.dev>",
        to:      recipients,
        subject: `[CMS CoP Suite] ${subjectMap[type] ?? "Report"} — ${label}`,
        html:    htmlBody,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      return res.status(502).json({ error: `Email provider error: ${errBody}` });
    }

    return res.json({ ok: true, sent: recipients.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to send email" });
  }
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
  const { id } = req.params;
  const { isActive } = req.body as { isActive: boolean };
  if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive (boolean) is required" });
  const [updated] = await db.update(adminUsers).set({ isActive }).where(eq(adminUsers.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Admin user not found" });
  return res.json(updated);
});

router.delete("/users/:id", requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const deleted = await db.delete(adminUsers).where(eq(adminUsers.id, id)).returning();
  if (!deleted.length) return res.status(404).json({ error: "Admin user not found" });
  return res.json({ ok: true });
});

export default router;
