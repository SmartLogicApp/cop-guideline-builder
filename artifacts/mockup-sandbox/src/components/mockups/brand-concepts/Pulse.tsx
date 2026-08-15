// Direction C — Pulse: Modern Light SaaS
// Inverts the current dark-heavy approach. Light, airy, modern healthcare SaaS.
// Sky blue primary, emerald green for compliance success states, white surfaces.

export function Pulse() {
  const palette = [
    { name: "Sky Blue", hex: "#0284C7", role: "Primary" },
    { name: "Teal", hex: "#0D5C6B", role: "Secondary (heritage)" },
    { name: "Emerald", hex: "#059669", role: "Success / Compliant" },
    { name: "Slate Dark", hex: "#0F172A", role: "Headings / Nav" },
    { name: "Slate Mid", hex: "#475569", role: "Body Text" },
    { name: "Cloud", hex: "#F1F5F9", role: "Page Background" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", background: "#F1F5F9", minHeight: "100vh", padding: "48px 56px", color: "#0F172A" }}>

      {/* Header Label */}
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#0284C7", marginBottom: "32px", opacity: 0.7 }}>
        Direction C — Pulse
      </div>

      {/* Logo Section */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 48px", marginBottom: "28px", border: "1px solid #E2E8F0", boxShadow: "0 2px 20px rgba(15,23,42,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Logo & Wordmark</div>

        {/* Logo on white */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "32px" }}>
          {/* Modern rounded mark */}
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <rect width="46" height="46" rx="12" fill="#0284C7"/>
            {/* Pulse / ECG line morphing into checkmark */}
            <path d="M8 23H14L17 16L21 30L24 23H30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Checkmark */}
            <path d="M30 23L33 26L39 19" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.5px", lineHeight: 1.1 }}>CoP<span style={{ color: "#0284C7" }}>Compliance</span></div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", marginTop: "2px", letterSpacing: "2px", textTransform: "uppercase" }}>Healthcare Suite</div>
          </div>
        </div>

        {/* Logo on dark bg */}
        <div style={{ background: "#0F172A", borderRadius: "12px", padding: "22px 28px", display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
          <svg width="36" height="36" viewBox="0 0 46 46" fill="none">
            <rect width="46" height="46" rx="12" fill="#0284C7"/>
            <path d="M8 23H14L17 16L21 30L24 23H30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M30 23L33 26L39 19" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>CoPCompliance <span style={{ color: "#38BDF8" }}>Suite</span></div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "1px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Survey ready. Always.</div>
          </div>
        </div>

        {/* Logo on blue bg */}
        <div style={{ background: "linear-gradient(135deg, #0284C7, #0D5C6B)", borderRadius: "12px", padding: "22px 28px", display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
          <svg width="36" height="36" viewBox="0 0 46 46" fill="none">
            <rect width="46" height="46" rx="12" fill="rgba(255,255,255,0.2)"/>
            <path d="M8 23H14L17 16L21 30L24 23H30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M30 23L33 26L39 19" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>CoPCompliance Suite</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "1px" }}>Healthcare Compliance Intelligence</div>
          </div>
        </div>

        <div style={{ fontSize: "14px", color: "#64748B", fontStyle: "italic" }}>
          Tagline: <span style={{ color: "#0284C7", fontWeight: 700, fontStyle: "normal" }}>"Survey ready. Always."</span>
        </div>
      </div>

      {/* Color Palette */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E2E8F0", boxShadow: "0 2px 20px rgba(15,23,42,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>Color Palette</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {palette.map((c) => (
            <div key={c.hex} style={{ flex: "1", minWidth: "120px" }}>
              <div style={{ height: "64px", borderRadius: "10px", background: c.hex, marginBottom: "8px", border: c.hex === "#F1F5F9" ? "1px solid #CBD5E1" : "none" }} />
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>{c.name}</div>
              <div style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>{c.hex}</div>
              <div style={{ fontSize: "10px", color: "#CBD5E1", marginTop: "1px" }}>{c.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E2E8F0", boxShadow: "0 2px 20px rgba(15,23,42,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Typography — Inter (all weights)</div>
        <div style={{ fontSize: "44px", fontWeight: 800, color: "#0F172A", letterSpacing: "-2px", lineHeight: 1.05, marginBottom: "10px" }}>
          Survey ready.<br /><span style={{ color: "#0284C7" }}>Always.</span>
        </div>
        <div style={{ fontSize: "20px", fontWeight: 500, color: "#475569", marginBottom: "10px", letterSpacing: "-0.2px" }}>Compliance that works as fast as you do.</div>
        <div style={{ fontSize: "15px", color: "#64748B", lineHeight: 1.75, maxWidth: "540px", marginBottom: "16px" }}>
          CMS CoP compliance tools for hospitals, SNFs, and home health agencies. Generate guidelines, close policy gaps, and walk into every survey prepared.
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284C7", textTransform: "uppercase", letterSpacing: "1.5px" }}>Label / Caption</span>
          <span style={{ fontSize: "11px", color: "#CBD5E1", textTransform: "uppercase", letterSpacing: "1.5px" }}>Muted</span>
        </div>
      </div>

      {/* UI Components */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #E2E8F0", boxShadow: "0 2px 20px rgba(15,23,42,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>UI Components</div>

        {/* Nav — light version */}
        <div style={{ background: "#fff", borderRadius: "10px", padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", border: "1px solid #E2E8F0", boxShadow: "0 1px 8px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="28" height="28" viewBox="0 0 46 46" fill="none">
              <rect width="46" height="46" rx="10" fill="#0284C7"/>
              <path d="M8 23H14L17 16L21 30L24 23H30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30 23L33 26L39 19" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontWeight: 800, color: "#0F172A", fontSize: "15px" }}>CoPCompliance</span>
          </div>
          <div style={{ display: "flex", gap: "28px" }}>
            {["Guidelines", "Policies", "Inspection", "Gap Scanner"].map((item) => (
              <span key={item} style={{ color: "#64748B", fontSize: "13px", fontWeight: 500 }}>{item}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{ padding: "8px 16px", background: "none", border: "none", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>Sign In</button>
            <button style={{ padding: "8px 18px", background: "#0284C7", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Start Free Trial</button>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", marginTop: "16px" }}>
          <button style={{ padding: "11px 22px", background: "#0284C7", border: "none", borderRadius: "9px", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", boxShadow: "0 4px 12px rgba(2,132,199,0.3)" }}>Primary</button>
          <button style={{ padding: "11px 22px", background: "#059669", border: "none", borderRadius: "9px", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", boxShadow: "0 4px 12px rgba(5,150,105,0.25)" }}>✓ Compliant</button>
          <button style={{ padding: "11px 22px", background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: "9px", color: "#0284C7", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Secondary</button>
          <button style={{ padding: "11px 22px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "9px", color: "#475569", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>Ghost</button>
          <span style={{ padding: "5px 12px", background: "#ECFDF5", borderRadius: "20px", color: "#059669", fontSize: "11px", fontWeight: 700, border: "1px solid #A7F3D0" }}>✓ Survey Ready</span>
          <span style={{ padding: "5px 12px", background: "#EFF6FF", borderRadius: "20px", color: "#0284C7", fontSize: "11px", fontWeight: 700, border: "1px solid #BFDBFE" }}>AI-Powered</span>
        </div>

        {/* Feature cards — horizontal row */}
        <div style={{ display: "flex", gap: "14px" }}>
          {[
            { icon: "📋", title: "Compliance Guidelines", color: "#0284C7", light: "#EFF6FF", border: "#BFDBFE" },
            { icon: "🔍", title: "Policy Gap Scanner", color: "#059669", light: "#ECFDF5", border: "#A7F3D0" },
            { icon: "✓", title: "Inspection Ready", color: "#0D5C6B", light: "#F0F9FF", border: "#BAE6FD" },
          ].map((card) => (
            <div key={card.title} style={{ flex: 1, background: card.light, borderRadius: "10px", padding: "18px", border: `1px solid ${card.border}` }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{card.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: card.color, marginBottom: "4px" }}>{card.title}</div>
              <div style={{ fontSize: "11px", color: "#64748B", lineHeight: 1.5 }}>AI-powered, live regulatory data</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#94A3B8", textAlign: "center", marginTop: "8px" }}>
        Direction C · Pulse · Modern healthcare SaaS — light surfaces, sky blue primary, emerald success states · Best for: attracting new customers, modern tech-forward positioning
      </div>
    </div>
  );
}
