// Direction A — Meridian: Elevated Teal
// Keeps brand equity, refines with better typography, geometric logo mark, and a bright cyan AI accent.

export function Meridian() {
  const palette = [
    { name: "Deep Teal", hex: "#0B5269", role: "Primary" },
    { name: "Dark Teal", hex: "#083A4A", role: "Headings / Nav" },
    { name: "Cyan Accent", hex: "#06B6D4", role: "AI / Highlights" },
    { name: "Ice Surface", hex: "#EEF7FA", role: "Page Background" },
    { name: "Slate", hex: "#334155", role: "Body Text" },
    { name: "Amber", hex: "#F59E0B", role: "Warnings / Beta" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", background: "#F4F9FB", minHeight: "100vh", padding: "48px 56px", color: "#1E293B" }}>

      {/* Header Label */}
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#0B5269", marginBottom: "32px", opacity: 0.7 }}>
        Direction A — Meridian
      </div>

      {/* Logo Section */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 48px", marginBottom: "28px", border: "1px solid #D9EEF4", boxShadow: "0 2px 16px rgba(11,82,105,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Logo & Wordmark</div>

        {/* Logo on light */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "32px" }}>
          {/* Icon mark: hexagonal shield */}
          <svg width="48" height="52" viewBox="0 0 48 52" fill="none">
            <path d="M24 2L44 12V30C44 41 34 48 24 50C14 48 4 41 4 30V12L24 2Z" fill="#0B5269"/>
            <path d="M24 8L38 16V30C38 38.5 31 44 24 46C17 44 10 38.5 10 30V16L24 8Z" fill="#083A4A"/>
            {/* Document lines inside */}
            <rect x="16" y="20" width="16" height="2" rx="1" fill="#06B6D4"/>
            <rect x="16" y="25" width="12" height="2" rx="1" fill="rgba(255,255,255,0.6)"/>
            <rect x="16" y="30" width="14" height="2" rx="1" fill="rgba(255,255,255,0.6)"/>
            {/* Checkmark */}
            <path d="M20 35L22.5 37.5L28 32" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#083A4A", letterSpacing: "-0.5px", lineHeight: 1 }}>
              CMS CoP <span style={{ color: "#0B5269" }}>Compliance</span>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#64748B", marginTop: "2px", letterSpacing: "0.3px" }}>
              Suite
            </div>
          </div>
        </div>

        {/* Logo on dark bg */}
        <div style={{ background: "#083A4A", borderRadius: "10px", padding: "24px 32px", display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
          <svg width="36" height="40" viewBox="0 0 48 52" fill="none">
            <path d="M24 2L44 12V30C44 41 34 48 24 50C14 48 4 41 4 30V12L24 2Z" fill="#0B5269"/>
            <path d="M24 8L38 16V30C38 38.5 31 44 24 46C17 44 10 38.5 10 30V16L24 8Z" fill="#0E6880"/>
            <rect x="16" y="20" width="16" height="2" rx="1" fill="#06B6D4"/>
            <rect x="16" y="25" width="12" height="2" rx="1" fill="rgba(255,255,255,0.5)"/>
            <rect x="16" y="30" width="14" height="2" rx="1" fill="rgba(255,255,255,0.5)"/>
            <path d="M20 35L22.5 37.5L28 32" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>CMS CoP Compliance</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>Suite · Healthcare Compliance Intelligence</div>
          </div>
        </div>

        <div style={{ fontSize: "14px", color: "#64748B", fontStyle: "italic" }}>
          Tagline: <span style={{ color: "#0B5269", fontWeight: 600, fontStyle: "normal" }}>"Compliance intelligence, built for healthcare."</span>
        </div>
      </div>

      {/* Color Palette */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #D9EEF4", boxShadow: "0 2px 16px rgba(11,82,105,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>Color Palette</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {palette.map((c) => (
            <div key={c.hex} style={{ flex: "1", minWidth: "120px" }}>
              <div style={{ height: "64px", borderRadius: "10px", background: c.hex, marginBottom: "8px", border: c.hex === "#EEF7FA" ? "1px solid #CBD5E1" : "none" }} />
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>{c.name}</div>
              <div style={{ fontSize: "11px", color: "#94A3B8", fontFamily: "monospace" }}>{c.hex}</div>
              <div style={{ fontSize: "10px", color: "#CBD5E1", marginTop: "1px" }}>{c.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #D9EEF4", boxShadow: "0 2px 16px rgba(11,82,105,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>Typography — Inter</div>
        <div style={{ fontSize: "42px", fontWeight: 800, color: "#083A4A", letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: "8px" }}>Healthcare Compliance,<br />Powered by AI</div>
        <div style={{ fontSize: "20px", fontWeight: 600, color: "#0B5269", marginBottom: "8px", letterSpacing: "-0.3px" }}>Generate guidelines in seconds.</div>
        <div style={{ fontSize: "15px", color: "#475569", lineHeight: 1.7, maxWidth: "560px", marginBottom: "16px" }}>
          Trusted by compliance officers at hospitals, SNFs, and home health agencies. Generate guidelines, scan policy gaps, and prepare for surveys — in minutes.
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#0B5269", textTransform: "uppercase", letterSpacing: "1.5px" }}>Caption / Label Text</span>
          <span style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "1.5px" }}>Muted Label</span>
        </div>
      </div>

      {/* UI Components */}
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 40px", marginBottom: "28px", border: "1px solid #D9EEF4", boxShadow: "0 2px 16px rgba(11,82,105,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "1px" }}>UI Components</div>

        {/* Nav bar */}
        <div style={{ background: "#083A4A", borderRadius: "10px", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="22" height="24" viewBox="0 0 48 52" fill="none">
              <path d="M24 2L44 12V30C44 41 34 48 24 50C14 48 4 41 4 30V12L24 2Z" fill="#0B5269"/>
              <rect x="16" y="20" width="16" height="2" rx="1" fill="#06B6D4"/>
              <rect x="16" y="25" width="12" height="2" rx="1" fill="rgba(255,255,255,0.5)"/>
              <path d="M20 35L22.5 37.5L28 32" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>CMS CoP Suite</span>
          </div>
          <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            {["Guidelines", "Policies", "Gap Scanner", "Inspection"].map((item) => (
              <span key={item} style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px", fontWeight: 500 }}>{item}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button style={{ padding: "7px 16px", background: "none", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "7px", color: "rgba(255,255,255,0.8)", fontSize: "13px", cursor: "pointer" }}>Sign In</button>
            <button style={{ padding: "7px 16px", background: "#06B6D4", border: "none", borderRadius: "7px", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Start Free Trial</button>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
          <button style={{ padding: "12px 24px", background: "#0B5269", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Primary Action</button>
          <button style={{ padding: "12px 24px", background: "#06B6D4", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>AI Generate</button>
          <button style={{ padding: "12px 24px", background: "none", border: "2px solid #0B5269", borderRadius: "8px", color: "#0B5269", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Secondary</button>
          <button style={{ padding: "12px 24px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", color: "#475569", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>Ghost</button>
          <span style={{ padding: "4px 10px", background: "#EEF7FA", borderRadius: "20px", color: "#0B5269", fontSize: "11px", fontWeight: 700, border: "1px solid #B3DCEC" }}>BETA</span>
          <span style={{ padding: "4px 10px", background: "#FEF3C7", borderRadius: "20px", color: "#92400E", fontSize: "11px", fontWeight: 700, border: "1px solid #FDE68A" }}>⚠ Trial</span>
        </div>

        {/* Feature card */}
        <div style={{ background: "#EEF7FA", borderRadius: "12px", padding: "24px", borderLeft: "4px solid #06B6D4", maxWidth: "380px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div style={{ width: "36px", height: "36px", background: "#0B5269", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div style={{ fontWeight: 700, color: "#083A4A", fontSize: "15px" }}>Policy Gap Scanner</div>
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>AI-powered analysis of your policy documents against current CMS Conditions of Participation.</div>
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#06B6D4", fontWeight: 600 }}>Run a scan →</div>
        </div>
      </div>

      <div style={{ fontSize: "12px", color: "#94A3B8", textAlign: "center", marginTop: "8px" }}>
        Direction A · Meridian · Refined evolution of the current brand · Best for: conservative audiences, existing user familiarity
      </div>
    </div>
  );
}
