// App Interior — Clinical Authority
// Full shell: top nav + left sidebar (4 tools) + main Guidelines output panel.
// Medical cross logo, ECG motif, teal/navy, clinical icon language.

import { useState } from "react";

const NAV_HEIGHT = 60;
const SIDEBAR_W = 240;

function CheckIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SidebarItem({
  icon, label, badge, active, onClick,
}: {
  icon: React.ReactNode; label: string; badge?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "10px",
      width: "100%", padding: "11px 16px",
      background: active ? "rgba(0,188,212,0.12)" : "transparent",
      border: "none", borderLeft: active ? "3px solid #00BCD4" : "3px solid transparent",
      borderRadius: "0 8px 8px 0", cursor: "pointer", textAlign: "left",
      color: active ? "#00BCD4" : "rgba(255,255,255,0.55)",
      transition: "all 0.15s",
    }}>
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}>{icon}</span>
      <span style={{ fontSize: "13px", fontWeight: active ? 700 : 500, flex: 1 }}>{label}</span>
      {badge && (
        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: "rgba(0,188,212,0.2)", color: "#00BCD4" }}>{badge}</span>
      )}
    </button>
  );
}

const STANDARDS = [
  { tag: "A-0144", title: "Patient Rights — Safe Care", status: "Met", note: "Policies on file; last surveyed 4/2025" },
  { tag: "A-0145", title: "Patient Rights — Abuse/Neglect Reporting", status: "Review", note: "Reporting timelines need updating to 2024 revision" },
  { tag: "A-0166", title: "Patient Rights — Restraint Use", status: "Met", note: "Compliant; P&P revision dated 01/2026" },
  { tag: "A-0701", title: "Physical Environment — Maintenance", status: "Gap", note: "Life-safety inspection log missing Q4 2025" },
  { tag: "A-0749", title: "Infection Control Program", status: "Met", note: "Current ICAP on file; committee minutes attached" },
  { tag: "A-0800", title: "Discharge Planning — Process", status: "Review", note: "Needs physician attestation field per CMS Memo QSO-23-14" },
];

