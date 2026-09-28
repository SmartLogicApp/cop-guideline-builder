import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { AlertCircle, Building2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { CLIENT_CURRENT_TERMS_VERSION, TermsDocument } from '@/components/terms-document';

/**
 * Account registration.
 *
 * Until this page existed, POST /api/accounts/register had no caller: a new
 * customer signed in, landed on /app with no account row, and was shown "Your
 * 30-day trial has ended" on their first visit. Every account had to be
 * inserted by hand.
 *
 * Four things here are deliberate:
 *  - The identifier field follows the identifier TYPE. A CCN, an NPI and a
 *    CLIA number have different shapes and different errors, and the server
 *    validates each differently. Showing one generic "ID" box would produce
 *    server-side rejections the customer cannot act on.
 *  - Consultants type no identifier at all. The server issues one, because a
 *    self-chosen consultant identifier could collide with — or impersonate —
 *    a real provider's.
 *  - The provider-type list is fetched, not bundled. It is owned by
 *    @workspace/cms-compliance-data, which this package does not depend on,
 *    and a second hard-coded copy would drift from the one generation uses.
 *  - A referral code in the URL (?ref=…) is captured silently and posted with
 *    the registration. It is the one piece of affiliate data that cannot be
 *    backfilled later, so it is recorded before any affiliate programme exists.
 */

type IdentifierType = 'ccn' | 'npi' | 'clia' | 'consultant';

type ProviderType = {
  value: string;
  label: string;
  cfr?: string | null;
  contentStatus?: string | null;
};

const IDENTIFIER_CHOICES: ReadonlyArray<{
  value: IdentifierType;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    value: 'ccn',
    label: 'CMS Certification Number (CCN)',
    hint: 'A Medicare-certified provider or supplier. Six characters, or ten for an ASC.',
    placeholder: '140001',
  },
  {
    value: 'npi',
    label: 'National Provider Identifier (NPI)',
    hint: 'A practice or individual provider without a CCN. Ten digits.',
    placeholder: '1234567893',
  },
  {
    value: 'clia',
    label: 'CLIA number',
    hint: 'A laboratory. Two digits, a letter, then seven digits.',
    placeholder: '12D3456789',
  },
  {
    value: 'consultant',
    label: 'None of these — I am a consultant or advisory firm',
    hint: 'For affiliates who accepted the current agreement. We will issue an account identifier.',
    placeholder: '',
  },
];

