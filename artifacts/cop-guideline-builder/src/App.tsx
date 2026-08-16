import { useEffect, type ReactNode } from "react";
import { ClerkProvider, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import CcnRegistrationPage from "@/pages/ccn-registration";
import BillingPage from "@/pages/billing";
import AdminPage   from "@/pages/admin";
import { useAccount } from "@/hooks/useAccount";
import CoPGuidelineBuilder from "../../../index.jsx";

// ── Clerk setup ───────────────────────────────────────────────────────────────
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const queryClient = new QueryClient();

// ── Trial banner ──────────────────────────────────────────────────────────────
function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div style={{
      background: "#F59E0B", color: "#78350F", padding: "10px 20px",
      textAlign: "center", fontSize: "13px", fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
    }}>
      <span>⏱ Trial: {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining</span>
      <a href="/billing" style={{ color: "#78350F", fontWeight: 700 }}>Subscribe now →</a>
    </div>
  );
}

// ── Landing page (signed-out users) ─────────────────────────────────────────
function Landing() {
  const [, setLocation] = useLocation();
  const features = [
    { icon: "📋", label: "Compliance Guidelines", desc: "Live eCFR data for all CMS CoPs" },
    { icon: "📄", label: "Policy Templates",      desc: "Ready-to-use policy documents" },
    { icon: "🔍", label: "Inspection Readiness",  desc: "Surveyor-style self-assessment" },
    { icon: "🩺", label: "Policy Gap Scanner",    desc: "AI-powered compliance gap analysis" },
  ];
  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #0D5C6B 0%, #0a4a57 60%, #083b47 100%)",
      fontFamily: "system-ui, -apple-system, sans-serif", color: "#fff" }}>
      {/* Nav */}
      <nav style={{ padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.svg" alt="logo" width={36} height={36} />
          <span style={{ fontWeight: 700, fontSize: "16px" }}>CMS CoP Compliance Suite</span>
          <span style={{ background: "#F59E0B", color: "#78350F", fontSize: "10px", fontWeight: 700,
            padding: "2px 7px", borderRadius: "8px" }}>BETA</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setLocation("/sign-in")}
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff", padding: "8px 18px", borderRadius: "8px", fontSize: "13px",
              fontWeight: 600, cursor: "pointer" }}>
            Sign In
          </button>
          <button onClick={() => setLocation("/sign-up")}
            style={{ background: "#fff", color: "#0D5C6B", border: "none", padding: "8px 18px",
              borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "60px 24px 40px", maxWidth: "700px", margin: "0 auto" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px",
          opacity: 0.7, marginBottom: "16px" }}>
          CMS · Joint Commission · DNV NIAHO · ISO 9001:2015
        </div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 52px)", fontWeight: 800, lineHeight: 1.15,
          margin: "0 0 20px", letterSpacing: "-0.5px" }}>
          Healthcare Compliance,<br />Powered by AI
        </h1>
        <p style={{ fontSize: "18px", opacity: 0.85, lineHeight: 1.6, margin: "0 0 36px" }}>
          Trusted by compliance officers at hospitals, SNFs, and home health agencies.
          Generate guidelines, scan policy gaps, and prepare for surveys — in minutes.
        </p>
        <button onClick={() => setLocation("/sign-up")}
          style={{ background: "#fff", color: "#0D5C6B", border: "none", padding: "16px 36px",
            borderRadius: "10px", fontSize: "16px", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          Start 30-Day Free Trial
        </button>
        <div style={{ fontSize: "12px", opacity: 0.6, marginTop: "10px" }}>
          No credit card required · Per-CCN pricing · Cancel anytime · <strong style={{ opacity: 0.9 }}>No refunds after trial</strong>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px 20px",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        {features.map((f) => (
          <div key={f.label} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px", padding: "24px 20px" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>{f.label}</div>
            <div style={{ fontSize: "12px", opacity: 0.7, lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", opacity: 0.6, marginBottom: "8px" }}>Pricing</div>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 34px)", fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.3px" }}>One subscription per facility</h2>
          <p style={{ fontSize: "14px", opacity: 0.7, margin: 0 }}>All staff at your location share one plan. 30-day free trial, no credit card required.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", maxWidth: "640px", margin: "0 auto" }}>
          {[
            { name: "Facility", price: "$299", period: "/month", desc: "All staff at one facility location — unlimited users per CCN", features: ["Unlimited staff users", "1 facility / CCN", "All 4 compliance tools", "AI gap scanning", "Priority support", "30-day free trial"], highlight: true },
            { name: "Enterprise", price: "Custom", period: "", desc: "Multi-site health systems — volume discounts available", features: ["Unlimited users", "Multiple CCNs / facilities", "All tools + custom reporting", "Dedicated support", "Volume discounts", "SSO / SAML"], highlight: false, contact: true },
          ].map((plan) => (
            <div key={plan.name} style={{
              background: plan.highlight ? "#fff" : "rgba(255,255,255,0.08)",
              border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.15)",
              borderRadius: "14px", padding: "28px 24px",
              boxShadow: plan.highlight ? "0 8px 40px rgba(0,0,0,0.25)" : "none",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: plan.highlight ? "#0D5C6B" : "rgba(255,255,255,0.6)", marginBottom: "6px" }}>{plan.name}</div>
              <div style={{ fontSize: "36px", fontWeight: 800, color: plan.highlight ? "#0D5C6B" : "#fff", lineHeight: 1 }}>{plan.price}<span style={{ fontSize: "14px", fontWeight: 400, opacity: 0.7 }}>{plan.period}</span></div>
              <div style={{ fontSize: "12px", color: plan.highlight ? "#64748B" : "rgba(255,255,255,0.6)", margin: "6px 0 18px" }}>{plan.desc}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", fontSize: "13px", color: plan.highlight ? "#334155" : "rgba(255,255,255,0.85)", lineHeight: 2 }}>
                {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
              </ul>
              {plan.contact
                ? <a href="mailto:HectorSamlut@outlook.com?subject=Enterprise Inquiry" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: "8px", background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none", border: "1px solid rgba(255,255,255,0.3)" }}>Contact Sales</a>
                : <button onClick={() => setLocation("/sign-up")} style={{ width: "100%", padding: "11px", borderRadius: "8px", background: plan.highlight ? "#0D5C6B" : "#fff", color: plan.highlight ? "#fff" : "#0D5C6B", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" }}>Start Free Trial</button>
              }
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: "11px", opacity: 0.5, marginTop: "20px" }}>All subscriptions are per facility location. Subscription fees are non-refundable — upon cancellation you retain access through the end of the current billing period. Multi-facility organizations require one subscription per CCN. Florida law governs all subscriptions.</p>
      </div>
    </div>
  );
}

// ── Home redirect — handles auth + account routing ────────────────────────────
function HomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: accountData, isLoading: accountLoading } = useAccount();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // CCN registration is optional — no forced redirect
  }, [isSignedIn, isLoaded, accountData, accountLoading, setLocation]);

  if (!isLoaded || (isSignedIn && accountLoading)) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F8FAFC", color: "#0D5C6B", fontSize: "14px" }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      <Show when="signed-out"><Landing /></Show>
      <Show when="signed-in">
        <CoPGuidelineBuilder onSignOut={() => signOut({ redirectUrl: `${basePath}/` })} />
      </Show>
    </>
  );
}

