// App Interior — Regulatory Document
// Full shell: top nav + left sidebar + main Guidelines output panel.
// Navy/gold, Georgia serif, seal-style logo, regulatory citation numbering.

import { useState } from "react";

const SIDEBAR_W = 256;

function SidebarItem({
  num, label, active, onClick, sub,
}: {
  num: string; label: string; active?: boolean; onClick?: () => void; sub?: string;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "12px",
      width: "100%", padding: "10px 20px",
      background: active ? "rgba(201,150,58,0.12)" : "transparent",
      border: "none", borderLeft: active ? "3px solid #C9963A" : "3px solid transparent",
      cursor: "pointer", textAlign: "left",
      color: active ? "#F5C842" : "rgba(255,255,255,0.5)",
    }}>
      <span style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", fontWeight: 800, color: active ? "#C9963A" : "rgba(255,255,255,0.2)", minWidth: "18px" }}>{num}</span>
      <div>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "13px", fontWeight: active ? 700 : 500 }}>{label}</div>
        {sub && <div style={{ fontFamily: "monospace", fontSize: "9px", color: "rgba(255,255,255,0.25)", marginTop: "1px" }}>{sub}</div>}
      </div>
    </button>
  );
}

const STANDARDS = [
  { num: "§482.13", tag: "A-0144", title: "Patient Rights — Safe Care", status: "Compliant", note: "All patient rights policies on file; last surveyed April 2025." },
  { num: "§482.13(c)", tag: "A-0145", title: "Patient Rights — Abuse & Neglect Reporting", status: "Under Review", note: "Reporting timelines require update to incorporate 2024 SOM revision QSO-24-08." },
  { num: "§482.13(e)", tag: "A-0166", title: "Patient Rights — Restraint & Seclusion", status: "Compliant", note: "P&P revision dated January 2026; compliant with CMS Final Rule." },
  { num: "§482.41", tag: "A-0701", title: "Physical Environment — Maintenance Plan", status: "Deficiency", note: "Life-safety inspection log is absent for Q4 2025. Corrective action required." },
  { num: "§482.42", tag: "A-0749", title: "Infection Prevention & Control Program", status: "Compliant", note: "Current ICAP on file; infection control committee minutes attached through Q2 2026." },
  { num: "§482.43", tag: "A-0800", title: "Discharge Planning — Process Requirements", status: "Under Review", note: "Physician attestation field required per CMS Memo QSO-23-14; P&P pending update." },
];

const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string; label: string }> = {
  Compliant:     { bg: "rgba(16,185,129,0.08)",  color: "#059669", border: "rgba(16,185,129,0.2)",  label: "Compliant" },
  "Under Review":{ bg: "rgba(201,150,58,0.10)",  color: "#C9963A", border: "rgba(201,150,58,0.25)", label: "Under Review" },
  Deficiency:    { bg: "rgba(185,28,28,0.08)",   color: "#B91C1C", border: "rgba(185,28,28,0.2)",   label: "Deficiency" },
};

