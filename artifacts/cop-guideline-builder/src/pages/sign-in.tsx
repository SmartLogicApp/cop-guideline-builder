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
      <p style={{
        marginTop: "16px", fontSize: "12px", color: "rgba(255,255,255,0.65)",
        textAlign: "center", maxWidth: "360px", lineHeight: 1.5,
      }}>
        One subscription per facility location. Sharing credentials across multiple
        facilities violates our{" "}
        <a href={`${basePath}/sign-in`} style={{ color: "rgba(255,255,255,0.85)", textDecoration: "underline" }}
          onClick={(e) => { e.preventDefault(); window.history.back(); }}>
          Terms of Service
        </a>.
      </p>
    </div>
  );
}
