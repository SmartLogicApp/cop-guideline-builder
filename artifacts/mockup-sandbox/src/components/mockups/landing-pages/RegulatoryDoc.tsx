// Full Landing Page — Regulatory Document
// Warm navy + gold. Policy-document aesthetic: serif display, seal motifs,
// regulatory citation numbering, eCFR-style typography touches.

export function RegulatoryDoc() {
  const tools = [
    { num: "01", title: "Compliance Guidelines", cfr: "42 CFR §482–§494", desc: "AI-generated compliance frameworks cross-referenced with current CMS Conditions of Participation, updated from the eCFR automatically.", color: "#C9963A" },
    { num: "02", title: "Policy Templates", cfr: "CMS Interpretive Guidelines", desc: "Survey-ready policy documents pre-mapped to CMS condition numbers, tag numbers, and interpretive guidelines for your facility type.", color: "#C9963A" },
    { num: "03", title: "Inspection Readiness", cfr: "CMS Survey Protocol", desc: "Walk the exact survey protocol path. Checklist-based self-assessment built on CMS surveyor guidance and complaint investigation procedures.", color: "#C9963A" },
    { num: "04", title: "AI Policy Gap Scanner", cfr: "Condition-Level Analysis", desc: "Upload your policy library. AI maps each document against current conditions and flags gaps, missing references, and outdated citations.", color: "#6D28D9" },
  ];

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#F9F7F2", minHeight: "100vh", color: "#1A2B4A" }}>

      {/* ── NAV ── */}
      <nav style={{ background: "#1A2B4A", padding: "0 60px", height: "66px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Seal-style logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            {/* Outer seal ring */}
            <circle cx="20" cy="20" r="19" fill="none" stroke="#C9963A" strokeWidth="1.5"/>
            <circle cx="20" cy="20" r="16" fill="none" stroke="#C9963A" strokeWidth="0.5" strokeDasharray="2 2"/>
            {/* Inner field */}
            <circle cx="20" cy="20" r="13" fill="#243B55"/>
            {/* Caduceus-inspired: staff + wings suggestion */}
            <line x1="20" y1="10" x2="20" y2="30" stroke="#C9963A" strokeWidth="1.5"/>
            {/* Cross arm */}
            <line x1="14" y1="16" x2="26" y2="16" stroke="#C9963A" strokeWidth="1.5"/>
            {/* Small star points at top */}
            <polygon points="20,8 21.2,11.5 20,10.5 18.8,11.5" fill="#F5C842"/>
            {/* Checkmark lower half */}
            <path d="M15 22l3 3 7-6" stroke="#F5C842" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontFamily: "'Georgia', serif", color: "#F5C842", fontWeight: 700, fontSize: "15px", letterSpacing: "0.5px" }}>CMS Compliance Suite</div>
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", color: "rgba(255,255,255,0.35)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase" }}>Healthcare Regulatory Intelligence</div>
          </div>
        </div>

        <div style={{ fontFamily: "'Inter', Arial, sans-serif", display: "flex", gap: "28px" }}>
          {["Guidelines", "Policy Templates", "Inspection", "Gap Scanner"].map(item => (
            <span key={item} style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", cursor: "pointer" }}>{item}</span>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", fontFamily: "'Inter', Arial, sans-serif" }}>
          <button style={{ padding: "8px 18px", background: "none", border: "1px solid rgba(245,200,66,0.4)", borderRadius: "5px", color: "#F5C842", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Sign In</button>
          <button style={{ padding: "8px 20px", background: "#C9963A", border: "none", borderRadius: "5px", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Free Trial</button>
        </div>
      </nav>

      {/* ── REGULATORY HEADER BAND ── */}
      <div style={{ background: "#C9963A", padding: "8px 60px", display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="none" stroke="white" strokeWidth="1.2"/><path d="M7 4v3.5l2 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
        <span style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", color: "#fff", fontWeight: 600 }}>Regulatory data sourced live from the Electronic Code of Federal Regulations (eCFR.gov) · Updated continuously</span>
      </div>

      {/* ── HERO ── */}
      <div style={{
        background: "linear-gradient(180deg, #1A2B4A 0%, #243B55 100%)",
        padding: "72px 60px 0",
        position: "relative",
        overflow: "hidden",
        minHeight: "500px",
      }}>
        {/* Document grid background */}
        <div style={{
          position: "absolute", top: 0, right: 0, width: "45%", height: "100%",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(201,150,58,0.04) 0, rgba(201,150,58,0.04) 1px, transparent 1px, transparent 28px), repeating-linear-gradient(90deg, rgba(201,150,58,0.04) 0, rgba(201,150,58,0.04) 1px, transparent 1px, transparent 28px)",
          backgroundSize: "28px 28px",
        }} />

        {/* Large seal watermark */}
        <svg style={{ position: "absolute", right: "80px", top: "50px", opacity: 0.04 }} width="320" height="320" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="19" fill="none" stroke="white" strokeWidth="1.5"/>
          <circle cx="20" cy="20" r="16" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2 2"/>
          <circle cx="20" cy="20" r="13" fill="white" fillOpacity="0.2"/>
          <line x1="20" y1="10" x2="20" y2="30" stroke="white" strokeWidth="2"/>
          <line x1="14" y1="16" x2="26" y2="16" stroke="white" strokeWidth="2"/>
          <path d="M15 22l3 3 7-6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>

        <div style={{ maxWidth: "680px", position: "relative" }}>
          {/* CFR reference number style label */}
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 700, color: "#C9963A", letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: "20px" }}>
            42 C.F.R. Conditions of Participation · AI-Powered Compliance Platform
          </div>

          <h1 style={{
            fontSize: "52px", fontWeight: 700, color: "#fff",
            lineHeight: 1.1, letterSpacing: "-0.5px", margin: "0 0 24px",
          }}>
            The standard in<br />
            <span style={{ color: "#F5C842" }}>healthcare</span><br />
            compliance.
          </h1>

          <div style={{
            width: "64px", height: "3px",
            background: "linear-gradient(90deg, #C9963A, #F5C842)",
            borderRadius: "2px", marginBottom: "24px",
          }} />

          <p style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "17px", color: "rgba(255,255,255,0.68)", lineHeight: 1.75, margin: "0 0 36px", maxWidth: "540px" }}>
            CMS Conditions of Participation compliance tools — guidelines, policy templates, inspection readiness, and AI gap analysis — for every CMS-certified facility type.
          </p>

          <div style={{ display: "flex", gap: "14px", marginBottom: "24px" }}>
            <button style={{ fontFamily: "'Inter', Arial, sans-serif", padding: "14px 32px", background: "#C9963A", border: "none", borderRadius: "6px", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer" }}>
              Start 30-Day Free Trial
            </button>
            <button style={{ fontFamily: "'Inter', Arial, sans-serif", padding: "14px 24px", background: "none", border: "1px solid rgba(245,200,66,0.35)", borderRadius: "6px", color: "#F5C842", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>
              View Facility Types
            </button>
          </div>

          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", color: "rgba(255,255,255,0.3)", marginBottom: "56px" }}>
            No credit card required · Non-refundable after trial period · One subscription per CCN
          </div>
        </div>
      </div>

      {/* ── GOVERNING STANDARDS BAR ── */}
      <div style={{ background: "#F5C842", padding: "14px 60px", display: "flex", alignItems: "center", gap: "32px", overflow: "hidden" }}>
        <span style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", fontWeight: 800, color: "#1A2B4A", letterSpacing: "2px", textTransform: "uppercase", flexShrink: 0 }}>Governing Standards</span>
        <div style={{ width: "1px", height: "20px", background: "rgba(26,43,74,0.2)" }} />
        {[
          "CMS CoP (42 CFR §482–§494)",
          "CMS Interpretive Guidelines (SOM)",
          "Joint Commission Standards",
          "DNV NIAHO Accreditation",
          "ISO 9001:2015",
          "State Operations Manual",
        ].map(s => (
          <span key={s} style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 600, color: "#1A2B4A", opacity: 0.75, flexShrink: 0 }}>{s}</span>
        ))}
      </div>

      {/* ── TOOLS ── */}
      <div style={{ padding: "64px 60px 56px", background: "#F9F7F2" }}>
        <div style={{ marginBottom: "40px" }}>
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 700, color: "#C9963A", letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: "10px" }}>Platform Modules</div>
          <h2 style={{ fontSize: "36px", fontWeight: 700, color: "#1A2B4A", margin: "0 0 10px", letterSpacing: "-0.5px" }}>Four modules. Complete compliance coverage.</h2>
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "15px", color: "#6B7280" }}>Built on live federal regulatory data. No outdated PDFs. No manual updates.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {tools.map(t => (
            <div key={t.num} style={{
              background: "#fff", borderRadius: "10px", padding: "28px 28px 24px",
              border: "1px solid #E8E0D0",
              borderTop: `3px solid ${t.color}`,
              boxShadow: "0 2px 10px rgba(26,43,74,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 800, color: t.color, letterSpacing: "0.5px", minWidth: "22px", paddingTop: "2px" }}>{t.num}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "17px", color: "#1A2B4A", marginBottom: "4px" }}>{t.title}</div>
                  <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", fontWeight: 700, color: t.color, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>{t.cfr}</div>
                  <p style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "13px", color: "#6B7280", lineHeight: 1.7, margin: 0 }}>{t.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{ background: "#1A2B4A", padding: "56px 60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 700, color: "#C9963A", letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: "12px" }}>Begin Your Trial</div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "#fff", marginBottom: "8px", letterSpacing: "-0.3px" }}>Survey preparation starts here.</div>
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "14px", color: "rgba(255,255,255,0.45)" }}>30-day free trial · All 17 facility types · Per-CCN pricing · Non-refundable after trial</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
          <button style={{ fontFamily: "'Inter', Arial, sans-serif", padding: "16px 40px", background: "#C9963A", border: "none", borderRadius: "6px", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer" }}>
            Start Free Trial →
          </button>
          <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>Governed by Florida law</div>
        </div>
      </div>

    </div>
  );
}
