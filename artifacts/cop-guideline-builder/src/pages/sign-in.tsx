import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0D5C6B 0%, #0a4a57 100%)", padding: "20px",
    }}>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={basePath || "/"}
      />
      <div style={{
        marginTop: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "8px", padding: "10px 16px", maxWidth: "360px", textAlign: "center",
      }}>
        <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
          💡 Tip: Use <strong>Continue with Google</strong> to skip email codes entirely.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          If you signed up with email + password and are waiting for a verification code,
          check your <strong style={{ color: "rgba(255,255,255,0.85)" }}>spam / junk folder</strong> — codes sometimes land there.
        </p>
      </div>
      <p style={{
        marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.55)",
        textAlign: "center", maxWidth: "360px", lineHeight: 1.5,
      }}>
        One subscription per facility location. Sharing credentials across multiple
        facilities violates our{" "}
        <a href={`${basePath}/sign-in`} style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline" }}
          onClick={(e) => { e.preventDefault(); window.history.back(); }}>
          Terms of Service
        </a>.
      </p>
    </div>
  );
}