export default function RegisterPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [affiliateSignup] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('affiliate') === '1'; }
    catch { return false; }
  });
  const [affiliateCompany] = useState(() => {
    try {
      const company = new URLSearchParams(window.location.search).get('company')?.trim();
      return company && company.length <= 200 ? company : '';
    } catch {
      return '';
    }
  });
  const [affiliateHandoffEmail] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('email')?.trim().toLowerCase() ?? ''; }
    catch { return ''; }
  });

  const [identifierType, setIdentifierType] = useState<IdentifierType>(() => {
    try {
      return new URLSearchParams(window.location.search).get('affiliate') === '1'
        ? 'consultant'
        : 'ccn';
    } catch {
      return 'ccn';
    }
  });
  const [identifier, setIdentifier] = useState('');
  const [facilityName, setFacilityName] = useState(affiliateCompany);
  const [facilityType, setFacilityType] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');

  const [providerTypes, setProviderTypes] = useState<ProviderType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [activationTrialEndsAt, setActivationTrialEndsAt] = useState<string | null>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const accountQuery = useQuery<{ accountUser: unknown | null }>({
    queryKey: ['/api/accounts/me', user?.id],
    enabled: affiliateSignup && isLoaded && isSignedIn,
    staleTime: 0,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Your secure session is unavailable. Please sign in again.');
      const response = await fetch('/api/accounts/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not check your existing account. Please refresh and try again.');
      return response.json() as Promise<{ accountUser: unknown | null }>;
    },
  });

  // Captured once, on first render, before anything can rewrite the URL.
  const [referralCode] = useState<string | null>(() => {
    try {
      const value = new URLSearchParams(window.location.search).get('ref');
      return value ? value.trim().toUpperCase().slice(0, 64) || null : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || affiliateSignup) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch('/api/accounts/provider-types', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { providerTypes?: ProviderType[] };
        if (!cancelled) setProviderTypes(payload.providerTypes ?? []);
      } catch {
        // A missing list must not block registration — the field is optional
        // and the server does not require it except to size a CCN.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, affiliateSignup]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn ||
        (affiliateSignup && (!accountQuery.isSuccess || accountQuery.data.accountUser))) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Sign in again to review the Terms.');
        const response = await fetch('/api/accounts/terms-status', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load the current Terms.');
        const status = await response.json() as { currentVersion: string };
        if (status.currentVersion !== CLIENT_CURRENT_TERMS_VERSION) {
          throw new Error('The Terms have changed. Please refresh to review the latest version.');
        }
        if (!cancelled) setTermsVersion(status.currentVersion);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load the current Terms.');
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, affiliateSignup, accountQuery.isSuccess, accountQuery.data?.accountUser]);

  useEffect(() => {
    const element = termsRef.current;
    if (termsVersion && element && element.scrollHeight <= element.clientHeight + 4) {
      setTermsScrolled(true);
    }
  }, [termsVersion]);

  const handleTermsScroll = useCallback(() => {
    const element = termsRef.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 48) {
      setTermsScrolled(true);
    }
  }, []);

  const choice = useMemo(
    () => IDENTIFIER_CHOICES.find((entry) => entry.value === identifierType)!,
    [identifierType],
  );

  const needsIdentifier = identifierType !== 'consultant';
  const canSubmit =
    (identifierType === 'consultant' || facilityName.trim().length > 0) &&
    (!needsIdentifier || identifier.trim().length > 0) &&
    termsVersion !== null && termsChecked && termsScrolled &&
    !submitting;

  const selectedProvider = providerTypes.find((type) => type.value === facilityType);
  const contentPending =
    selectedProvider?.contentStatus != null && selectedProvider.contentStatus !== 'verified';

  const verifiedEmailAddress = user?.primaryEmailAddress?.verification?.status === 'verified'
    ? user.primaryEmailAddress : null;
  const emailVerifiedForRetry = verificationMessage?.startsWith('Your email is verified') === true;
  const emailToVerify = user?.primaryEmailAddress ?? null;
  const reapplyQuery = new URLSearchParams({
    email: verifiedEmailAddress?.emailAddress ?? '',
    company: affiliateCompany,
  }).toString();
  const reapplyUrl = `${import.meta.env.BASE_URL}affiliates?${reapplyQuery}#apply`;
  const affiliateEmailMismatch = affiliateSignup && affiliateHandoffEmail &&
    user?.primaryEmailAddress?.emailAddress &&
    affiliateHandoffEmail !== user.primaryEmailAddress.emailAddress.trim().toLowerCase();
  const correctedHandoff = new URLSearchParams({
    affiliate: '1',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
    company: affiliateCompany,
  }).toString();

  const sendVerificationCode = useCallback(async () => {
    if (!emailToVerify) {
      setError('Add an email address to your secure account before continuing.');
      return;
    }
    setVerificationSending(true);
    setVerificationMessage(null);
    try {
      await emailToVerify.prepareVerification({ strategy: 'email_code' });
      setVerificationMessage(`A verification code was sent to ${emailToVerify.emailAddress}. Check your inbox and junk folder.`);
    } catch {
      setError('We could not send a verification code. Please try again or update your email in your secure account.');
    } finally {
      setVerificationSending(false);
    }
  }, [emailToVerify]);

  const verifyEmailCode = useCallback(async () => {
    if (!emailToVerify || !verificationCode.trim()) return;
    setVerificationSending(true);
    setError(null);
    setVerificationMessage(null);
    try {
      const address = await emailToVerify.attemptVerification({ code: verificationCode.trim() });
      if (address.verification?.status !== 'verified') {
        throw new Error('The code has not verified this email yet.');
      }
      setVerificationRequired(false);
      setVerificationCode('');
      setVerificationMessage('Your email is verified. Continue to activate your affiliate workspace.');
      await user?.reload();
    } catch {
      setError('That verification code could not be confirmed. Check the code and try again.');
    } finally {
      setVerificationSending(false);
    }
  }, [emailToVerify, verificationCode, user]);

  const activateAffiliate = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setVerificationMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your secure session is unavailable. Please sign in again.');
      const response = await fetch('/api/accounts/affiliate/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        trialEndsAt?: string | null;
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        if (payload?.code === 'AFFILIATE_EMAIL_UNVERIFIED') {
          setVerificationRequired(true);
          setError('Verify your email address to continue. Check your inbox and junk folder for the Clerk verification message.');
        } else if (payload?.code === 'AFFILIATE_APPLICATION_EMAIL_MISMATCH') {
          setError('Your affiliate application uses a different email address. Reapply using your exact verified Clerk email to continue.');
        } else if (response.status === 409) {
          setError(payload?.error ?? 'This affiliate application is on hold or needs a current agreement acceptance. Contact support for help continuing.');
        } else {
          setError(payload?.error ?? 'We could not activate your affiliate workspace. Please try again.');
        }
        return;
      }
      if (payload.status !== 'active' || (payload.trialEndsAt !== null && typeof payload.trialEndsAt !== 'string')) {
        setError('The server returned an unexpected activation response. Please try again or contact support.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/accounts/me'] });
      setActivationTrialEndsAt(payload.trialEndsAt ?? null);
      setActivationSuccess(true);
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : 'We could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [getToken, queryClient, submitting]);

  const submit = useCallback(async () => {
    if (!canSubmit || !termsVersion) return;
    setSubmitting(true);
    setError(null);
    const acceptedAt = new Date().toISOString();
    let registered = false;
    try {
      const token = await getToken();
      if (!token) throw new Error('Your secure session is unavailable. Please sign in again.');
      const response = await fetch('/api/accounts/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          identifierType,
          ccn: needsIdentifier ? identifier.trim() : undefined,
          facilityName: facilityName.trim(),
          facilityType: facilityType || undefined,
          state: state.trim() || undefined,
          city: city.trim() || undefined,
          referralCode: referralCode ?? undefined,
          termsVersion,
          acceptedAt,
          acceptsTerms: termsChecked && termsScrolled,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.code === 'AFFILIATE_EMAIL_UNVERIFIED') {
          setVerificationRequired(true);
          setError('Verify your email address to continue. Check your inbox and junk folder for the Clerk verification message.');
          return;
        }
        setError(
          payload?.error ??
            'We could not complete your registration. Please check the details and try again.',
        );
        return;
      }
      registered = true;
      // Registration and its initial receipt are committed together by the
      // server. This idempotent POST confirms the receipt and retries a
      // transient 409 if the account link has not yet become visible.
      let accepted = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const acceptance = await fetch('/api/accounts/terms-acceptance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ termsVersion, acceptedAt }),
        });
        if (acceptance.ok) {
          accepted = true;
          break;
        }
        if (acceptance.status === 409 && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        break;
      }
      if (!accepted) {
        // Do not claim acceptance or send the customer to checkout on failure.
        // The account already exists: the dedicated clickwrap page can recover.
        setLocation(identifierType === 'consultant'
          ? '/accept-terms?recording=failed'
          : '/accept-terms?registration=direct&recording=failed');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/accounts/me'] });
      setLocation('/billing');
    } catch {
      if (registered) {
        // A lost acceptance response must not invite a second registration.
        setLocation(identifierType === 'consultant'
          ? '/accept-terms?recording=failed'
          : '/accept-terms?registration=direct&recording=failed');
      } else {
        setError('We could not reach the server. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit, getToken, identifierType, needsIdentifier, identifier,
    facilityName, facilityType, state, city, referralCode, setLocation, termsVersion, queryClient,
  ]);

  if (!isLoaded) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-slate-600">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell>
        <p className="text-slate-700">Please sign in to register your organization.</p>
      </Shell>
    );
  }

  if (affiliateSignup && accountQuery.isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-slate-600" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Checking your existing account…</span>
        </div>
      </Shell>
    );
  }

  if (affiliateSignup && accountQuery.isError) {
    return (
      <Shell>
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm leading-6 text-red-900">
          {accountQuery.error instanceof Error ? accountQuery.error.message : 'Could not check your existing account.'}
          <button type="button" data-testid="button-retry-account-check" onClick={() => void accountQuery.refetch()} className="ml-3 font-semibold underline">
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  if (affiliateEmailMismatch) {
    return (
      <Shell>
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm sm:p-8" role="alert" data-testid="panel-affiliate-email-mismatch">
          <h1 className="text-2xl font-bold text-slate-950">Your signed-in email is different</h1>
          <p className="mt-3 text-sm leading-6 text-slate-800">
            This affiliate link was created for {affiliateHandoffEmail}, but your signed-in Clerk account uses {user?.primaryEmailAddress?.emailAddress}. We can only activate an application that matches your verified primary email exactly (ignoring capitalization). We will not link an application to a different account.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <a href={reapplyUrl} data-testid="link-reapply-verified-email" className="font-semibold text-teal-800 underline">
              Apply again using {user?.primaryEmailAddress?.emailAddress}
            </a>
            <Link href={`/register?${correctedHandoff}`} className="font-semibold text-teal-800 underline">
              I already applied with this signed-in email
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-700">If the application email belongs to another account, sign out and sign in with that account instead.</p>
        </section>
      </Shell>
    );
  }

  if (affiliateSignup && accountQuery.data?.accountUser) {
    if (activationSuccess) {
      return (
        <Shell>
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 shadow-sm sm:p-8" role="status" data-testid="status-affiliate-active">
            <h1 className="text-2xl font-bold text-emerald-950">Your affiliate workspace is active</h1>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              Your affiliate account is activated{activationTrialEndsAt
                ? ` and your workspace trial ends ${new Date(activationTrialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : ''}. Continue to your partner portal to manage your referrals.
            </p>
            <Link href="/partners/portal" data-testid="link-partner-portal" className="mt-5 inline-flex rounded-lg bg-teal-800 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-900">
              Open partner portal
            </Link>
          </section>
        </Shell>
      );
    }
    return (
      <Shell>
        <section className="rounded-2xl border border-teal-300 bg-teal-50 p-6 shadow-sm sm:p-8" data-testid="panel-affiliate-continuation">
          <h1 className="text-2xl font-bold text-slate-950">Continue your affiliate signup</h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            You already have a CMS Compliance Suite account. Activate the affiliate enrollment on this account to continue—no second workspace registration is needed.
          </p>

          {verificationRequired && (
            <div className="mt-5 space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="panel-email-verification">
              <p className="text-sm leading-6 text-amber-950">
                Check your inbox and junk folder for a Clerk verification email. You can resend the code, then enter it here to verify the exact email on your account.
              </p>
              {verificationMessage && <p className="text-sm text-emerald-800" role="status" data-testid="status-verification">{verificationMessage}</p>}
              <button type="button" data-testid="button-resend-verification" onClick={() => void sendVerificationCode()} disabled={verificationSending} className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50">
                {verificationSending ? 'Sending…' : 'Resend verification code'}
              </button>
              <label className="block text-sm font-semibold text-slate-900" htmlFor="affiliate-verification-code">Verification code</label>
              <input id="affiliate-verification-code" data-testid="input-verification-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} autoComplete="one-time-code" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <button type="button" data-testid="button-verify-email" onClick={() => void verifyEmailCode()} disabled={verificationSending || !verificationCode.trim()} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Verify email
              </button>
            </div>
          )}

          {error && <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900" data-testid="error-affiliate-activation">{error}</div>}
          {error?.includes('different email') && verifiedEmailAddress && (
            <a href={reapplyUrl} data-testid="link-reapply-verified-email" className="mt-4 inline-flex font-semibold text-teal-800 underline">
              Reapply using {verifiedEmailAddress.emailAddress}
            </a>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" data-testid="button-activate-affiliate" onClick={() => void activateAffiliate()} disabled={submitting || verificationRequired} className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300">
              {submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Activating…' : emailVerifiedForRetry ? 'Retry affiliate activation' : 'Activate affiliate account'}
            </button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 rounded-xl border border-teal-300 bg-teal-50 p-5">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 flex-none text-teal-800" aria-hidden="true" />
          <div className="text-sm leading-6 text-teal-950">
            <p className="font-semibold">{affiliateSignup ? 'Finish your affiliate workspace setup' : identifierType === 'consultant' ? 'Activate your affiliate workspace' : 'Register your organization'}</p>
            <p className="mt-1">
              {affiliateSignup ? (
                <>
                  Your current affiliate agreement acceptance is recorded. Confirm the workspace name and accept
                  the current Terms of Service to activate your affiliate membership at 20% and start the 30-day,
                  no-card workspace trial. This creates your workspace in the same secure signup flow.
                </>
              ) : identifierType === 'consultant' ? (
                <>
                  Affiliates who accepted the current agreement can activate with a 30-day workspace
                  trial and no payment method. We verify your Clerk email against the affiliate enrollment.
                </>
              ) : (
                <>
                   After registration, add a payment method through secure
                  checkout to start your 30-day free trial. Your subscription will be charged on
                  day 31 unless you cancel before then.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {!affiliateSignup && <fieldset>
          <legend className="text-sm font-semibold text-slate-900">
            Which identifier does your organization hold?
          </legend>
          <div className="mt-3 space-y-2">
            {IDENTIFIER_CHOICES.map((entry) => (
              <label
                key={entry.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-[15px] leading-6 text-slate-800 hover:border-slate-300 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
              >
                <input
                  type="radio"
                  name="identifierType"
                  value={entry.value}
                  checked={identifierType === entry.value}
                  onChange={() => {
                    setIdentifierType(entry.value);
                    setIdentifier('');
                    setError(null);
                  }}
                  className="mt-1 h-4 w-4 flex-none border-slate-400 text-teal-800 focus:ring-teal-700"
                />
                <span>
                  <span className="font-medium">{entry.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{entry.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>}

        {needsIdentifier ? (
          <Field
            id="identifier"
            label={choice.label}
            value={identifier}
            onChange={setIdentifier}
            placeholder={choice.placeholder}
            required
            autoComplete="off"
          />
        ) : null}

        <Field
          id="facilityName"
          label="Organization name"
          value={facilityName}
          onChange={setFacilityName}
          placeholder="Mercy General Hospital"
          required
          autoComplete="organization"
        />

        <div>
          <label htmlFor="facilityType" className="block text-sm font-semibold text-slate-900">
            Provider type <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <select
            id="facilityType"
            value={facilityType}
            onChange={(event) => setFacilityType(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
          >
            <option value="">Select a provider type…</option>
            {providerTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {identifierType === 'ccn' ? (
            <p className="mt-1.5 text-sm text-slate-600">
              Ambulatory surgical centers have a ten-character CCN; every other provider type
              has six. Selecting your type lets us check the number you entered.
            </p>
          ) : null}
          {contentPending ? (
            <p className="mt-1.5 text-sm text-amber-800">
              Verified CMS content for this provider type is still being added. You can register
              now, but document generation for it is not yet available.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="city"
            label="City"
            optional
            value={city}
            onChange={setCity}
            placeholder="Miami"
            autoComplete="address-level2"
          />
          <Field
            id="state"
            label="State"
            optional
            value={state}
            onChange={setState}
            placeholder="FL"
            autoComplete="address-level1"
          />
        </div>

        {referralCode ? (
          <p className="text-sm text-slate-600">
            Referred by <span className="font-medium text-slate-900">{referralCode}</span>.
          </p>
        ) : null}

        <section aria-labelledby="registration-terms-heading">
          <h2 id="registration-terms-heading" className="text-lg font-semibold text-slate-950">
            Terms of Service
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Read the full Terms below. Your acceptance will be recorded when your organization is registered.
          </p>
          {termsVersion ? (
            <>
              <div
                ref={termsRef}
                onScroll={handleTermsScroll}
                tabIndex={0}
                aria-label="Terms of Service"
                className="mt-4 h-80 overflow-y-auto rounded-xl border border-slate-200 p-5 focus:outline-none focus:ring-2 focus:ring-teal-700"
              >
                <TermsDocument version={termsVersion} />
              </div>
              {!termsScrolled && <p className="mt-2 text-sm text-slate-600">Scroll to the end of the Terms to continue.</p>}
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-800">
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(event) => setTermsChecked(event.target.checked)}
                  className="mt-1 size-4 accent-teal-800"
                />
                <span>I have read and agree to the Terms of Service, and I am authorized to accept them on behalf of this organization.</span>
              </label>
            </>
          ) : error ? (
            <p className="mt-3 text-sm text-red-800">Please refresh this page before registering.</p>
          ) : <p className="mt-3 text-sm text-slate-600" role="status">Loading current Terms…</p>}
        </section>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {verificationRequired && (
          <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="panel-email-verification">
            <p className="text-sm leading-6 text-amber-950">
              Check your inbox and junk folder for a Clerk verification email. Resend a code if needed, then verify your email before retrying registration.
            </p>
            {verificationMessage && <p role="status" className="text-sm text-emerald-800" data-testid="status-verification">{verificationMessage}</p>}
            <button type="button" data-testid="button-resend-verification" onClick={() => void sendVerificationCode()} disabled={verificationSending} className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50">
              {verificationSending ? 'Sending…' : 'Resend verification code'}
            </button>
            <Field id="registration-verification-code" label="Verification code" value={verificationCode} onChange={setVerificationCode} autoComplete="one-time-code" />
            <button type="button" data-testid="button-verify-email" onClick={() => void verifyEmailCode()} disabled={verificationSending || !verificationCode.trim()} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Verify email
            </button>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating your account…
              </>
            ) : (
              'Create account'
            )}
          </button>
          <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Cancel
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 text-sm leading-6 text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-slate-400" aria-hidden="true" />
        <p>
          One organization, one account. If your organization is already registered, ask an
          administrator on that account to invite you rather than registering again.
        </p>
      </div>
    </Shell>
  );
}

function Field({
  id, label, value, onChange, placeholder, required, optional, autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : null}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
      />
    </div>
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
      <main className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
