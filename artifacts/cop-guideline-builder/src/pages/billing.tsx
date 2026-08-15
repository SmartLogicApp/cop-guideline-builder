import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { apiFetch } from "@/lib/apiClient";
import { useAccount } from "@/hooks/useAccount";
import { useUser } from "@clerk/react";

interface SubscriptionData {
  subscription: {
    status: string;
    stripeId: string | null;
    trialEndsAt: string | null;
    isActive: boolean;
    daysLeftInTrial: number;
  } | null;
}

interface TokenUsageData {
  currentMonth: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    rawCostUsd: number;
    markupUsd: number;
    totalAdditionalChargeUsd: number;
    monthLabel: string;
  };
}

const PLANS = [
  {
    id: "individual",
    name: "Individual",
    price: "$99",
    period: "/month",
    description: "Solo compliance officer or consultant",
    features: ["1 user", "1 CCN / facility", "All 4 compliance tools", "AI gap scanning", "30-day trial"],
    priceId: null,
    highlight: false,
  },
  {
    id: "facility",
    name: "Facility",
    price: "$299",
    period: "/month",
    description: "Full compliance team at one location",
    features: ["Unlimited users", "1 CCN / facility", "All 4 compliance tools", "AI gap scanning", "Priority support", "30-day trial"],
    priceId: null,
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Multi-site health systems",
    features: ["Unlimited users", "Multiple CCNs", "All tools + custom reporting", "Dedicated support", "SSO / SAML"],
    priceId: null,
    highlight: false,
    contactSales: true,
  },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function fmtInt(n: number) {
  return n.toLocaleString("en-US");
}

const S = {
  page: { minHeight: "100dvh", background: "#F0F4F8", fontFamily: "var(--app-font-sans, 'Inter', system-ui, sans-serif)" } as const,
  header: {
    background: "hsl(213 58% 11%)", color: "#fff", padding: "20px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  } as const,
  container: { maxWidth: "900px", margin: "0 auto", padding: "40px 24px" } as const,
  h2: { fontSize: "22px", fontWeight: 800, color: "hsl(213 76% 29%)", margin: "0 0 6px", letterSpacing: "-0.3px" } as const,
  sub: { color: "#64748B", fontSize: "14px", margin: "0 0 28px" } as const,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" } as const,
  card: (highlight: boolean) => ({
    background: highlight ? "hsl(213 76% 29%)" : "#fff",
    color: highlight ? "#fff" : "#1E293B",
    border: highlight ? "none" : "1.5px solid #E2E8F0",
    borderRadius: "12px", padding: "28px 24px",
    boxShadow: highlight ? "0 8px 32px rgba(11,61,142,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
  }) as const,
  price: (highlight: boolean) => ({ fontSize: "36px", fontWeight: 800, color: highlight ? "#fff" : "hsl(213 76% 29%)" }) as const,
  period: { fontSize: "14px", fontWeight: 400, opacity: 0.7 } as const,
  features: { listStyle: "none", padding: 0, margin: "16px 0 24px", lineHeight: 2, fontSize: "13px" } as const,
  btn: (highlight: boolean) => ({
    width: "100%", padding: "12px", borderRadius: "7px", fontSize: "14px",
    fontWeight: 700, cursor: "pointer", border: "none",
    background: highlight ? "#fff" : "hsl(213 76% 29%)",
    color: highlight ? "hsl(213 76% 29%)" : "#fff",
  }) as const,
  statusCard: {
    background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: "10px",
    padding: "18px 20px", marginBottom: "24px", fontSize: "14px", color: "hsl(213 76% 29%)",
  } as const,
  success: {
    background: "#D1FAE5", border: "1.5px solid #6EE7B7", borderRadius: "10px",
    padding: "18px 20px", marginBottom: "24px", fontSize: "14px", color: "#065F46",
  } as const,
};

export default function BillingPage() {
  const [, params] = useSearchParams();
  const { data: accountData } = useAccount();
  const [loading, setLoading] = useState<string | null>(null);
  const { user } = useUser();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDeleteAccount() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteLoading(true);
    try {
      await user?.delete();
      window.location.href = "/";
    } catch (e: any) {
      alert("Could not delete account: " + e.message);
      setDeleteLoading(false);
      setDeleteConfirm(false);
    }
  }

  const { data: subData } = useQuery<SubscriptionData>({
    queryKey: ["subscription"],
    queryFn:  () => apiFetch<SubscriptionData>("/api/billing/subscription"),
    enabled:  !!accountData?.account,
  });

  const { data: usageData } = useQuery<TokenUsageData>({
    queryKey: ["token-usage"],
    queryFn:  () => apiFetch<TokenUsageData>("/api/billing/token-usage"),
    enabled:  !!accountData?.account,
    refetchInterval: 60_000, // refresh every minute
  });

  const sub = subData?.subscription;
  const usage = usageData?.currentMonth;

  const successParam = typeof params === "string"
    ? new URLSearchParams(params).get("success")
    : null;

  async function handleCheckout(priceId: string, planId: string) {
    setLoading(planId);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", {
        method: "POST", body: JSON.stringify({ priceId }),
      });
      if (url) window.location.href = url;
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/portal");
      if (url) window.location.href = url;
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span style={{ fontWeight: 800, fontSize: "15px" }}>CMS CoP Compliance Suite</span>
        </div>
        <a href="/" style={{ color: "#fff", fontSize: "13px", opacity: 0.75, textDecoration: "none" }}>
          ← Back to app
        </a>
      </div>

      <div style={S.container}>
        <h2 style={S.h2}>Subscription & Billing</h2>
        <p style={S.sub}>One subscription per CCN (facility). All staff at your location share one plan.</p>

        {successParam && (
          <div style={S.success}>
            ✓ <strong>Subscription activated!</strong> Thank you — your facility now has full access.
          </div>
        )}

        {/* Current subscription status */}
        {sub && (
          <div style={S.statusCard}>
            {sub.isActive && sub.status === "trial" && (
              <><strong>🕐 Trial Active</strong> — {sub.daysLeftInTrial} days remaining.
                Subscribe below to continue after your trial ends.</>
            )}
            {sub.status === "active" && (
              <><strong>✓ Active Subscription</strong> — Your facility has full access.{" "}
                <button onClick={handlePortal} style={{ background: "none", border: "none",
                  color: "hsl(213 76% 29%)", cursor: "pointer", fontWeight: 700, padding: 0, fontSize: "14px" }}>
                  {loading === "portal" ? "Opening…" : "Manage billing →"}
                </button>
              </>
            )}
            {sub.status === "past_due" && (
              <><strong>⚠ Payment Past Due</strong> — Please update your payment method.{" "}
                <button onClick={handlePortal} style={{ background: "none", border: "none",
                  color: "hsl(213 76% 29%)", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                  Update billing →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── TOKEN USAGE METER ────────────────────────────────────────────── */}
        <div style={{
          background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: "12px",
          padding: "24px 28px", marginBottom: "28px",
          boxShadow: "0 2px 8px rgba(11,61,142,0.05)",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(213 76% 29%)" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span style={{ fontWeight: 800, fontSize: "15px", color: "hsl(213 58% 11%)" }}>
                  AI Token Usage
                </span>
                <span style={{
                  fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px",
                  background: "rgba(11,61,142,0.08)", color: "hsl(213 76% 29%)", letterSpacing: "0.5px",
                }}>THIS MONTH</span>
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "3px" }}>
                {usage?.monthLabel ?? "Loading…"} · Billed in addition to your base plan
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "hsl(213 76% 29%)", lineHeight: 1 }}>
                ${usage ? fmt(usage.totalAdditionalChargeUsd) : "—"}
              </div>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>additional charge</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "AI Requests", value: usage ? fmtInt(usage.requestCount) : "—", sub: "generations" },
              { label: "Total Tokens", value: usage ? fmtInt(usage.totalTokens) : "—", sub: `${usage ? fmtInt(usage.inputTokens) : "—"} in · ${usage ? fmtInt(usage.outputTokens) : "—"} out` },
              { label: "API Cost", value: usage ? `$${fmt(usage.rawCostUsd)}` : "—", sub: "at Claude list rates" },
              { label: "Service Markup", value: usage ? `$${fmt(usage.markupUsd)}` : "—", sub: "+50% on API cost" },
            ].map(s => (
              <div key={s.label} style={{
                background: "#F8FAFC", borderRadius: "8px", padding: "12px 14px",
                border: "1px solid #E2E8F0",
              }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "hsl(213 58% 11%)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: "#94A3B8", marginTop: "3px" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Progress bar — tokens this month (visual only, 100% = month total) */}
          {usage && usage.totalTokens > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 600 }}>Token breakdown</span>
                <span style={{ fontSize: "11px", color: "#64748B" }}>{fmtInt(usage.totalTokens)} total tokens</span>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "#E2E8F0", overflow: "hidden", display: "flex" }}>
                {/* Input tokens */}
                <div style={{
                  height: "100%",
                  width: `${(usage.inputTokens / usage.totalTokens) * 100}%`,
                  background: "hsl(213 76% 29%)",
                  transition: "width 0.5s ease",
                }} />
                {/* Output tokens */}
                <div style={{
                  height: "100%",
                  width: `${(usage.outputTokens / usage.totalTokens) * 100}%`,
                  background: "hsl(185 65% 34%)",
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "5px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: "hsl(213 76% 29%)" }} />
                  <span style={{ fontSize: "10px", color: "#64748B" }}>Input ({fmtInt(usage.inputTokens)})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: "hsl(185 65% 34%)" }} />
                  <span style={{ fontSize: "10px", color: "#64748B" }}>Output ({fmtInt(usage.outputTokens)})</span>
                </div>
              </div>
            </div>
          )}

          {/* Pricing footnote */}
          <div style={{
            background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "7px",
            padding: "10px 14px", fontSize: "12px", color: "#0369A1", lineHeight: 1.6,
          }}>
            <strong>How token charges work:</strong> Each AI generation uses Claude tokens.
            You are charged at Claude's published list rates plus a 50% service fee.
            This month's token charge of <strong>${usage ? fmt(usage.totalAdditionalChargeUsd) : "0.00"}</strong> will
            be added to your next invoice alongside your base subscription fee.
            Pricing: $3.00/M input tokens · $15.00/M output tokens · ×1.5 service markup.
          </div>
        </div>

        {/* Subscription plans */}
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(213 58% 11%)", margin: "0 0 16px" }}>Base Subscription Plans</h3>
        <div style={S.grid}>
          {PLANS.map((plan) => (
            <div key={plan.id} style={S.card(plan.highlight)}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "1px", opacity: 0.65, marginBottom: "6px" }}>
                {plan.name}
              </div>
              <div>
                <span style={S.price(plan.highlight)}>{plan.price}</span>
                <span style={S.period}>{plan.period}</span>
              </div>
              <div style={{ fontSize: "12px", opacity: 0.65, margin: "4px 0 0" }}>
                {plan.description}
              </div>
              <ul style={S.features}>
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>

              {plan.contactSales ? (
                <a href={`mailto:HectorSamlut@outlook.com?subject=Enterprise Inquiry – CoP Suite`}
                  style={{ ...S.btn(plan.highlight), display: "block", textAlign: "center",
                    textDecoration: "none", lineHeight: "1.4" }}>
                  Contact Sales
                </a>
              ) : plan.priceId ? (
                <>
                  <button
                    style={{ ...S.btn(plan.highlight), opacity: loading ? 0.7 : 1 }}
                    disabled={!!loading}
                    onClick={() => handleCheckout(plan.priceId!, plan.id)}>
                    {loading === plan.id ? "Redirecting…" : "Subscribe"}
                  </button>
                  <p style={{ fontSize: "11px", color: plan.highlight ? "rgba(255,255,255,0.55)" : "#94A3B8",
                    textAlign: "center", margin: "8px 0 0", lineHeight: 1.4 }}>
                    Non-refundable. Full access through end of billing period.
                  </p>
                </>
              ) : (
                <button style={{ ...S.btn(plan.highlight), opacity: 0.5, cursor: "default" }} disabled>
                  Coming Soon
                </button>
              )}
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", color: "#94A3B8", fontSize: "12px", marginTop: "24px", lineHeight: 1.7 }}>
          All plans include a 30-day free trial · <strong style={{ color: "#64748B" }}>Subscription fees are non-refundable</strong><br />
          Token usage charges are billed monthly in arrears alongside your base subscription · One subscription per CCN
        </p>

        {/* Danger Zone */}
        <div style={{ marginTop: "48px", border: "1.5px solid #FECACA", borderRadius: "10px", padding: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#DC2626", marginBottom: "6px" }}>Danger Zone</div>
          <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 16px", lineHeight: 1.6 }}>
            Permanently delete your account and all associated data. This action cannot be undone.
            Your subscription will be cancelled immediately with no refund for the remaining billing period.
          </p>
          {deleteConfirm && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "7px",
              padding: "12px 14px", marginBottom: "12px", fontSize: "13px", color: "#991B1B" }}>
              ⚠ Are you sure? This will permanently delete your account and cannot be reversed. Click the button again to confirm.
            </div>
          )}
          <button
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            style={{
              padding: "10px 20px", background: deleteConfirm ? "#DC2626" : "#fff",
              color: deleteConfirm ? "#fff" : "#DC2626", border: "1.5px solid #DC2626",
              borderRadius: "7px", fontSize: "13px", fontWeight: 700,
              cursor: deleteLoading ? "not-allowed" : "pointer", opacity: deleteLoading ? 0.7 : 1,
            }}
          >
            {deleteLoading ? "Deleting…" : deleteConfirm ? "Yes, permanently delete my account" : "Delete My Account"}
          </button>
          {deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{ marginLeft: "10px", padding: "10px 16px", background: "none",
                border: "1.5px solid #CBD5E1", borderRadius: "7px", fontSize: "13px",
                fontWeight: 600, color: "#64748B", cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
