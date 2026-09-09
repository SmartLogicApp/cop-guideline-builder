import { lazy, Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import LandingPage from '@/pages/landing';
import TermsPage from '@/pages/terms';
import PrivacyPage from '@/pages/privacy';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function PublicApp() {
  return (
    <TooltipProvider>
      <PublicRouter />
      <Toaster />
    </TooltipProvider>
  );
}

function RouteBoundary() {
  const [location] = useLocation();
  const normalizedLocation = location.length > 1
    ? location.replace(/\/+$/, '')
    : location;
  const needsAuth = normalizedLocation === '/app'
    || normalizedLocation === '/sign-in'
    || normalizedLocation.startsWith('/sign-in/')
    || normalizedLocation === '/sign-up'
    || normalizedLocation.startsWith('/sign-up/');

  return needsAuth ? (
    <ErrorBoundary FallbackComponent={AuthLoadError}>
      <Suspense fallback={<AuthLoading />}>
        <AuthenticatedApp />
      </Suspense>
    </ErrorBoundary>
  ) : (
    <PublicApp />
  );
}

export default function AppWithRouter() {
  return (
    <WouterRouter base={basePath}>
      <RouteBoundary />
    </WouterRouter>
  );
}

function PublicRouter() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function AuthLoading() {
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

function AuthLoadError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-xl font-semibold text-slate-950">
          Sign-in is temporarily unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Public pages are still available. Check your connection, then reload
          this page to try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
