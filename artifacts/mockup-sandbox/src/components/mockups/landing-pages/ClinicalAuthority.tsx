// Full Landing Page — Clinical Authority
// Medical theme: ECG/pulse motif, clinical blue, shield-and-cross logo,
// CMS seal aesthetics, regulatory trust bar, facility-type grid.

export function ClinicalAuthority() {
  const facilities = [
    { code: "§482", label: "Hospital", icon: "🏥" },
    { code: "§483", label: "Skilled Nursing", icon: "🏨" },
    { code: "§484", label: "Home Health", icon: "🏠" },
    { code: "§485", label: "CAH", icon: "⚕️" },
    { code: "§486", label: "Transplant", icon: "💊" },
    { code: "§488", label: "Rehab (IRF)", icon: "🩼" },
    { code: "§491", label: "Rural Clinic", icon: "🌿" },
    { code: "§494", label: "ESRD / Dialysis", icon: "🫀" },
  ];

  const tools = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00838F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
        </svg>
      ),
      title: "Compliance Guidelines",
      desc: "Live eCFR-sourced conditions for your facility type. Refreshed from the Federal Register automatically.",
      badge: "Live eCFR",
      badgeColor: "#00838F",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B3D8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/>
        </svg>
      ),
      title: "Policy Templates",
      desc: "CMS-aligned policy documents ready to customize. Mapped to condition numbers and interpretive guidelines.",
      badge: "CMS-Mapped",
      badgeColor: "#0B3D8E",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      ),
      title: "Inspection Readiness",
      desc: "Surveyor-style self-assessment checklists. Walk the same path your CMS surveyor will take.",
      badge: "Survey-Style",
      badgeColor: "#B45309",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          <path d="M11 8v6M8 11h6"/>
        </svg>
      ),
      title: "AI Gap Scanner",
      desc: "Upload your existing policies. AI cross-references them against current CoPs and flags every gap.",
      badge: "AI-Powered",
      badgeColor: "#6D28D9",
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", background: "#F0F4F8", minHeight: "100vh", color: "#0B1929" }}>

      {/* ── NAV ── */}
      <nav style={{
        background: "#0B3D8E",
        padding: "0 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "64px",
        position: "relative", overflow: "hidden",
      }}>
        {/* ECG pulse accent line across the nav */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.08 }} viewBox="0 0 1440 64" preserveAspectRatio="none">
          <polyline points="0,32 200,32 240,8 280,56 320,32 360,32 400,32 440,14 470,50 500,32 1440,32" fill="none" stroke="white" strokeWidth="2"/>
        </svg>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="white" fillOpacity="0.12"/>
            {/* Medical cross */}
            <rect x="13" y="8" width="10" height="20" rx="2" fill="#00BCD4"/>
            <rect x="8" y="13" width="20" height="10" rx="2" fill="#00BCD4"/>
            {/* Center shield overlay */}
            <rect x="14" y="14" width="8" height="8" rx="1" fill="#0B3D8E"/>
            <path d="M16 18l1.5 1.5L20 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: "15px", letterSpacing: "-0.3px", lineHeight: 1 }}>CMS CoP Suite</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Healthcare Compliance Intelligence</div>
          </div>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", gap: "28px" }}>
          {["Guidelines", "Policy Templates", "Inspection", "Gap Scanner", "Pricing"].map(item => (
            <span key={item} style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>{item}</span>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px", cursor: "pointer" }}>Sign In</span>
          <button style={{ padding: "9px 20px", background: "#00BCD4", border: "none", borderRadius: "7px", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{
        background: "linear-gradient(160deg, #0B3D8E 0%, #0D4E9E 45%, #00616E 100%)",
        padding: "80px 80px 0",
        position: "relative", overflow: "hidden",
        minHeight: "520px",
      }}>
        {/* ECG background decoration */}
        <svg style={{ position: "absolute", bottom: 0, left: 0, width: "100%", opacity: 0.06 }} viewBox="0 0 1440 200" preserveAspectRatio="none">
          <polyline points="0,100 180,100 220,20 260,180 300,100 380,100 440,100 500,30 560,170 620,100 700,100 760,40 820,160 880,100 1440,100"
            fill="none" stroke="white" strokeWidth="3"/>
        </svg>

        {/* Regulatory citation badges */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "28px", flexWrap: "wrap" }}>
          {["CMS CoP §482–§494", "Joint Commission", "DNV NIAHO", "ISO 9001:2015", "eCFR Live"].map(b => (
            <span key={b} style={{
              padding: "4px 12px", borderRadius: "4px",
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.8)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.3px",
            }}>{b}</span>
          ))}
        </div>

        {/* Headline */}
        <div style={{ maxWidth: "720px" }}>
          <h1 style={{
            fontSize: "56px", fontWeight: 900, color: "#fff",
            lineHeight: 1.05, letterSpacing: "-2px", margin: "0 0 20px",
          }}>
            Walk into every<br />
            <span style={{ color: "#00E5FF" }}>CMS survey</span><br />
            prepared.
          </h1>
          <p style={{ fontSize: "18px", color: "rgba(255,255,255,0.72)", lineHeight: 1.7, maxWidth: "560px", margin: "0 0 36px" }}>
            AI-powered compliance guidelines, policy templates, and gap analysis — mapped to current CMS Conditions of Participation for your facility type.
          </p>
          <div style={{ display: "flex", gap: "14px", alignItems: "center", marginBottom: "48px" }}>
            <button style={{ padding: "15px 32px", background: "#00BCD4", border: "none", borderRadius: "9px", color: "#fff", fontWeight: 800, fontSize: "16px", cursor: "pointer", boxShadow: "0 8px 24px rgba(0,188,212,0.4)" }}>
              Start 30-Day Free Trial
            </button>
            <button style={{ padding: "15px 24px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "9px", color: "#fff", fontWeight: 600, fontSize: "15px", cursor: "pointer" }}>
              Watch Demo →
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            No credit card required · Per-facility pricing · Non-refundable after trial
          </div>
        </div>

        {/* Floating stat cards */}
        <div style={{ position: "absolute", right: "80px", top: "80px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            { n: "17", label: "Facility Types Covered" },
            { n: "100%", label: "Live eCFR Data" },
            { n: "< 2 min", label: "To Generate Guidelines" },
          ].map(s => (
            <div key={s.n} style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "12px", padding: "16px 24px", textAlign: "center", minWidth: "160px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#00E5FF" }}>{s.n}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── REGULATORY TRUST BAR ── */}
      <div style={{ background: "#0B1929", padding: "18px 80px", display: "flex", alignItems: "center", gap: "32px" }}>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", flexShrink: 0 }}>Regulatory Coverage</span>
        <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", flex: 1 }} />
        {[
          { abbr: "CMS", full: "Centers for Medicare & Medicaid Services" },
          { abbr: "TJC", full: "The Joint Commission" },
          { abbr: "DNV", full: "DNV NIAHO" },
          { abbr: "ISO", full: "ISO 9001:2015" },
          { abbr: "eCFR", full: "Electronic Code of Federal Regulations" },
        ].map(r => (
          <div key={r.abbr} style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: "#00BCD4" }}>{r.abbr}</div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", marginTop: "1px", maxWidth: "100px" }}>{r.full}</div>
          </div>
        ))}
      </div>

      {/* ── FACILITY TYPES ── */}
      <div style={{ padding: "56px 80px 40px", background: "#F0F4F8" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0B3D8E", textTransform: "uppercase", letterSpacing: "2px", margin: 0 }}>Supported Facility Types</h2>
          <span style={{ fontSize: "12px", color: "#94A3B8" }}>17 CMS-certified facility categories</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "10px" }}>
          {facilities.map(f => (
            <div key={f.code} style={{ background: "#fff", borderRadius: "10px", padding: "14px 12px", textAlign: "center", border: "1px solid #E2E8F0" }}>
              <div style={{ fontSize: "22px", marginBottom: "6px" }}>{f.icon}</div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0B1929", marginBottom: "2px", lineHeight: 1.2 }}>{f.label}</div>
              <div style={{ fontSize: "9px", fontFamily: "monospace", color: "#00838F", fontWeight: 700 }}>{f.code}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TOOLS ── */}
      <div style={{ padding: "0 80px 56px", background: "#F0F4F8" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <h2 style={{ fontSize: "36px", fontWeight: 800, color: "#0B1929", letterSpacing: "-1px", margin: "0 0 10px" }}>
            Four tools. One standard.
          </h2>
          <p style={{ color: "#64748B", fontSize: "16px", margin: 0 }}>Everything your compliance team needs, built on live regulatory data.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {tools.map(t => (
            <div key={t.title} style={{ background: "#fff", borderRadius: "14px", padding: "28px 28px 24px", border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(11,57,142,0.05)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {t.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#0B1929" }}>{t.title}</div>
                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700, background: `${t.badgeColor}15`, color: t.badgeColor, border: `1px solid ${t.badgeColor}30` }}>{t.badge}</span>
                  </div>
                  <p style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.65, margin: 0 }}>{t.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA FOOTER BAND ── */}
      <div style={{
        background: "linear-gradient(135deg, #0B3D8E, #00616E)",
        padding: "56px 80px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.05 }} viewBox="0 0 1440 160" preserveAspectRatio="none">
          <polyline points="0,80 160,80 200,20 240,140 280,80 360,80 420,25 480,135 540,80 1440,80" fill="none" stroke="white" strokeWidth="3"/>
        </svg>
        <div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", marginBottom: "8px" }}>
            Survey preparation starts here.
          </div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "15px" }}>30-day free trial · No credit card · All 17 facility types · Non-refundable after trial</div>
        </div>
        <button style={{ padding: "16px 36px", background: "#00BCD4", border: "none", borderRadius: "10px", color: "#fff", fontWeight: 800, fontSize: "16px", cursor: "pointer", flexShrink: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          Start Free Trial →
        </button>
      </div>

    </div>
  );
}