// ── Protected wrapper — redirects to sign-in if not authenticated ─────────────
function Protected({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

// ── Idle-session timeout (signs out after 8 h of inactivity) ─────────────────
function IdleTimeout({ timeoutMs = 8 * 60 * 60 * 1000 }: { timeoutMs?: number }) {
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (!isSignedIn) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => signOut(), timeoutMs);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [isSignedIn, signOut, timeoutMs]);
  return null;
}

// ── Query cache invalidation on user change ───────────────────────────────────
function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  useEffect(() => {
    let prev: string | null | undefined = undefined;
    return addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev !== undefined && prev !== id) qc.clear();
      prev = id;
    });
  }, [addListener, qc]);
  return null;
}

// ── Router ────────────────────────────────────────────────────────────────────
function AppRouter() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkCacheInvalidator />
          <IdleTimeout />
          <ErrorBoundary resetKey="app">
            <Switch>
              <Route path="/"              component={HomeRedirect} />
              <Route path="/sign-in/*?"   component={SignInPage} />
              <Route path="/sign-up/*?"   component={SignUpPage} />
              <Route path="/register-ccn" component={() => <Protected><CcnRegistrationPage /></Protected>} />
              <Route path="/billing"      component={() => <Protected><BillingPage /></Protected>} />
              <Route path="/admin"        component={() => <Protected><AdminPage /></Protected>} />
              <Route                      component={NotFound} />
            </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRouter />
    </WouterRouter>
  );
}
