import { lazy, Suspense, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClerkProvider,
  ClerkLoaded,
  ClerkLoading,
  RedirectToSignIn,
  Show,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import BillingPage from '@/pages/billing';
import AcceptTermsPage from '@/pages/accept-terms';
import RegisterPage from '@/pages/register';
import AffiliatePortalPage from '@/pages/affiliate-compliance/AffiliatePortalPage';
import PayoutReturnPage from '@/pages/affiliate-compliance/PayoutReturnPage';
import PayoutRefreshPage from '@/pages/affiliate-compliance/PayoutRefreshPage';
import MarketingGuidelinesPage from '@/pages/affiliate-compliance/MarketingGuidelinesPage';
import AdminAffiliatesList from '@/pages/affiliate-compliance/AdminAffiliatesList';
import AdminAffiliateDetail from '@/pages/affiliate-compliance/AdminAffiliateDetail';
import AdminCompliance from '@/pages/affiliate-compliance/AdminCompliance';
import AdminPayouts from '@/pages/affiliate-compliance/AdminPayouts';
import { Route, Switch, useLocation } from 'wouter';
import './auth.css';

const CoPGuidelineBuilder = lazy(() => import('./workspace-entry'));

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'bottom' as const,
  },
  variables: {
    colorPrimary: '#0d5c6b',
    colorForeground: '#0f172a',
    colorMutedForeground: '#64748b',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#0f172a',
    colorDanger: '#b91c1c',
    colorNeutral: '#cbd5e1',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-slate-200 shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-slate-950',
    headerSubtitle: 'text-slate-600',
    socialButtonsBlockButtonText: 'text-slate-900',
    formFieldLabel: 'text-slate-800',
    footerActionLink: 'text-teal-800 font-semibold',
    footerActionText: 'text-slate-600',
    dividerText: 'text-slate-500',
    identityPreviewEditButton: 'text-teal-800',
    formFieldSuccessText: 'text-emerald-700',
    alertText: 'text-red-800',
    logoBox: 'h-12',
    logoImage: 'h-11',
    socialButtonsBlockButton: 'border-slate-300 hover:bg-slate-50',
    formButtonPrimary: 'bg-teal-800 hover:bg-teal-900 text-white',
    formFieldInput: 'border-slate-300 text-slate-950 focus:border-teal-700 focus:ring-teal-700',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-slate-200',
    alert: 'bg-red-50 border-red-200',
    otpCodeFieldInput: 'border-slate-300 text-slate-950',
    formFieldRow: 'text-slate-800',
    main: 'gap-5',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }), [addListener]);

  return null;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-12">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/app`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-12">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/app`}
      />
    </div>
  );
}

function WorkspaceLoading() {
  return <div className="flex min-h-[100dvh] items-center justify-center">Loading your compliance workspace…</div>;
}

function ClerkLoadingState() {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div
          className="mx-auto size-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-medium text-slate-700">
          Loading secure sign-in…
        </p>
      </div>
    </div>
  );
}

function WorkspaceLoadError() {
  return <div className="flex min-h-[100dvh] items-center justify-center">We couldn’t load your workspace.</div>;
}

function ComplianceWorkspace() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  return (
    <>
      <Show when="signed-in">
        <ErrorBoundary FallbackComponent={WorkspaceLoadError}>
          <Suspense fallback={<WorkspaceLoading />}>
            <CoPGuidelineBuilder
              clerkUserId={user?.id}
              getToken={getToken}
              onSignOut={() => signOut({ redirectUrl: basePath || '/' })}
            />
          </Suspense>
        </ErrorBoundary>
      </Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function Billing() {
  const { user } = useUser();
  return (
    <>
      <Show when="signed-in">
        {user?.id
          ? <BillingPage key={user.id} />
          : <WorkspaceLoading />}
      </Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function AcceptTerms() {
  return (
    <>
      <Show when="signed-in">
        <AcceptTermsPage />
      </Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function Register() {
  return (
    <>
      <Show when="signed-in">
        <RegisterPage />
      </Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/app" component={ComplianceWorkspace} />
      <Route path="/billing" component={Billing} />
      <Route path="/register" component={Register} />
      <Route path="/accept-terms" component={AcceptTerms} />

      <Route path="/partners/portal" component={AffiliatePortalPage} />
      <Route path="/partners/portal/payout-return" component={PayoutReturnPage} />
      <Route path="/partners/portal/payout-refresh" component={PayoutRefreshPage} />
      <Route path="/partners/marketing-guidelines" component={MarketingGuidelinesPage} />

      <Route path="/admin/affiliates" component={AdminAffiliatesList} />
      <Route path="/admin/affiliates/:id" component={AdminAffiliateDetail} />
      <Route path="/admin/affiliate-compliance" component={AdminCompliance} />
      <Route path="/admin/affiliate-payouts" component={AdminPayouts} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function AuthenticatedApp() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your compliance workspace' } },
        signUp: { start: { title: 'Start your free trial', subtitle: 'Create your CMS Compliance Suite account' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkLoading>
        <ClerkLoadingState />
      </ClerkLoading>
      <ClerkLoaded>
        <QueryClientProvider client={queryClient}>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}