const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  Met: { bg: "rgba(16,185,129,0.1)", color: "#059669", icon: <CheckIcon size={12} color="#059669" /> },
  Review: { bg: "rgba(245,158,11,0.1)", color: "#D97706", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  Gap: { bg: "rgba(239,68,68,0.1)", color: "#DC2626", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
};

export function ClinicalInterior() {
  const [activeTab, setActiveTab] = useState("guidelines");
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", height: "1024px", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0B1929" }}>

      {/* ── TOP NAV ── */}
      <nav style={{
        height: `${NAV_HEIGHT}px`, background: "#0B3D8E", flexShrink: 0,
        display: "flex", alignItems: "center", padding: "0 20px 0 0",
        position: "relative", overflow: "hidden",
      }}>
        {/* ECG decoration */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }} viewBox="0 0 1440 60" preserveAspectRatio="none">
          <polyline points="0,30 300,30 330,8 360,52 390,30 460,30 500,12 530,48 560,30 1440,30" fill="none" stroke="white" strokeWidth="2"/>
        </svg>

        {/* Logo zone */}
        <div style={{ width: `${SIDEBAR_W}px`, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="7" fill="rgba(255,255,255,0.1)"/>
            <rect x="13" y="8" width="10" height="20" rx="2" fill="#00BCD4"/>
            <rect x="8" y="13" width="20" height="10" rx="2" fill="#00BCD4"/>
            <rect x="14" y="14" width="8" height="8" rx="1" fill="#0B3D8E"/>
            <path d="M16 18l1.5 1.5L20 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: "13px", letterSpacing: "-0.3px" }}>CMS Compliance Suite</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>v2.1.0</div>
          </div>
        </div>

        {/* Center: facility context */}
        <div style={{ flex: 1, padding: "0 20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ padding: "4px 10px", borderRadius: "4px", background: "rgba(0,188,212,0.15)", border: "1px solid rgba(0,188,212,0.3)", color: "#00BCD4", fontSize: "11px", fontWeight: 700 }}>Hospital §482</span>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px" }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>Sunrise Regional Medical Center</span>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px" }}>·</span>
          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 700 }}>● Live eCFR</span>
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
        </div>
      </nav>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ width: `${SIDEBAR_W}px`, flexShrink: 0, background: "#0F2137", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Facility selector */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Facility Type</div>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "7px", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span style={{ fontSize: "12px", color: "#fff", fontWeight: 600 }}>Hospital (§482)</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>

          {/* Nav items */}
          <div style={{ flex: 1, padding: "8px 0", overflow: "auto" }}>
            <div style={{ padding: "6px 16px 4px", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Tools</div>

            {[
              { id: "guidelines", label: "Compliance Guidelines", badge: "Live",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
              { id: "policy", label: "Policy Templates", badge: undefined,
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg> },
              { id: "inspection", label: "Inspection Readiness", badge: undefined,
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
              { id: "gap", label: "AI Gap Scanner", badge: "AI",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> },
            ].map(item => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} badge={item.badge} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}

            <div style={{ padding: "14px 16px 4px", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "1.5px", textTransform: "uppercase" }}>History</div>
            {[
              { id: "history", label: "Scan History", badge: undefined,
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            ].map(item => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} badge={item.badge} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}
          </div>

          {/* Bottom account strip */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "linear-gradient(135deg, #0B3D8E, #00838F)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>SR</span>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: "12px", color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Sunrise Regional</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>Facility Admin</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, overflow: "auto", background: "#F0F4F8" }}>

          {/* Tool header */}
          <div style={{ background: "#fff", padding: "20px 28px 0", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0B1929", margin: 0, letterSpacing: "-0.3px" }}>Compliance Guidelines</h1>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: "rgba(0,131,143,0.1)", color: "#00838F", border: "1px solid rgba(0,131,143,0.2)" }}>Live eCFR</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#94A3B8" }}>§482 · Hospital CoP</span>
                </div>
                <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>AI-generated standards mapped to current CMS Conditions of Participation. Refreshed from eCFR.gov.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button style={{ padding: "8px 16px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "7px", fontSize: "12px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>
                  Export PDF
                </button>
                <button style={{ padding: "8px 16px", background: "#0B3D8E", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  + New Scan
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: "0" }}>
              {["Patient Rights", "Governance", "Physical Env.", "QA Program", "Infection Control", "Discharge"].map((tab, i) => (
                <button key={tab} style={{
                  padding: "8px 16px", border: "none", background: "none",
                  fontSize: "12px", fontWeight: i === 0 ? 700 : 500,
                  color: i === 0 ? "#0B3D8E" : "#94A3B8",
                  borderBottom: i === 0 ? "2px solid #0B3D8E" : "2px solid transparent",
                  cursor: "pointer",
                }}>{tab}</button>
              ))}
            </div>
          </div>

          {/* Standards list */}
          <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* Summary bar */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "6px" }}>
              {[
                { label: "Met", count: 3, color: "#059669", bg: "rgba(16,185,129,0.1)" },
                { label: "Under Review", count: 2, color: "#D97706", bg: "rgba(245,158,11,0.1)" },
                { label: "Gap", count: 1, color: "#DC2626", bg: "rgba(239,68,68,0.1)" },
              ].map(s => (
                <div key={s.label} style={{ padding: "10px 16px", borderRadius: "9px", background: s.bg, border: `1px solid ${s.color}20`, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: 800, fontSize: "20px", color: s.color }}>{s.count}</span>
                  <span style={{ fontSize: "12px", color: s.color, fontWeight: 600 }}>{s.label}</span>
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ padding: "10px 16px", borderRadius: "9px", background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <span style={{ fontSize: "12px", color: "#94A3B8" }}>Search standards…</span>
              </div>
            </div>

            {STANDARDS.map((std, i) => {
              const cfg = STATUS_CONFIG[std.status];
              return (
                <div key={std.tag} onClick={() => setSelected(selected === i ? null : i)} style={{
                  background: "#fff", borderRadius: "10px", padding: "16px 20px",
                  border: selected === i ? "1px solid #0B3D8E" : "1px solid #E2E8F0",
                  boxShadow: selected === i ? "0 0 0 3px rgba(11,61,142,0.08)" : "0 1px 4px rgba(11,61,142,0.04)",
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                    {/* Status indicator */}
                    <div style={{ padding: "4px 10px", borderRadius: "20px", background: cfg.bg, display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, marginTop: "1px" }}>
                      {cfg.icon}
                      <span style={{ fontSize: "11px", fontWeight: 700, color: cfg.color }}>{std.status}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#00838F", background: "rgba(0,131,143,0.08)", padding: "1px 6px", borderRadius: "4px" }}>{std.tag}</span>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#0B1929" }}>{std.title}</span>
                      </div>
                      <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.6 }}>{std.note}</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px", transform: selected === i ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded detail */}
                  {selected === i && (
                    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F1F5F9" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "14px 16px" }}>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>CFR Citation</div>
                          <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#0B1929", fontWeight: 600 }}>42 C.F.R. §482.13</div>
                        </div>
                        <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "14px 16px" }}>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: "#94A3B8", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Last eCFR Update</div>
                          <div style={{ fontSize: "13px", color: "#0B1929", fontWeight: 600 }}>August 1, 2026</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                        <button style={{ padding: "7px 14px", background: "#0B3D8E", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, color: "#fff", cursor: "pointer" }}>Generate Policy</button>
                        <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>View in eCFR →</button>
                        <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>Add Note</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI disclosure */}
          <div style={{ margin: "0 28px 24px", padding: "12px 16px", background: "rgba(107,114,128,0.06)", borderRadius: "8px", border: "1px solid #E2E8F0", display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p style={{ fontSize: "11px", color: "#94A3B8", margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: "#64748B" }}>AI-generated content.</strong> These guidelines are produced by an AI model trained on CMS regulatory text and should be verified by a qualified compliance officer before operational use. This tool does not constitute legal advice.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
