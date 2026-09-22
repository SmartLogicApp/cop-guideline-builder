import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Link } from 'wouter';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { TermsDocument } from '@/components/terms-document';

/**
 * Clickwrap acceptance.
 *
 * Terms 1.0 promised customers that updated billing terms would be presented
 * and affirmatively accepted before any charging begins. This screen is how
 * that promise is kept, and the checkout endpoint refuses to create a session
 * until the acceptance it records exists.
 *
 * Three things here are deliberate and should survive future edits:
 *  - the full document is rendered on this page, not linked. A customer must
 *    be able to read what they are agreeing to without leaving the screen.
 *  - the Agree button stays disabled until the document has been scrolled to
 *    the end AND the checkbox is ticked. Pre-ticked boxes and agree-without-
 *    seeing are the two things that get clickwrap agreements thrown out.
 *  - the server records its own receipt time. Nothing here can backdate it.
 */

type TermsStatus = {
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  acceptanceRequired: boolean;
  registered: boolean;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function AcceptTermsPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/accounts/terms-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load terms status.');
      setStatus((await response.json()) as TermsStatus);
      setError(null);
    } catch {
      setError('We could not load the current Terms. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadStatus();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, loadStatus]);

  // Enable agreement only once the document has actually been read to the end.
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 48) setScrolledToEnd(true);
  }, []);

  // A short document that needs no scrolling must not trap the customer.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && element.scrollHeight <= element.clientHeight + 4) setScrolledToEnd(true);
  }, [status]);

  const accept = useCallback(async () => {
    if (!status || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch('/api/accounts/terms-acceptance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ termsVersion: status.currentVersion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          payload?.error ??
            'We could not record your acceptance. Please try again, or contact support if it persists.',
        );
        return;
      }
      await loadStatus();
    } catch {
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [status, submitting, getToken, loadStatus]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-slate-600">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading the current Terms…</span>
        </div>
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell>
        <p className="text-slate-700">
          Please sign in to review and accept the Terms of Service.
        </p>
      </Shell>
    );
  }

  if (status && !status.registered) {
    return (
      <Shell>
        <p className="text-slate-700">
          Register your organization first — the acceptance is recorded against the account, so
          there needs to be one before you can accept.
        </p>
        <a
          href={`${basePath}/register`}
          className="mt-6 inline-block rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
        >
          Register your organization
        </a>
      </Shell>
    );
  }

  if (status && !status.acceptanceRequired) {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-700" aria-hidden="true" />
            <div className="text-sm leading-6 text-emerald-950">
              <p className="font-semibold">Terms accepted</p>
              <p className="mt-1">
                Your facility accepted version {status.acceptedVersion} on{' '}
                {status.acceptedAt
                  ? new Date(status.acceptedAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'file'}
                .
              </p>
            </div>
          </div>
        </div>
        <a
          href={`${basePath}/billing`}
          className="mt-6 inline-block rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
        >
          Continue to billing
        </a>
      </Shell>
    );
  }

  const canAgree = checked && scrolledToEnd && !submitting;

  return (
    <Shell>
      <div className="mb-6 rounded-xl border border-teal-300 bg-teal-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-800" aria-hidden="true" />
          <div className="text-sm leading-6 text-teal-950">
            <p className="font-semibold">Updated Terms of Service</p>
            <p className="mt-1">
              Our billing terms have changed and now describe paid subscriptions. Please read
              them and confirm your acceptance before subscribing.
              {status?.acceptedVersion ? (
                <> Your facility previously accepted version {status.acceptedVersion}.</>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="Terms of Service"
        className="h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-700 sm:p-8"
      >
        <TermsDocument />
      </div>

      {!scrolledToEnd ? (
        <p className="mt-3 text-sm text-slate-500">
          Scroll to the end of the Terms to continue.
        </p>
      ) : null}

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-[15px] leading-6 text-slate-800">
        <input
          type="checkbox"
          id="terms-agree"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 h-4 w-4 flex-none rounded border-slate-400 text-teal-800 focus:ring-teal-700"
        />
        <span>
          I have read and agree to the Terms of Service, and I am authorized to accept them on
          behalf of this facility.
        </span>
      </label>

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={accept}
          disabled={!canAgree}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Recording…
            </>
          ) : (
            'I Agree'
          )}
        </button>
        <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          Not now
        </Link>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Your acceptance is recorded with the version you accepted and the time our server
        received it.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-9 w-9" />
            <span className="font-bold text-slate-950">CMS Compliance Suite</span>
          </Link>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
