import { useState } from "react";
import { SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  const [agreed, setAgreed] = useState(false);

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", background: "linear-gradient(135deg, #0D5C6B 0%, #0a4a57 100%)", padding: "20px",
    }}>
      {/* Terms acceptance gate */}
      {!agreed ? (
        <div style={{
          background: "#fff", borderRadius: "14px", padding: "32px 28px", maxWidth: "420px", width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#0D5C6B", marginBottom: "6px" }}>
            CMS CoP Compliance Suite
          </div>
          <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "24px", lineHeight: 1.5 }}>
            Before creating your account, please review and accept our Terms of Service.
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "14px 16px", marginBottom: "20px", fontSize: "12px", color: "#475569", lineHeight: 1.7 }}>
            <strong style={{ color: "#0D5C6B" }}>Key terms:</strong>
            <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
              <li>Each subscription covers <strong>one facility location</strong> only.</li>
              <li>Do not upload documents containing <strong>patient information (PHI)</strong>.</li>
              <li>All fees are <strong>non-refundable</strong>; access continues through the end of the paid period.</li>
              <li>AI-generated content is for educational use — <strong>not legal advice</strong>.</li>
              <li>Governed by the laws of the <strong>State of Florida</strong>.</li>
            </ul>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginBottom: "24px" }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: "2px", width: "16px", height: "16px", flexShrink: 0, accentColor: "#0D5C6B" }}
            />
            <span style={{ fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>
              I have read and agree to the{" "}
              <strong>Terms of Service</strong>{" "}and{" "}
              <strong>Privacy Policy</strong>.
              I understand that each subscription is licensed to one facility location.
            </span>
          </label>

          <button
            onClick={() => setAgreed(true)}
            style={{
              width: "100%", padding: "13px", background: "#0D5C6B", color: "#fff", border: "none",
              borderRadius: "8px", fontSize: "14px", fontWeight: 700, cursor: "pointer",
            }}
          >
            Continue to Create Account →
          </button>

          <p style={{ textAlign: "center", marginTop: "16px", fontSize: "12px", color: "#94A3B8" }}>
            Already have an account?{" "}
            <a href={`${basePath}/sign-in`} style={{ color: "#0D5C6B", fontWeight: 600 }}>Sign in</a>
          </p>
        </div>
      ) : (
        <>
          <SignUp
            routing="path"
            path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            fallbackRedirectUrl={`${basePath}/register-ccn`}
          />
          <p style={{
            marginTop: "16px", fontSize: "12px", color: "rgba(255,255,255,0.65)",
            textAlign: "center", maxWidth: "360px", lineHeight: 1.5,
          }}>
            By creating an account you agree that each subscription covers one facility
            location only. Multi-facility use requires a separate subscription per location.
          </p>
        </>
      )}
    </div>
  );
}
