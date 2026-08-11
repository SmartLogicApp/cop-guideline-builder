import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

interface CcnInfo {
  ccn: string;
  found: boolean;
  alreadyRegistered: boolean;
  facilityName: string | null;
  facilityType: string | null;
  state: string | null;
  city: string | null;
}

const S = {
  page: { minHeight: "100dvh", background: "linear-gradient(135deg, #0D5C6B 0%, #0a4a57 100%)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" } as const,
  card: { background: "#fff", borderRadius: "16px", padding: "40px", width: "100%",
    maxWidth: "520px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" } as const,
  logo: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" } as const,
  h1: { fontSize: "20px", fontWeight: 700, color: "#0D5C6B", margin: 0 } as const,
  sub: { fontSize: "14px", color: "#64748B", margin: "0 0 28px", lineHeight: 1.5 } as const,
  label: { display: "block", fontSize: "12px", fontWeight: 700, color: "#374151",
    textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "6px" } as const,
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E8F0",
    borderRadius: "8px", fontSize: "14px", outline: "none", boxSizing: "border-box" as const,
    fontFamily: "inherit", color: "#1E293B" } as const,
  row: { marginBottom: "18px" } as const,
  btn: { width: "100%", padding: "12px", background: "#0D5C6B", color: "#fff",
    border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700,
    cursor: "pointer", marginTop: "8px" } as const,
  btnSec: { width: "100%", padding: "12px", background: "transparent", color: "#0D5C6B",
    border: "1.5px solid #0D5C6B", borderRadius: "8px", fontSize: "14px", fontWeight: 700,
    cursor: "pointer", marginTop: "8px" } as const,
  info: { background: "#E8F4F5", border: "1.5px solid #B2D8DD", borderRadius: "8px",
    padding: "14px 16px", marginBottom: "18px", fontSize: "13px", color: "#0D5C6B" } as const,
  warn: { background: "#FEF3C7", border: "1.5px solid #FCD34D", borderRadius: "8px",
    padding: "14px 16px", marginBottom: "18px", fontSize: "13px", color: "#92400E" } as const,
  err: { background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: "8px",
    padding: "14px 16px", marginBottom: "18px", fontSize: "13px", color: "#991B1B" } as const,
};

export default function CcnRegistrationPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [ccnInput, setCcnInput] = useState("");
  const [ccnInfo, setCcnInfo] = useState<CcnInfo | null>(null);
  const [facilityName, setFacilityName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    const ccn = ccnInput.trim().toUpperCase();
    if (!ccn) return;
    setVerifying(true); setError(null); setCcnInfo(null);
    try {
      const info = await apiFetch<CcnInfo>(`/api/accounts/validate-ccn?ccn=${encodeURIComponent(ccn)}`);
      setCcnInfo(info);
      setFacilityName(info.facilityName ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  }

  async function handleRegister() {
    if (!ccnInfo) return;
    const name = facilityName.trim();
    if (!name) { setError("Facility name is required"); return; }

    setSubmitting(true); setError(null);
    try {
      await apiFetch("/api/accounts/register", {
        method: "POST",
        body: JSON.stringify({
          ccn:          ccnInfo.ccn,
          facilityName: name,
          facilityType: ccnInfo.facilityType,
          state:        ccnInfo.state,
          city:         ccnInfo.city,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["account", "me"] });
      setLocation("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const showManual = ccnInfo && !ccnInfo.found;
  const canSubmit  = ccnInfo && (ccnInfo.facilityName || facilityName.trim());

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <img src="/logo.svg" alt="logo" width={40} height={40} />
          <div style={S.h1}>CMS CoP Compliance Suite</div>
        </div>

        <p style={S.sub}>
          Each facility using this platform is identified by its CMS Certification Number (CCN) —
          the 6-character Medicare provider number on your certification letter.
          One subscription covers all staff at your facility.
        </p>

        {error && <div style={S.err}>{error}</div>}

        {/* CCN lookup */}
        <div style={S.row}>
          <label style={S.label}>CMS Certification Number (CCN)</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              style={{ ...S.input, flex: 1 }}
              value={ccnInput}
              onChange={(e) => { setCcnInput(e.target.value.toUpperCase()); setCcnInfo(null); }}
              placeholder="e.g. 140001"
              maxLength={6}
            />
            <button
              style={{ ...S.btn, width: "auto", padding: "10px 20px", marginTop: 0 }}
              onClick={handleVerify}
              disabled={verifying || ccnInput.trim().length < 6}
            >
              {verifying ? "Verifying…" : "Verify"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px" }}>
            Found on your Medicare/Medicaid certification letter or CMS PECOS enrollment.
          </div>
        </div>

        {/* Already registered */}
        {ccnInfo?.alreadyRegistered && (
          <div style={S.info}>
            <strong>✓ {ccnInfo.facilityName}</strong> is already registered.
            You will be added as a user to this facility account.
          </div>
        )}

        {/* Found in CMS data */}
        {ccnInfo?.found && !ccnInfo.alreadyRegistered && (
          <div style={S.info}>
            <strong>✓ Verified:</strong> {ccnInfo.facilityName}
            {ccnInfo.city && ccnInfo.state ? ` · ${ccnInfo.city}, ${ccnInfo.state}` : ""}
            {ccnInfo.facilityType ? ` · ${ccnInfo.facilityType.toUpperCase()}` : ""}
          </div>
        )}

        {/* Not found — manual entry */}
        {showManual && (
          <div style={S.warn}>
            ⚠ This CCN was not found in the CMS hospital database. You can still register —
            enter your facility name below and we will verify your enrollment manually.
          </div>
        )}

        {/* Facility name field (manual or editable) */}
        {ccnInfo && (
          <div style={S.row}>
            <label style={S.label}>Facility Name</label>
            <input
              style={S.input}
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              placeholder="Enter your facility name"
            />
          </div>
        )}

        {canSubmit && (
          <button
            style={{ ...S.btn, opacity: submitting ? 0.7 : 1 }}
            onClick={handleRegister}
            disabled={submitting}
          >
            {submitting ? "Registering…" : ccnInfo?.alreadyRegistered
              ? "Join This Facility Account" : "Register My Facility"}
          </button>
        )}

        {!ccnInfo && (
          <p style={{ fontSize: "12px", color: "#94A3B8", marginTop: "20px", textAlign: "center" }}>
            Enter your 6-character CCN above and click Verify to continue.
          </p>
        )}
      </div>
    </div>
  );
}
