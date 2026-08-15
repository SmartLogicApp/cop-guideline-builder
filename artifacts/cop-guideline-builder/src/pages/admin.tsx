import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAccount } from "@/hooks/useAccount";
import { useLocation } from "wouter";
import { useClerk } from "@clerk/react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string; clerkUserId: string; email: string;
  label: string | null; isActive: boolean; addedBy: string; addedAt: string | null;
}

interface Stats {
  monthLabel: string;
  totalFacilities: number; activeSubscriptions: number;
  trialAccounts: number; expiredTrials: number; cancelledAccounts: number;
  thisMonth: { requests: number; inputTokens: number; outputTokens: number; rawCostUsd: number; totalChargeUsd: number };
}

interface Client {
  id: string; facilityName: string; ccn: string;
  facilityType: string | null; state: string | null;
  subscriptionStatus: string | null; trialEndsAt: string | null;
  createdAt: string | null; userCount: number;
  thisMonth: { requests: number; rawCostUsd: number; totalChargeUsd: number };
}

interface TokenRow {
  facilityName: string; ccn: string; requests: number;
  inputTokens: number; outputTokens: number; totalTokens: number;
  rawCostUsd: number; markupUsd: number; totalChargeUsd: number;
}

interface TokenUsage {
  monthLabel: string;
  rows: TokenRow[];
  totals: TokenRow;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CLR = {
  navy:   "hsl(213 58% 11%)",
  blue:   "hsl(213 76% 29%)",
  teal:   "hsl(185 65% 34%)",
  light:  "#F0F4F8",
  white:  "#ffffff",
  border: "#E2E8F0",
  muted:  "#64748B",
  faint:  "#94A3B8",
};

function pill(status: string | null) {
  const s = status ?? "unknown";
  const map: Record<string, { bg: string; color: string }> = {
    active:    { bg: "rgba(16,185,129,0.1)",  color: "#059669" },
    trial:     { bg: "rgba(59,130,246,0.1)",  color: "#2563EB" },
    expired:   { bg: "rgba(107,114,128,0.1)", color: "#4B5563" },
    cancelled: { bg: "rgba(239,68,68,0.1)",   color: "#DC2626" },
    past_due:  { bg: "rgba(245,158,11,0.1)",  color: "#D97706" },
    unknown:   { bg: "rgba(107,114,128,0.1)", color: "#4B5563" },
  };
  const cfg = map[s] ?? map.unknown;
  return (
    <span style={{
      padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
      background: cfg.bg, color: cfg.color, letterSpacing: "0.3px",
    }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
  );
}

function fmt(n: number, digits = 4) { return "$" + n.toFixed(digits); }
function fmtN(n: number) { return n.toLocaleString("en-US"); }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadReport(type: string, month: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  window.open(`${base}/api/admin/reports/download?type=${type}&month=${encodeURIComponent(month)}`, "_blank");
}

// ─── Shared table styles ──────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "10px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  color: CLR.faint, letterSpacing: "1px", textTransform: "uppercase",
  borderBottom: `2px solid ${CLR.border}`, background: "#FAFBFD",
};
const TD: React.CSSProperties = {
  padding: "11px 12px", fontSize: "13px", borderBottom: `1px solid ${CLR.border}`,
  color: CLR.navy, verticalAlign: "middle",
};
const TD_R: React.CSSProperties = { ...TD, textAlign: "right", fontFamily: "monospace" };

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────

function OverviewTab({ month }: { month: string }) {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["admin", "stats", month],
    queryFn: () => apiFetch<Stats>(`/api/admin/stats?month=${month}`),
  });

  if (isLoading) return <Loader />;
  if (!data) return null;

  const statCards = [
    { label: "Total Facilities", value: fmtN(data.totalFacilities), color: CLR.blue },
    { label: "Active Subscriptions", value: fmtN(data.activeSubscriptions), color: "#059669" },
    { label: "Trial Accounts", value: fmtN(data.trialAccounts), color: "#2563EB" },
    { label: "Expired / Cancelled", value: fmtN(data.expiredTrials + data.cancelledAccounts), color: "#DC2626" },
  ];

  const tokenCards = [
    { label: "AI Requests", value: fmtN(data.thisMonth.requests), sub: "generations" },
    { label: "Input Tokens", value: fmtN(data.thisMonth.inputTokens), sub: "prompt" },
    { label: "Output Tokens", value: fmtN(data.thisMonth.outputTokens), sub: "completion" },
    { label: "API Cost", value: fmt(data.thisMonth.rawCostUsd, 4), sub: "raw Claude rates" },
    { label: "Total Token Revenue", value: fmt(data.thisMonth.totalChargeUsd, 4), sub: "incl. 50% markup", accent: true },
  ];

  return (
    <div>
      <SectionHeader title="Platform Overview" sub={`Summary for ${data.monthLabel}`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {statCards.map((c) => (
          <div key={c.label} style={{ background: CLR.white, borderRadius: "10px", padding: "18px 20px", border: `1px solid ${CLR.border}` }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: CLR.faint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>{c.label}</div>
            <div style={{ fontSize: "30px", fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <SectionHeader title={`Token Usage — ${data.monthLabel}`} sub="Platform-wide AI consumption and revenue" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
        {tokenCards.map((c) => (
          <div key={c.label} style={{
            background: c.accent ? CLR.blue : CLR.white,
            borderRadius: "10px", padding: "16px 18px",
            border: c.accent ? "none" : `1px solid ${CLR.border}`,
            boxShadow: c.accent ? "0 4px 16px rgba(11,61,142,0.25)" : undefined,
          }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: c.accent ? "rgba(255,255,255,0.65)" : CLR.faint, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>{c.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: c.accent ? "#fff" : CLR.blue, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: "10px", color: c.accent ? "rgba(255,255,255,0.5)" : CLR.faint, marginTop: "4px" }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CLIENTS TAB ──────────────────────────────────────────────────────────────

function ClientsTab({ month }: { month: string }) {
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery<Client[]>({
    queryKey: ["admin", "clients", month],
    queryFn: () => apiFetch<Client[]>(`/api/admin/clients?month=${month}`),
  });

  const filtered = data.filter((c) =>
    c.facilityName.toLowerCase().includes(search.toLowerCase()) ||
    c.ccn.includes(search) ||
    (c.state ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <SectionHeader title="All Clients" sub={`${data.length} facilities registered`} noMargin />
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            placeholder="Search name, CCN, state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: "7px", border: `1px solid ${CLR.border}`, fontSize: "12px", width: "200px" }}
          />
          <ActionButton onClick={() => downloadReport("clients", month)}>⬇ Export CSV</ActionButton>
        </div>
      </div>

      {isLoading ? <Loader /> : (
        <div style={{ background: CLR.white, borderRadius: "10px", border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Facility", "CCN", "Type", "State", "Status", "Trial End", "Users", "Requests", "Token Charge"].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ ...TD, textAlign: "center", color: CLR.faint, padding: "32px" }}>No facilities found</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} style={{ background: "#fff" }}>
                  <td style={TD}><div style={{ fontWeight: 600 }}>{c.facilityName}</div><div style={{ fontSize: "10px", color: CLR.faint }}>{fmtDate(c.createdAt)}</div></td>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: "12px" }}>{c.ccn}</td>
                  <td style={TD}>{c.facilityType ?? "—"}</td>
                  <td style={TD}>{c.state ?? "—"}</td>
                  <td style={TD}>{pill(c.subscriptionStatus)}</td>
                  <td style={TD}>{fmtDate(c.trialEndsAt)}</td>
                  <td style={TD_R}>{fmtN(c.userCount)}</td>
                  <td style={TD_R}>{fmtN(c.thisMonth.requests)}</td>
                  <td style={{ ...TD_R, fontWeight: 700, color: CLR.blue }}>{fmt(c.thisMonth.totalChargeUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── TOKEN USAGE TAB ──────────────────────────────────────────────────────────

function TokenUsageTab({ month }: { month: string }) {
  const { data, isLoading } = useQuery<TokenUsage>({
    queryKey: ["admin", "token-usage", month],
    queryFn: () => apiFetch<TokenUsage>(`/api/admin/token-usage?month=${month}`),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <SectionHeader title="Token Usage by Facility" sub={data?.monthLabel ?? "Loading…"} noMargin />
        <ActionButton onClick={() => downloadReport("tokens", month)}>⬇ Export CSV</ActionButton>
      </div>

      {isLoading ? <Loader /> : (
        <>
          <div style={{ background: CLR.white, borderRadius: "10px", border: `1px solid ${CLR.border}`, overflow: "hidden", marginBottom: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Facility", "CCN", "Requests", "Input Tokens", "Output Tokens", "Total Tokens", "API Cost", "50% Markup", "Total Charge"].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!data?.rows?.length) && (
                  <tr><td colSpan={9} style={{ ...TD, textAlign: "center", color: CLR.faint, padding: "32px" }}>No token usage recorded for this month</td></tr>
                )}
                {data?.rows?.map((r, i) => (
                  <tr key={i}>
                    <td style={TD}><div style={{ fontWeight: 600 }}>{r.facilityName}</div></td>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: "12px" }}>{r.ccn}</td>
                    <td style={TD_R}>{fmtN(r.requests)}</td>
                    <td style={TD_R}>{fmtN(r.inputTokens)}</td>
                    <td style={TD_R}>{fmtN(r.outputTokens)}</td>
                    <td style={TD_R}>{fmtN(r.totalTokens)}</td>
                    <td style={TD_R}>{fmt(r.rawCostUsd, 6)}</td>
                    <td style={TD_R}>{fmt(r.markupUsd, 6)}</td>
                    <td style={{ ...TD_R, fontWeight: 700, color: CLR.blue }}>{fmt(r.totalChargeUsd, 6)}</td>
                  </tr>
                ))}
              </tbody>
              {data?.totals && (
                <tfoot>
                  <tr style={{ background: CLR.light }}>
                    <td style={{ ...TD, fontWeight: 800 }} colSpan={2}>PLATFORM TOTAL</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmtN(data.totals.requests)}</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmtN(data.totals.inputTokens)}</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmtN(data.totals.outputTokens)}</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmtN(data.totals.totalTokens)}</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmt(data.totals.rawCostUsd, 6)}</td>
                    <td style={{ ...TD_R, fontWeight: 800 }}>{fmt(data.totals.markupUsd, 6)}</td>
                    <td style={{ ...TD_R, fontWeight: 800, color: CLR.blue }}>{fmt(data.totals.totalChargeUsd, 6)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div style={{ fontSize: "11px", color: CLR.faint }}>
            Pricing: $3.00/M input tokens · $15.00/M output tokens · ×1.5 service markup
          </div>
        </>
      )}
    </div>
  );
}

// ─── REPORTS TAB ─────────────────────────────────────────────────────────────

function ReportsTab({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [type, setType] = useState("clients");
  const [recipients, setRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const REPORTS = [
    { id: "clients", label: "Client List", desc: "All registered facilities with subscription status and registration date" },
    { id: "tokens",  label: "Token Usage",  desc: "Per-facility AI token consumption and charges for the selected month" },
    { id: "revenue", label: "Revenue Summary", desc: "Subscription status and token revenue per facility for the selected month" },
  ];

  async function handleSendEmail() {
    const emails = recipients.split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) { setResult("Please enter at least one recipient email."); return; }
    setSending(true); setResult(null);
    try {
      await apiFetch("/api/admin/reports/email", {
        method: "POST",
        body: JSON.stringify({ type, month, recipients: emails }),
      });
      setResult(`✓ Report sent to ${emails.join(", ")}`);
    } catch (e: any) {
      setResult("✗ " + (e.message ?? "Failed to send"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <SectionHeader title="Generate Reports" sub="Download as CSV or send directly to your team's email" />

      {/* Report type cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setType(r.id)} style={{
            background: type === r.id ? CLR.blue : CLR.white,
            border: `2px solid ${type === r.id ? CLR.blue : CLR.border}`,
            borderRadius: "10px", padding: "18px 20px", cursor: "pointer", textAlign: "left",
            boxShadow: type === r.id ? "0 4px 16px rgba(11,61,142,0.2)" : undefined,
          }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: type === r.id ? "#fff" : CLR.navy, marginBottom: "6px" }}>{r.label}</div>
            <div style={{ fontSize: "12px", color: type === r.id ? "rgba(255,255,255,0.7)" : CLR.muted, lineHeight: 1.5 }}>{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Options */}
      <div style={{ background: CLR.white, borderRadius: "10px", border: `1px solid ${CLR.border}`, padding: "24px", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", alignItems: "end" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: CLR.muted, display: "block", marginBottom: "6px" }}>Report Month</label>
            <input
              type="month" value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: "9px 12px", border: `1px solid ${CLR.border}`, borderRadius: "7px", fontSize: "13px", width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: CLR.muted, display: "block", marginBottom: "6px" }}>
              Email Recipients <span style={{ fontWeight: 400, color: CLR.faint }}>(comma-separated)</span>
            </label>
            <input
              type="text" placeholder="admin@example.com, colleague@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              style={{ padding: "9px 12px", border: `1px solid ${CLR.border}`, borderRadius: "7px", fontSize: "13px", width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px", alignItems: "center" }}>
          <button
            onClick={() => downloadReport(type, month)}
            style={{ padding: "10px 20px", background: CLR.light, border: `1px solid ${CLR.border}`, borderRadius: "7px", fontSize: "13px", fontWeight: 700, color: CLR.navy, cursor: "pointer" }}
          >
            ⬇ Download CSV
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sending}
            style={{ padding: "10px 20px", background: CLR.blue, border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: 700, color: "#fff", cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.7 : 1 }}
          >
            {sending ? "Sending…" : "✉ Send to Email"}
          </button>
          {result && (
            <span style={{ fontSize: "13px", color: result.startsWith("✓") ? "#059669" : "#DC2626" }}>{result}</span>
          )}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: CLR.faint, background: "#F8FAFC", borderRadius: "7px", padding: "12px 16px", border: `1px solid ${CLR.border}` }}>
        <strong style={{ color: CLR.muted }}>Email delivery:</strong> Requires the Resend integration to be configured.
        CSV download works immediately for any report type.
      </div>
    </div>
  );
}

// ─── TEAM ACCESS TAB (existing admin user management) ────────────────────────

function TeamAccessTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ clerkUserId: "", email: "", label: "" });
  const [formError, setFormError] = useState("");

  const { data: admins = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<AdminUser[]>("/api/admin/users"),
  });

  const addMutation = useMutation({
    mutationFn: (body: { clerkUserId: string; email: string; label?: string }) =>
      apiFetch<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); setForm({ clerkUserId: "", email: "", label: "" }); setFormError(""); },
    onError: (e: any) => setFormError(e.message ?? "Failed to add admin"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setFormError("");
    const { clerkUserId, email, label } = form;
    if (!clerkUserId.trim() || !email.trim()) { setFormError("Clerk user ID and email are required"); return; }
    addMutation.mutate({ clerkUserId: clerkUserId.trim(), email: email.trim(), label: label.trim() || undefined });
  }

  const activeAdmins  = admins.filter((a) => a.isActive);
  const revokedAdmins = admins.filter((a) => !a.isActive);

  return (
    <div>
      <SectionHeader title="Admin Team Access" sub="Grant or revoke platform-level dashboard access for collaborators" />

      {/* Add form */}
      <div style={{ background: CLR.white, borderRadius: "10px", border: `1px solid ${CLR.border}`, padding: "22px", marginBottom: "20px" }}>
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "12px" }}>Grant Access to a New Admin</div>
        <p style={{ fontSize: "12px", color: CLR.muted, margin: "0 0 14px", lineHeight: 1.6 }}>
          The person must first sign up at the app. Find their Clerk user ID at{" "}
          <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ color: CLR.blue }}>dashboard.clerk.com</a>{" "}
          → Users (starts with <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: "3px" }}>user_</code>).
        </p>
        <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
          {[
            { key: "clerkUserId", label: "Clerk User ID *", placeholder: "user_abc123…" },
            { key: "email", label: "Email *", placeholder: "name@facility.org" },
            { key: "label", label: "Label / Role", placeholder: "e.g. Compliance Director" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: CLR.muted, display: "block", marginBottom: "4px" }}>{label}</label>
              <input
                style={{ width: "100%", padding: "8px 10px", border: `1px solid ${CLR.border}`, borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" as const }}
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="submit" style={{ padding: "8px 18px", background: CLR.blue, border: "none", borderRadius: "6px", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Granting…" : "Grant Access"}
            </button>
            {formError && <span style={{ fontSize: "13px", color: "#DC2626" }}>{formError}</span>}
            {addMutation.isSuccess && <span style={{ fontSize: "13px", color: "#059669" }}>✓ Access granted</span>}
          </div>
        </form>
      </div>

      {/* Admin lists */}
      {isLoading ? <Loader /> : (
        <>
          <AdminUserGroup label="Active Admins" admins={activeAdmins} onToggle={(id, a) => toggleMutation.mutate({ id, isActive: a })} onDelete={(id) => deleteMutation.mutate(id)} isPending={toggleMutation.isPending || deleteMutation.isPending} />
          {revokedAdmins.length > 0 && (
            <AdminUserGroup label="Revoked" admins={revokedAdmins} onToggle={(id, a) => toggleMutation.mutate({ id, isActive: a })} onDelete={(id) => deleteMutation.mutate(id)} isPending={toggleMutation.isPending || deleteMutation.isPending} />
          )}
        </>
      )}
    </div>
  );
}

function AdminUserGroup({ label, admins, onToggle, onDelete, isPending }: {
  label: string; admins: AdminUser[];
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void; isPending: boolean;
}) {
  return (
    <div style={{ background: CLR.white, borderRadius: "10px", border: `1px solid ${CLR.border}`, padding: "20px", marginBottom: "16px" }}>
      <div style={{ fontWeight: 700, fontSize: "13px", color: CLR.muted, marginBottom: "12px" }}>{label} ({admins.length})</div>
      {admins.length === 0 && <div style={{ fontSize: "13px", color: CLR.faint }}>None</div>}
      {admins.map((a) => <AdminUserRow key={a.id} admin={a} onToggle={onToggle} onDelete={onDelete} isPending={isPending} />)}
    </div>
  );
}

function AdminUserRow({ admin, onToggle, onDelete, isPending }: {
  admin: AdminUser; onToggle: (id: string, active: boolean) => void; onDelete: (id: string) => void; isPending: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: admin.isActive ? "#F8FAFC" : "#FEF2F2", border: `1px solid ${admin.isActive ? CLR.border : "#FECACA"}`, borderRadius: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: admin.isActive ? "#10B981" : "#EF4444", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: "160px" }}>
        <div style={{ fontWeight: 600, fontSize: "13px" }}>{admin.label || admin.email}</div>
        <div style={{ fontSize: "11px", color: CLR.faint }}>{admin.label ? admin.email + " · " : ""}{admin.clerkUserId} · Added {fmtDate(admin.addedAt)}</div>
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        {admin.isActive
          ? <SmallBtn color="#92400E" bg="#FEF3C7" border="#FDE68A" onClick={() => onToggle(admin.id, false)} disabled={isPending}>Revoke</SmallBtn>
          : <SmallBtn color="#065F46" bg="#D1FAE5" border="#A7F3D0" onClick={() => onToggle(admin.id, true)} disabled={isPending}>Restore</SmallBtn>}
        {confirmDel
          ? <>
              <SmallBtn color="#fff" bg="#DC2626" border="#DC2626" onClick={() => { onDelete(admin.id); setConfirmDel(false); }} disabled={isPending}>Confirm</SmallBtn>
              <SmallBtn color={CLR.muted} bg="none" border={CLR.border} onClick={() => setConfirmDel(false)}>Cancel</SmallBtn>
            </>
          : <SmallBtn color={CLR.faint} bg="none" border={CLR.border} onClick={() => setConfirmDel(true)}>Remove</SmallBtn>}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub, noMargin }: { title: string; sub: string; noMargin?: boolean }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : "16px" }}>
      <div style={{ fontWeight: 800, fontSize: "16px", color: CLR.navy }}>{title}</div>
      <div style={{ fontSize: "12px", color: CLR.faint, marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

function Loader() {
  return <div style={{ padding: "32px", textAlign: "center", color: CLR.faint, fontSize: "13px" }}>Loading…</div>;
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", background: CLR.white, border: `1px solid ${CLR.border}`, borderRadius: "7px", fontSize: "12px", fontWeight: 700, color: CLR.navy, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function SmallBtn({ children, onClick, disabled, color, bg, border }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  color: string; bg: string; border: string;
}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ padding: "4px 11px", borderRadius: "5px", fontSize: "12px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </button>
  );
}

// ─── MAIN ADMIN PAGE ──────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",  label: "Overview",    icon: "📊" },
  { id: "clients",   label: "Clients",     icon: "🏥" },
  { id: "tokens",    label: "Token Usage", icon: "⚡" },
  { id: "team",      label: "Team Access", icon: "👥" },
  { id: "reports",   label: "Reports",     icon: "📋" },
];

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { data: accountData, isLoading: accountLoading } = useAccount();
  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState("overview");

  // Month picker shared across tabs (defaults to current month)
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  if (accountLoading) return <div style={{ padding: "40px", textAlign: "center", color: CLR.faint }}>Loading…</div>;

  // Allow both super-admins and DB-managed admins
  if (!accountData?.isSuperAdmin && !accountData?.isAdminUser) {
    return (
      <div style={{ padding: "60px 40px", textAlign: "center", fontFamily: "var(--app-font-sans, system-ui, sans-serif)" }}>
        <div style={{ fontSize: "40px", marginBottom: "14px" }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: "18px", color: CLR.navy, marginBottom: "8px" }}>Access Denied</div>
        <p style={{ color: CLR.muted, fontSize: "14px" }}>This dashboard is only accessible to platform administrators.</p>
        <button onClick={() => setLocation("/")} style={{ marginTop: "16px", padding: "10px 24px", background: CLR.blue, border: "none", borderRadius: "7px", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Go Home</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: CLR.light, fontFamily: "var(--app-font-sans, 'Inter', system-ui, sans-serif)", color: CLR.navy }}>

      {/* ── Top nav ── */}
      <div style={{ background: CLR.navy, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "18px", padding: 0 }}>←</button>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: "15px" }}>Admin Dashboard</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase" }}>CMS CoP Compliance Suite</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: accountData?.isSuperAdmin ? "rgba(245,197,66,0.15)" : "rgba(0,188,212,0.15)", color: accountData?.isSuperAdmin ? "#F5C542" : "#00BCD4", fontWeight: 700 }}>
            {accountData?.isSuperAdmin ? "Super Admin" : "Admin"}
          </span>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            style={{ padding: "5px 14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            Sign Out
          </button>
          {/* Month picker in header for easy access */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Month:</span>
            <input
              type="month" value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: "12px" }}
            />
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${CLR.border}`, padding: "0 32px", display: "flex", gap: "0" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "14px 18px", border: "none", background: "none", cursor: "pointer",
            fontSize: "13px", fontWeight: activeTab === t.id ? 700 : 500,
            color: activeTab === t.id ? CLR.blue : CLR.muted,
            borderBottom: `2px solid ${activeTab === t.id ? CLR.blue : "transparent"}`,
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <span style={{ fontSize: "14px" }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 32px" }}>
        {activeTab === "overview" && <OverviewTab month={month} />}
        {activeTab === "clients"  && <ClientsTab  month={month} />}
        {activeTab === "tokens"   && <TokenUsageTab month={month} />}
        {activeTab === "team"     && <TeamAccessTab />}
        {activeTab === "reports"  && <ReportsTab month={month} setMonth={setMonth} />}
      </div>
    </div>
  );
}
