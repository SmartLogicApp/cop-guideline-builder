import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import { AlertCircle, Building2, LoaderCircle, ShieldCheck } from 'lucide-react';

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
    hint: 'For approved, active affiliates only. We will issue you an account identifier.',
    placeholder: '',
  },
];

export default function RegisterPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  const [identifierType, setIdentifierType] = useState<IdentifierType>('ccn');
  const [identifier, setIdentifier] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');

  const [providerTypes, setProviderTypes] = useState<ProviderType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!isLoaded || !isSignedIn) return;
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
  }, [isLoaded, isSignedIn, getToken]);

  const choice = useMemo(
    () => IDENTIFIER_CHOICES.find((entry) => entry.value === identifierType)!,
    [identifierType],
  );

  const needsIdentifier = identifierType !== 'consultant';
  const canSubmit =
    facilityName.trim().length > 0 &&
    (!needsIdentifier || identifier.trim().length > 0) &&
    !submitting;

  const selectedProvider = providerTypes.find((type) => type.value === facilityType);
  const contentPending =
    selectedProvider?.contentStatus != null && selectedProvider.contentStatus !== 'verified';

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
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
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          payload?.error ??
            'We could not complete your registration. Please check the details and try again.',
        );
        return;
      }
      // Registration is what the acceptance is recorded against, so the Terms
      // come next. Without this the acceptance page is unreachable.
      setLocation(identifierType === 'consultant'
        ? '/accept-terms'
        : '/accept-terms?registration=direct');
    } catch {
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit, getToken, identifierType, needsIdentifier, identifier,
    facilityName, facilityType, state, city, referralCode, setLocation,
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

  return (
    <Shell>
      <div className="mb-6 rounded-xl border border-teal-300 bg-teal-50 p-5">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 flex-none text-teal-800" aria-hidden="true" />
          <div className="text-sm leading-6 text-teal-950">
            <p className="font-semibold">Register your organization</p>
            <p className="mt-1">
              {identifierType === 'consultant' ? (
                <>
                  Approved, active affiliates can create a consultant account with a 30-day trial
                  and no payment method. Consultant registration is verified by our server. You
                  will be asked to accept the Terms of Service next.
                </>
              ) : (
                <>
                  After accepting the Terms of Service, add a payment method through secure
                  checkout to start your 30-day free trial. Your subscription will be charged on
                  day 31 unless you cancel before then.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <fieldset>
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
        </fieldset>

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

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

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