export function RegulatoryInterior() {
  const [activeTab, setActiveTab] = useState("guidelines");
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", height: "1024px", display: "flex", flexDirection: "column", overflow: "hidden", background: "#F9F7F2" }}>

      {/* ── TOP NAV ── */}
      <nav style={{ height: "64px", background: "#1A2B4A", flexShrink: 0, display: "flex", alignItems: "center", padding: "0 20px" }}>

        {/* Logo zone */}
        <div style={{ width: `${SIDEBAR_W}px`, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 8px", gap: "12px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="19" fill="none" stroke="#C9963A" strokeWidth="1.5"/>
            <circle cx="20" cy="20" r="16" fill="none" stroke="#C9963A" strokeWidth="0.5" strokeDasharray="2 2"/>
            <circle cx="20" cy="20" r="13" fill="#243B55"/>
            <line x1="20" y1="10" x2="20" y2="30" stroke="#C9963A" strokeWidth="1.5"/>
            <line x1="14" y1="16" x2="26" y2="16" stroke="#C9963A" strokeWidth="1.5"/>
            <polygon points="20,8 21.2,11.5 20,10.5 18.8,11.5" fill="#F5C842"/>
            <path d="M15 22l3 3 7-6" stroke="#F5C842" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ color: "#F5C842", fontWeight: 700, fontSize: "13px", letterSpacing: "0.3px" }}>CMS CoP Suite</div>
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", color: "rgba(255,255,255,0.3)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Compliance Platform</div>
          </div>
        </div>

        {/* Context breadcrumb */}
        <div style={{ flex: 1, padding: "0 24px", fontFamily: "'Inter', Arial, sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ padding: "3px 10px", borderRadius: "4px", background: "rgba(201,150,58,0.15)", border: "1px solid rgba(201,150,58,0.3)", color: "#C9963A", fontSize: "11px", fontWeight: 700 }}>42 CFR §482</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Sunrise Regional Medical Center</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Hospital CoP</span>
        </div>

        {/* eCFR live badge + account */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontFamily: "'Inter', Arial, sans-serif" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "5px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#10B981" }}>eCFR Live</span>
          </div>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
        </div>
      </nav>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ width: `${SIDEBAR_W}px`, flexShrink: 0, background: "#1A2B4A", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
          {/* Facility type picker */}
          <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Facility Type</div>
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span style={{ fontSize: "12px", color: "#fff", fontWeight: 600 }}>Hospital (§482)</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>

          {/* Module nav */}
          <div style={{ flex: 1, padding: "8px 0" }}>
            <div style={{ padding: "8px 20px 4px", fontFamily: "'Inter', Arial, sans-serif", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Modules</div>
            {[
              { id: "guidelines", num: "01", label: "Compliance Guidelines", sub: "42 CFR §482–§494" },
              { id: "policy",     num: "02", label: "Policy Templates",       sub: "CMS Interpretive Guidelines" },
              { id: "inspection", num: "03", label: "Inspection Readiness",   sub: "Survey Protocol" },
              { id: "gap",       num: "04", label: "AI Gap Scanner",          sub: "Condition-Level Analysis" },
            ].map(item => (
              <SidebarItem key={item.id} num={item.num} label={item.label} sub={item.sub} active={activeTab === item.id} onClick={() => setActiveTab(item.id)} />
            ))}

            <div style={{ padding: "12px 20px 4px", fontFamily: "'Inter', Arial, sans-serif", fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Records</div>
            <SidebarItem num="—" label="Scan History" sub="Past analyses" active={activeTab === "history"} onClick={() => setActiveTab("history")} />
          </div>

          {/* Account strip */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#C9963A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Inter', Arial, sans-serif", color: "#fff", fontSize: "11px", fontWeight: 800 }}>SR</span>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "12px", color: "rgba(255,255,255,0.85)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Sunrise Regional</div>
              <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>Facility Admin</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, overflow: "auto", background: "#F9F7F2" }}>

          {/* Tool header */}
          <div style={{ background: "#fff", padding: "22px 32px 0", borderBottom: "1px solid #E8E0D0", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", fontWeight: 700, color: "#C9963A", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>Module 01 · Compliance Guidelines</div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1A2B4A", margin: "0 0 4px", letterSpacing: "-0.3px" }}>Patient Rights — 42 CFR §482.13</h1>
                <p style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "13px", color: "#6B7280", margin: 0 }}>AI-generated standards referenced to current CMS Conditions of Participation and State Operations Manual.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", fontFamily: "'Inter', Arial, sans-serif" }}>
                <button style={{ padding: "8px 16px", background: "#fff", border: "1px solid #E8E0D0", borderRadius: "5px", fontSize: "12px", fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>Export PDF</button>
                <button style={{ padding: "8px 18px", background: "#C9963A", border: "none", borderRadius: "5px", fontSize: "12px", fontWeight: 700, color: "#fff", cursor: "pointer" }}>Generate Report →</button>
              </div>
            </div>

            {/* Section tabs */}
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", display: "flex", gap: "0" }}>
              {["Patient Rights", "Governance", "Physical Env.", "Quality Program", "Infection Control", "Discharge Planning"].map((t, i) => (
                <button key={t} style={{ padding: "8px 16px", border: "none", background: "none", fontSize: "12px", fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "#1A2B4A" : "#9CA3AF", borderBottom: i === 0 ? "2px solid #C9963A" : "2px solid transparent", cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Compliance tally */}
          <div style={{ padding: "20px 32px 12px", display: "flex", gap: "10px" }}>
            {[
              { label: "Compliant", count: 3, color: "#059669", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
              { label: "Under Review", count: 2, color: "#C9963A", bg: "rgba(201,150,58,0.10)", border: "rgba(201,150,58,0.25)" },
              { label: "Deficiency", count: 1, color: "#B91C1C", bg: "rgba(185,28,28,0.08)", border: "rgba(185,28,28,0.2)" },
            ].map(s => (
              <div key={s.label} style={{ padding: "10px 18px", borderRadius: "7px", background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Inter', Arial, sans-serif" }}>
                <span style={{ fontWeight: 800, fontSize: "22px", color: s.color }}>{s.count}</span>
                <span style={{ fontSize: "12px", color: s.color, fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", padding: "10px 16px", borderRadius: "7px", background: "#fff", border: "1px solid #E8E0D0", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Filter standards…</span>
            </div>
          </div>

          {/* Standards */}
          <div style={{ padding: "4px 32px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {STANDARDS.map((std, i) => {
              const cfg = STATUS_CONFIG[std.status];
              const isOpen = expanded === i;
              return (
                <div key={std.tag} onClick={() => setExpanded(isOpen ? null : i)} style={{
                  background: "#fff", borderRadius: "8px", padding: "18px 22px",
                  border: `1px solid ${isOpen ? "#C9963A" : "#E8E0D0"}`,
                  borderTop: `3px solid ${isOpen ? "#C9963A" : "#E8E0D0"}`,
                  cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    {/* Citation number */}
                    <div style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#C9963A", background: "rgba(201,150,58,0.08)", padding: "4px 8px", borderRadius: "4px", flexShrink: 0, marginTop: "1px", letterSpacing: "0.3px" }}>{std.num}</div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700, fontSize: "15px", color: "#1A2B4A" }}>{std.title}</span>
                        <span style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                        <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#9CA3AF" }}>{std.tag}</span>
                      </div>
                      <p style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "12px", color: "#6B7280", margin: 0, lineHeight: 1.65 }}>{std.note}</p>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9963A" strokeWidth="2" style={{ flexShrink: 0, marginTop: "4px", transform: isOpen ? "rotate(180deg)" : "none", opacity: isOpen ? 1 : 0.4, transition: "transform 0.15s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F3EDE0" }}>
                      <div style={{ fontFamily: "'Inter', Arial, sans-serif", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                        {[
                          { label: "CFR Citation", value: `42 C.F.R. ${std.num}`, mono: true },
                          { label: "SOM Tag", value: std.tag, mono: true },
                          { label: "Last Updated", value: "Aug 1, 2026", mono: false },
                        ].map(f => (
                          <div key={f.label} style={{ background: "#FAF7F2", borderRadius: "6px", padding: "12px 14px", border: "1px solid #EDE8DC" }}>
                            <div style={{ fontSize: "9px", fontWeight: 700, color: "#9CA3AF", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>{f.label}</div>
                            <div style={{ fontFamily: f.mono ? "monospace" : "'Inter', Arial, sans-serif", fontSize: "13px", color: "#1A2B4A", fontWeight: 600 }}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button style={{ padding: "7px 16px", background: "#C9963A", border: "none", borderRadius: "5px", fontSize: "12px", fontWeight: 700, color: "#fff", cursor: "pointer" }}>Generate Policy</button>
                        <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E8E0D0", borderRadius: "5px", fontSize: "12px", fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>View eCFR →</button>
                        <button style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E8E0D0", borderRadius: "5px", fontSize: "12px", fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>Add Internal Note</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI disclosure */}
          <div style={{ margin: "0 32px 28px", padding: "12px 18px", background: "rgba(107,114,128,0.05)", borderRadius: "6px", border: "1px solid #E8E0D0", fontFamily: "'Inter', Arial, sans-serif" }}>
            <p style={{ fontSize: "11px", color: "#9CA3AF", margin: 0, lineHeight: 1.7 }}>
              <strong style={{ color: "#6B7280" }}>AI-generated content.</strong> These guidelines are produced by an AI model and should be reviewed by a qualified compliance officer or legal counsel before operational use. CMS CoP Suite does not constitute legal advice and is not a substitute for professional compliance management.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
