// Direction B — Clarity: Navy + Gold
// Classic healthcare/legal authority. Deep navy base, heritage gold accent, warm surfaces.

export function Clarity() {
  const palette = [
    { name: "Midnight Navy", hex: "#1A3354", role: "Primary" },
    { name: "Deep Navy", hex: "#243B55", role: "Headings / Nav" },
    { name: "Heritage Gold", hex: "#C9963A", role: "Accent / Icons" },
    { name: "Bright Gold", hex: "#F5C842", role: "CTA Buttons" },
    { name: "Warm Cream", hex: "#F9F7F2", role: "Page Background" },
    { name: "Warm Gray", hex: "#6B7280", role: "Body Text" },
  ];

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#F9F7F2", minHeight: "100vh", padding: "48px 56px", color: "#1A3354" }}>

      {/* Header Label */}
      <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#C9963A", marginBottom: "32px", opacity: 0.8 }}>
        Direction B — Clarity
      </div>

      {/* Logo Section */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 48px", marginBottom: "28px", border: "1px solid #E8E0D0", boxShadow: "0 2px 16px rgba(26,51,84,0.06)" }}>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Logo & Wordmark</div>

        {/* Logo on light */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          {/* Classic shield mark with document */}
          <svg width="50" height="54" viewBox="0 0 50 54" fill="none">
            {/* Shield outer */}
            <path d="M25 2L46 11V30C46 42 35.5 50 25 52C14.5 50 4 42 4 30V11L25 2Z" fill="#1A3354"/>
            {/* Shield inner rim */}
            <path d="M25 7L41 15V30C41 40 32 46.5 25 48C18 46.5 9 40 9 30V15L25 7Z" fill="#243B55"/>
            {/* Gold seal circle */}
            <circle cx="25" cy="30" r="10" fill="none" stroke="#C9963A" strokeWidth="1.5"/>
            {/* Document lines */}
            <rect x="19" y="24" width="12" height="1.5" rx="0.75" fill="#F5C842"/>
            <rect x="19" y="28" width="9" height="1.5" rx="0.75" fill="rgba(255,255,255,0.5)"/>
            <rect x="19" y="32" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.5)"/>
            {/* Star/seal top */}
            <path d="M25 13L26.5 17H31L27.5 19.5L29 23.5L25 21L21 23.5L22.5 19.5L19 17H23.5L25 13Z" fill="#C9963A"/>
          </svg>
          <div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#1A3354", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
              CMS CoP<br />
              <span style={{ fontSize: "14px", fontWeight: 400, color: "#6B7280", fontFamily: "'Inter', Arial, sans-serif", letterSpacing: "3px", textTransform: "uppercase" }}>Compliance Suite</span>
            </div>
          </div>
        </div>

        {/* Logo on dark bg */}
        <div style={{ background: "#1A3354", borderRadius: "10px", padding: "24px 32px", display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <svg width="36" height="40" viewBox="0 0 50 54" fill="none">
            <path d="M25 2L46 11V30C46 42 35.5 50 25 52C14.5 50 4 42 4 30V11L25 2Z" fill="#243B55"/>
            <path d="M25 7L41 15V30C41 40 32 46.5 25 48C18 46.5 9 40 9 30V15L25 7Z" fill="#2D4A6E"/>
            <circle cx="25" cy="30" r="10" fill="none" stroke="#C9963A" strokeWidth="1.5"/>
            <rect x="19" y="24" width="12" height="1.5" rx="0.75" fill="#F5C842"/>
            <rect x="19" y="28" width="9" height="1.5" rx="0.75" fill="rgba(255,255,255,0.4)"/>
            <rect x="19" y="32" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.4)"/>
            <path d="M25 13L26.5 17H31L27.5 19.5L29 23.5L25 21L21 23.5L22.5 19.5L19 17H23.5L25 13Z" fill="#C9963A"/>
          </svg>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#F5C842", fontFamily: "'Georgia', serif", letterSpacing: "0.3px" }}>CMS CoP Compliance Suite</div>
            <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: "2px", letterSpacing: "2px", textTransform: "uppercase" }}>The Standard in Healthcare Compliance</div>
          </div>
        </div>

        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "14px", color: "#6B7280", fontStyle: "italic" }}>
          Tagline: <span style={{ color: "#1A3354", fontWeight: 600, fontStyle: "normal", fontFamily: "'Georgia', serif" }}>"The standard in healthcare compliance."</span>
        </div>
      </div>

      {/* Color Palette */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E8E0D0", boxShadow: "0 2px 16px rgba(26,51,84,0.06)" }}>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>Color Palette</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {palette.map((c) => (
            <div key={c.hex} style={{ flex: "1", minWidth: "120px" }}>
              <div style={{ height: "64px", borderRadius: "10px", background: c.hex, marginBottom: "8px", border: c.hex === "#F9F7F2" ? "1px solid #CBD5E1" : "none" }} />
              <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>{c.name}</div>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#9CA3AF" }}>{c.hex}</div>
              <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "10px", color: "#CBD5E1", marginTop: "1px" }}>{c.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E8E0D0", boxShadow: "0 2px 16px rgba(26,51,84,0.06)" }}>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Typography — Georgia (Display) + Inter (Body)</div>
        <div style={{ fontSize: "40px", fontWeight: 700, color: "#1A3354", letterSpacing: "-0.5px", lineHeight: 1.15, marginBottom: "8px" }}>The Trusted Standard<br />in Healthcare Compliance</div>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "20px", fontWeight: 400, color: "#C9963A", marginBottom: "10px", letterSpacing: "0.2px" }}>Survey-ready. Professionally documented.</div>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "15px", color: "#6B7280", lineHeight: 1.75, maxWidth: "560px", marginBottom: "16px" }}>
          Trusted by compliance officers at hospitals, SNFs, and home health agencies. Generate guidelines, scan policy gaps, and prepare for surveys — in minutes.
        </div>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", display: "flex", gap: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#1A3354", textTransform: "uppercase", letterSpacing: "1.5px" }}>Label Text</span>
          <span style={{ fontSize: "11px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "1.5px" }}>Muted</span>
        </div>
      </div>

      {/* UI Components */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E8E0D0", boxShadow: "0 2px 16px rgba(26,51,84,0.06)" }}>
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "11px", fontWeight: 600, color: "#9CA3AF", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>UI Components</div>

        {/* Nav */}
        <div style={{ background: "#1A3354", borderRadius: "10px", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", fontFamily: "'Inter', Arial, sans-serif" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", background: "#C9963A", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "13px", fontFamily: "Georgia, serif" }}>C</span>
            </div>
            <span style={{ color: "#F5C842", fontWeight: 700, fontSize: "14px", fontFamily: "Georgia, serif" }}>CoP Compliance Suite</span>
          </div>
          <div style={{ display: "flex", gap: "24px" }}>
            {["Guidelines", "Policies", "Inspection", "Gap Scan"].map((item) => (
              <span key={item} style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>{item}</span>
            ))}
          </div>
          <button style={{ padding: "8px 18px", background: "#F5C842", border: "none", borderRadius: "6px", color: "#1A3354", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Start Free Trial
          </button>
        </div>

        {/* Buttons */}
        <div style={{ fontFamily: "'Inter', Arial, sans-serif", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
          <button style={{ padding: "11px 22px", background: "#1A3354", border: "none", borderRadius: "6px", color: "#fff", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>Primary Navy</button>
          <button style={{ padding: "11px 22px", background: "#F5C842", border: "none", borderRadius: "6px", color: "#1A3354", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Gold CTA</button>
          <button style={{ padding: "11px 22px", background: "none", border: "2px solid #1A3354", borderRadius: "6px", color: "#1A3354", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>Secondary</button>
          <span style={{ padding: "4px 10px", background: "#FEF9EC", borderRadius: "4px", color: "#C9963A", fontSize: "11px", fontWeight: 700, border: "1px solid #F5C842", fontFamily: "Inter, sans-serif" }}>VERIFIED ✓</span>
        </div>

        {/* Feature card — formal style */}
        <div style={{ background: "#F9F7F2", borderRadius: "10px", padding: "24px", borderTop: "3px solid #C9963A", maxWidth: "380px", fontFamily: "'Inter', Arial, sans-serif" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#C9963A", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>Policy Gap Scanner</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "17px", fontWeight: 700, color: "#1A3354", marginBottom: "8px", lineHeight: 1.3 }}>AI-Powered Compliance Analysis</div>
          <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.7 }}>Cross-reference your policies against CMS Conditions of Participation using advanced document analysis.</div>
          <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "20px", height: "20px", background: "#C9963A", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: "10px" }}>→</span>
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#1A3354" }}>Analyze your policies</span>
          </div>
        </div>
      </div>

      <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: "12px", color: "#9CA3AF", textAlign: "center", marginTop: "8px" }}>
        Direction B · Clarity · Classic authority — Georgia display type, navy + gold palette · Best for: traditional healthcare systems, legal/regulatory gravitas
      </div>
    </div>
  );
}
