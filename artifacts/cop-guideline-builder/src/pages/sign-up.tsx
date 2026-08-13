import { SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0D5C6B 0%, #0a4a57 100%)", padding: "20px",
    }}>
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
    </div>
  );
}
