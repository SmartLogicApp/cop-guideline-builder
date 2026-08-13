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

const PLANS = [
  {
    id: "individual",
    name: "Individual",
    price: "$99",
    period: "/month",
    description: "Solo compliance officer or consultant",
    features: ["1 user", "1 CCN / facility", "All 4 compliance tools", "AI gap scanning", "30-day trial"],
    priceId: null, // set after Stripe products are created
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

const S = {
  page: { minHeight: "100dvh", background: "#F8FAFC", fontFamily: "system-ui, sans-serif" } as const,
  header: { background: "#0D5C6B", color: "#fff", padding: "20px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between" } as const,
  container: { maxWidth: "900px", margin: "0 auto", padding: "40px 24px" } as const,
  h2: { fontSize: "24px", fontWeight: 700, color: "#0D5C6B", margin: "0 0 8px" } as const,
  sub: { color: "#64748B", fontSize: "14px", margin: "0 0 32px" } as const,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" } as const,
  card: (highlight: boolean) => ({
    background: highlight ? "#0D5C6B" : "#fff",
    color: highlight ? "#fff" : "#1E293B",
    border: highlight ? "none" : "1.5px solid #E2E8F0",
    borderRadius: "14px", padding: "28px 24px",
    boxShadow: highlight ? "0 8px 32px rgba(13,92,107,0.3)" : "0 2px 8px rgba(0,0,0,0.04)",
  }) as const,
  price: (highlight: boolean) => ({ fontSize: "36px", fontWeight: 800, color: highlight ? "#fff" : "#0D5C6B" }) as const,
  period: { fontSize: "14px", fontWeight: 400, opacity: 0.7 } as const,
  features: { listStyle: "none", padding: 0, margin: "16px 0 24px", lineHeight: 2, fontSize: "13px" } as const,
  btn: (highlight: boolean) => ({
    width: "100%", padding: "12px", borderRadius: "8px", fontSize: "14px",
    fontWeight: 700, cursor: "pointer", border: "none",
    background: highlight ? "#fff" : "#0D5C6B",
    color: highlight ? "#0D5C6B" : "#fff",
  }) as const,
  statusCard: { background: "#E8F4F5", border: "1.5px solid #B2D8DD", borderRadius: "10px",
    padding: "18px 20px", marginBottom: "32px", fontSize: "14px", color: "#0D5C6B" } as const,
  success: { background: "#D1FAE5", border: "1.5px solid #6EE7B7", borderRadius: "10px",
    padding: "18px 20px", marginBottom: "32px", fontSize: "14px", color: "#065F46" } as const,
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

  const sub = subData?.subscription;
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
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span style={{ fontWeight: 700, fontSize: "15px" }}>CMS CoP Compliance Suite</span>
        </div>
        <a href="/" style={{ color: "#fff", fontSize: "13px", opacity: 0.8, textDecoration: "none" }}>
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

        {/* Current status */}
        {sub && (
          <div style={S.statusCard}>
            {sub.isActive && sub.status === "trial" && (
              <><strong>🕐 Trial Active</strong> — {sub.daysLeftInTrial} days remaining.
                Subscribe below to continue after your trial ends.</>
            )}
            {sub.status === "active" && (
              <><strong>✓ Active Subscription</strong> — Your facility has full access.{" "}
                <button onClick={handlePortal} style={{ background: "none", border: "none",
                  color: "#0D5C6B", cursor: "pointer", fontWeight: 700, padding: 0, fontSize: "14px" }}>
                  {loading === "portal" ? "Opening…" : "Manage billing →"}
                </button>
              </>
            )}
            {sub.status === "past_due" && (
              <><strong>⚠ Payment Past Due</strong> — Please update your payment method.{" "}
                <button onClick={handlePortal} style={{ background: "none", border: "none",
                  color: "#0D5C6B", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                  Update billing →
                </button>
              </>
            )}
          </div>
        )}

        <div style={S.grid}>
          {PLANS.map((plan) => (
            <div key={plan.id} style={S.card(plan.highlight)}>
              <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.5px", opacity: 0.7, marginBottom: "6px" }}>
                {plan.name}
              </div>
              <div>
                <span style={S.price(plan.highlight)}>{plan.price}</span>
                <span style={S.period}>{plan.period}</span>
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, margin: "4px 0 0" }}>
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
                  <p style={{ fontSize: "11px", color: plan.highlight ? "rgba(255,255,255,0.6)" : "#94A3B8", textAlign: "center", margin: "8px 0 0", lineHeight: 1.4 }}>
                    Non-refundable. Full access through end of billing period.
                  </p>
                </>
              ) : (
                <button style={{ ...S.btn(plan.highlight), opacity: 0.55, cursor: "default" }} disabled>
                  Coming Soon
                </button>
              )}
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", color: "#94A3B8", fontSize: "12px", marginTop: "32px" }}>
          All plans include a 30-day free trial · Cancel anytime · <strong style={{ color: "#64748B" }}>Subscription fees are non-refundable</strong><br />
          Upon cancellation, access continues through the end of the current billing period · One subscription per CCN
        </p>

        {/* Danger Zone */}
        <div style={{ marginTop: "48px", border: "1.5px solid #FECACA", borderRadius: "10px", padding: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#DC2626", marginBottom: "6px" }}>Danger Zone</div>
          <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 16px", lineHeight: 1.6 }}>
            Permanently delete your account and all associated data. This action cannot be undone.
            Your subscription will be cancelled immediately with no refund for the remaining billing period.
          </p>
          {deleteConfirm && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "7px", padding: "12px 14px", marginBottom: "12px", fontSize: "13px", color: "#991B1B" }}>
              ⚠ Are you sure? This will permanently delete your account and cannot be reversed. Click the button again to confirm.
            </div>
          )}
          <button
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            style={{
              padding: "10px 20px", background: deleteConfirm ? "#DC2626" : "#fff",
              color: deleteConfirm ? "#fff" : "#DC2626", border: "1.5px solid #DC2626",
              borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: deleteLoading ? "not-allowed" : "pointer",
              opacity: deleteLoading ? 0.7 : 1,
            }}
          >
            {deleteLoading ? "Deleting…" : deleteConfirm ? "Yes, permanently delete my account" : "Delete My Account"}
          </button>
          {deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{ marginLeft: "10px", padding: "10px 16px", background: "none", border: "1.5px solid #CBD5E1", borderRadius: "7px", fontSize: "13px", fontWeight: 600, color: "#64748B", cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
