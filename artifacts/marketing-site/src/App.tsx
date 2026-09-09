import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClerkProvider,
  RedirectToSignIn,
  Show,
  SignIn,
  SignUp,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import LandingPage from '@/pages/landing';
import TermsPage from '@/pages/terms';
import PrivacyPage from '@/pages/privacy';
// @ts-expect-error The legacy compliance workspace is a JavaScript component.
import CoPGuidelineBuilder from '../../../index.jsx';
import {
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

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

function HomePage() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/app" /></Show>
      <Show when="signed-out"><LandingPage /></Show>
    </>
  );
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

function ComplianceWorkspace() {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <>
      <Show when="signed-in">
        <CoPGuidelineBuilder
          clerkUserId={user?.id}
          onSignOut={() => signOut({ redirectUrl: basePath || '/' })}
        />
      </Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/app" component={ComplianceWorkspace} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
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
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function AppWithRouter() {
  return (
    <WouterRouter base={basePath}>
      <App />
    </WouterRouter>
  );
}
