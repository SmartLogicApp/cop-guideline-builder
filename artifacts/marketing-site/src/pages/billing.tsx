import { CONTACT_EMAIL_SUPPORT } from '@/lib/contact';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileClock,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type SubscriptionData = {
  subscription: null | {
    status: string | null;
    trialEndsAt: string | null;
    isActive: boolean;
    accessSource: 'admin' | 'complimentary' | 'subscription';
    hasComplimentaryAccess: boolean;
    daysLeftInTrial: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  isActive?: boolean;
  accessSource?: 'admin' | 'complimentary' | 'subscription';
  paymentAcceptanceEnabled: boolean;
  plan: null | { name: string; amountUsd: number; interval: 'month' };
  canManageBilling: boolean;
};

type TokenUsageData = {
  currentMonth: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    monthLabel: string;
  };
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const workspaceUrl = `${basePath}/app`;
const supportEmail = CONTACT_EMAIL_SUPPORT;

function formatNumber(value: number) {
  return value.toLocaleString('en-US');
}

function subscriptionLabel(data: SubscriptionData | null) {
  if (!data) return 'Unavailable';
  const subscription = data.subscription;
  const source = subscription?.accessSource ?? data.accessSource;

  if (source === 'admin') return 'Administrative access';
  if (source === 'complimentary') return 'Complimentary access';
  if (subscription?.status === 'trial' && subscription.daysLeftInTrial > 0) {
    return `Free trial · ${subscription.daysLeftInTrial} day${subscription.daysLeftInTrial === 1 ? '' : 's'} left`;
  }
  if (subscription?.isActive || data.isActive) return 'Active';
  return 'No active plan';
}

export default function BillingPage() {
  const { getToken } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<TokenUsageData['currentMonth'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'checkout' | 'portal' | null>(null);
  const paymentAcceptanceEnabled = subscription?.paymentAcceptanceEnabled === true;
  const checkoutState = new URLSearchParams(window.location.search).get('checkout');

  const loadBilling = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Your secure session is unavailable. Please sign in again.');

      const headers = { Authorization: `Bearer ${token}` };
      const [subscriptionResponse, usageResponse] = await Promise.all([
        fetch('/api/billing/subscription', { headers, cache: 'no-store' }),
        fetch('/api/billing/token-usage', { headers, cache: 'no-store' }),
      ]);

      if (!subscriptionResponse.ok || !usageResponse.ok) {
        throw new Error('We could not load your billing details. Please try again.');
      }

      const [subscriptionBody, usageBody] = await Promise.all([
        subscriptionResponse.json() as Promise<SubscriptionData>,
        usageResponse.json() as Promise<TokenUsageData>,
      ]);
      setSubscription(subscriptionBody);
      setUsage(usageBody.currentMonth);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'We could not load your billing details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (params.get('checkout') === 'success' && sessionId) {
        try {
          const token = await getToken();
          if (token) {
            await fetch('/api/billing/checkout/confirm', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ sessionId }),
            });
          }
        } catch {
          // A signed Stripe webhook may already have synchronized access.
        }
      }
      await loadBilling();
    };
    void hydrate();
  }, [getToken, loadBilling]);

  const openStripe = useCallback(async (endpoint: 'checkout' | 'portal') => {
    setActionLoading(endpoint);
    setActionError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your secure session is unavailable. Please sign in again.');
      const response = await fetch(`/api/billing/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const body = await response.json() as { url?: string; error?: string; code?: string };
      // Checkout refuses until the current Terms have been accepted. Without
      // this the customer got the refusal as a bare error string and had no
      // way to reach the acceptance page, which nothing else links to either.
      if (response.status === 409 && body.code === 'TERMS_ACCEPTANCE_REQUIRED') {
        window.location.assign(`${basePath}/accept-terms`);
        return;
      }
      if (!response.ok || !body.url) {
        throw new Error(body.error || 'Billing could not be opened. Please try again.');
      }
      window.location.assign(body.url);
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error
        ? actionFailure.message
        : 'Billing could not be opened. Please try again.');
      setActionLoading(null);
    }
  }, [getToken]);

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <a
          href={workspaceUrl}
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:text-teal-950"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to compliance workspace
        </a>

        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
              Account
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Billing and usage
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review your current access and monthly AI activity.
            </p>
          </div>
          {!isLoading && !error && (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {subscriptionLabel(subscription)}
            </div>
          )}
        </div>

        {isLoading && (
          <div
            className="mt-8 flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="mr-3 size-5 animate-spin text-teal-700" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-700">Loading billing details…</span>
          </div>
        )}

        {!isLoading && error && (
          <section
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6"
            role="alert"
          >
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-red-950">Billing details unavailable</h2>
                <p className="mt-1 text-sm leading-6 text-red-800">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadBilling()}
                  className="mt-4 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        )}

        {!isLoading && !error && (
          <>
            {checkoutState === 'success' && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900" role="status">
                Checkout completed. Subscription access will update as soon as Stripe confirms it.
              </div>
            )}
            {checkoutState === 'canceled' && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700" role="status">
                Checkout was canceled. No payment was made.
              </div>
            )}
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <ShieldCheck className="size-5 text-teal-700" aria-hidden="true" />
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Current access
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {subscriptionLabel(subscription)}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Sparkles className="size-5 text-teal-700" aria-hidden="true" />
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  AI requests
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {formatNumber(usage?.requestCount ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{usage?.monthLabel ?? 'This month'}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <FileClock className="size-5 text-teal-700" aria-hidden="true" />
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total tokens
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {formatNumber(usage?.totalTokens ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatNumber(usage?.inputTokens ?? 0)} input · {formatNumber(usage?.outputTokens ?? 0)} output
                </p>
              </article>
            </section>

            {paymentAcceptanceEnabled ? (
              <section
                className="mt-6 rounded-2xl border border-teal-200 bg-white p-6 shadow-sm sm:p-8"
                data-payment-acceptance="enabled"
              >
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-teal-100">
                        <CreditCard className="size-6 text-teal-800" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Facility plan</p>
                        <h2 className="text-xl font-bold text-slate-950">CMS Compliance Suite</h2>
                      </div>
                    </div>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                      Full compliance workspace access for your registered facility, including guideline,
                      policy, inspection-readiness, and policy-gap generation tools.
                    </p>
                    {subscription?.subscription?.currentPeriodEnd && (
                      <p className="mt-3 text-sm font-medium text-slate-700">
                        {subscription.subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}{' '}
                        {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="min-w-56 rounded-xl bg-slate-50 p-5 text-center">
                    <p className="text-3xl font-bold text-slate-950">
                      ${subscription?.plan?.amountUsd ?? 299}
                      <span className="text-sm font-medium text-slate-500">/month</span>
                    </p>
                    {subscription?.canManageBilling ? (
                      <button
                        type="button"
                        onClick={() => void openStripe('portal')}
                        disabled={actionLoading !== null}
                        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {actionLoading === 'portal' ? 'Opening…' : 'Manage billing'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openStripe('checkout')}
                        disabled={actionLoading !== null}
                        className="mt-4 w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {actionLoading === 'checkout' ? 'Opening secure checkout…' : 'Subscribe'}
                      </button>
                    )}
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Secure checkout and subscription management are provided by Stripe.
                    </p>
                  </div>
                </div>
                {actionError && (
                  <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                    {actionError}
                  </div>
                )}
              </section>
            ) : (
              <section
                className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8"
                data-payment-acceptance="disabled"
              >
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <CircleDollarSign className="size-6 text-amber-800" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-amber-950">
                    Paid billing is not active yet
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900">
                    Stripe checkout, automatic renewals, and payment collection are not currently enabled. No payment method will be requested and no charge will be created from this page. Updated pricing and billing terms will be presented before paid subscriptions launch.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-5 cursor-not-allowed rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800 opacity-80"
                  >
                    Payment acceptance not enabled
                  </button>
                  <p className="mt-4 text-sm text-amber-900">
                    Need help with access?{' '}
                    <a
                      href={`mailto:${supportEmail}?subject=CMS%20Compliance%20Suite%20billing%20support`}
                      className="font-bold underline underline-offset-4 hover:text-amber-950"
                    >
                      Contact support
                    </a>
                  </p>
                </div>
              </div>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-bold text-slate-950">About your AI usage</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                AI usage is included in your subscription. The request and token counts
                above are shown so you can see your own activity &mdash; they are not an
                amount owed, and nothing above is billed separately from your monthly fee.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}