import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { CONTACT_EMAIL_SUPPORT } from '@/lib/contact';
import { canSubmitApplication, type ApplicationAgreement } from './affiliates-agreement';

/**
 * The public front door to the affiliate and vendor programme.
 *
 * Deliberately NOT behind authentication. An affiliate is not a customer —
 * requiring a subscription to apply would exclude exactly the consultants and
 * associations the programme is meant to reach.
 */

const siteUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function AffiliatesPage() {
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    about: '',
  });
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [agreement, setAgreement] = useState<ApplicationAgreement | null>(null);
  const [agreementError, setAgreementError] = useState('');
  const [agreementLoading, setAgreementLoading] = useState(true);
  const [agreementRefresh, setAgreementRefresh] = useState(0);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setAgreementLoading(true);
    setAgreementError('');
    setAgreement(null);
    setAgreed(false);
    fetch(`${import.meta.env.BASE_URL}api/affiliates/agreements/application`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('The current agreement is unavailable. Please try again later.');
      const document = await response.json() as ApplicationAgreement;
      if (typeof document.version !== 'string' || !document.version
        || typeof document.body !== 'string' || !document.body
        || !/^[a-f0-9]{64}$/.test(document.contentSha256)) {
        throw new Error('The current agreement could not be verified. Please try again later.');
      }
      if (!controller.signal.aborted) setAgreement(document);
    }).catch((failure) => {
      if (!controller.signal.aborted) setAgreementError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setAgreementLoading(false);
    });
    return () => controller.abort();
  }, [agreementRefresh]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmitApplication(agreement, agreed, agreementLoading) || !agreement) return;
    setStatus('sending');
    setError('');
    const attemptReference = crypto.randomUUID();
    setReference(attemptReference);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/affiliates/apply`.replace(/\/\/api/, '/api'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Application-Reference': attemptReference },
        body: JSON.stringify({
          ...form, agreed, agreementVersion: agreement.version,
          agreementSha256: agreement.contentSha256,
        }),
      });
      // A rate limiter or proxy might reject the request before the route
      // returns its reference; retain the browser's attempt reference then.
      const serverReference = response.headers.get('X-Application-Reference');
      if (serverReference) setReference(serverReference);
      if (response.status === 409) {
        setAgreed(false);
        setAgreementRefresh((value) => value + 1);
        throw new Error('The agreement changed. Review the current version and accept it again.');
      }
      if (!response.ok) throw new Error('Application submission failed');
      setStatus('sent');
    } catch (failure) {
      setStatus('error');
      setError(failure instanceof Error && failure.message.startsWith('The agreement changed.')
        ? failure.message
        : 'We could not confirm your application. Please try again. If it still fails, contact support and include the attempt reference below.');
    }
  }

  const input =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 ' +
    'placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 bg-white';
  const label = 'block text-sm font-semibold text-slate-800';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" data-testid="link-home">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-9 w-9" />
            <span className="font-bold text-slate-950">CMS Compliance Suite</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-teal-800 hover:text-teal-950" data-testid="link-back">
            Back to website
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 flex-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl" data-testid="text-title">
          Become a Vendor or Affiliate
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-7 text-slate-700" data-testid="text-description">
          If you advise healthcare facilities on CMS survey readiness — as a consultant, an association,
          or a quality-improvement group — we invite you to apply for our referral partnership program.
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-slate-950">How it works</h2>
          <ol className="mt-4 space-y-4">
            <li className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-white">
                1
              </span>
              <p className="text-[15px] leading-7 text-slate-700">
                <strong className="font-semibold text-slate-950">Apply below.</strong> Submit your details and let us know how you plan to refer clients. We review every application manually.
              </p>
            </li>
            <li className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-white">
                2
              </span>
              <p className="text-[15px] leading-7 text-slate-700">
                <strong className="font-semibold text-slate-950">Review & Follow-up.</strong> If there is a mutual fit, our team will reach out to discuss the partnership. Commission details are provided upon approval.
              </p>
            </li>
            <li className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-white">
                3
              </span>
              <p className="text-[15px] leading-7 text-slate-700">
                <strong className="font-semibold text-slate-950">Refer Clients.</strong> Once approved, you will receive resources and a process for attributing your clients to your partnership account.
              </p>
            </li>
          </ol>
        </section>

        {/* Application form */}
        <section id="apply" className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {status === 'sent' ? (
            <div role="status" data-testid="status-success">
              <h2 className="text-xl font-bold text-slate-950">Application received</h2>
              <p className="mt-3 text-[15px] leading-7 text-slate-700">
                Thank you for your interest in partnering with CMS Compliance Suite. We review applications manually, so you will hear from us by email once your application has been evaluated.
              </p>
              <p className="mt-3 text-[15px] leading-7 text-slate-700">
                If you need to add any additional information, please reply to us at{' '}
                <a className="font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-950 transition-colors" href={`mailto:${CONTACT_EMAIL_SUPPORT}`}>
                  {CONTACT_EMAIL_SUPPORT}
                </a>
                .
              </p>
              <p className="mt-3 text-sm text-slate-600" data-testid="application-reference">
                Reference for support: <span className="font-mono break-all">{reference}</span>. This confirms the request was handled, not that a new application was created.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-950">Partnership Application</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Submitting this application does not automatically grant partnership status, create an account, or provide access to the Service. Commission details provided upon approval.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-5" data-testid="form-apply">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="companyName">
                      Company or practice name <span className="text-teal-800">*</span>
                    </label>
                    <input
                      id="companyName" required minLength={2} maxLength={200} className={input}
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      placeholder="North Star Compliance Consulting"
                      data-testid="input-company"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="contactName">
                      Your name <span className="text-teal-800">*</span>
                    </label>
                    <input
                      id="contactName" required minLength={2} maxLength={200} className={input}
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="email">
                      Email <span className="text-teal-800">*</span>
                    </label>
                    <input
                      id="email" type="email" required maxLength={200} className={input}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      data-testid="input-email"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="phone">
                      Phone <span className="text-teal-800">*</span>
                    </label>
                    <input
                      id="phone" type="tel" required minLength={7} maxLength={50} className={input}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      data-testid="input-phone"
                    />
                  </div>
                </div>

                <div>
                  <label className={label} htmlFor="about">
                    How do you plan to refer clients? <span className="text-teal-800">*</span>
                  </label>
                  <textarea
                    id="about" required rows={4} minLength={10} maxLength={2000} className={input}
                    value={form.about}
                    onChange={(e) => setForm({ ...form, about: e.target.value })}
                    placeholder="e.g. We advise rural hospitals and introduce clients through survey-readiness workshops."
                    data-testid="input-about"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-semibold text-slate-900">Affiliate Partner Agreement{agreement ? ` v${agreement.version}` : ''}</h3>
                  {agreementLoading && <p role="status" className="mt-2 text-sm text-slate-600">Loading the current published agreement…</p>}
                  {agreementError && (
                    <div role="alert" className="mt-2 text-sm text-red-800">
                      {agreementError}{' '}
                      <button type="button" className="underline" onClick={() => setAgreementRefresh((value) => value + 1)}>
                        Retry
                      </button>
                    </div>
                  )}
                  {agreement && (
                    <>
                      <div tabIndex={0} aria-label={`Full Affiliate Partner Agreement version ${agreement.version}`}
                        className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800">
                        {agreement.body}
                      </div>
                      <label className="mt-4 flex items-start gap-3 text-sm font-medium text-slate-900">
                        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)}
                          required data-testid="checkbox-agreement" className="mt-1" />
                        I have read and agree to the Affiliate Partner Agreement version {agreement.version} on behalf of the applicant.
                      </label>
                      <p className="mt-2 text-xs text-slate-600">
                        Your acceptance, name, email, time, IP address, and browser information are recorded with this application.
                      </p>
                    </>
                  )}
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="status-error">
                    {error}{' '}
                    <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL_SUPPORT}`}>{CONTACT_EMAIL_SUPPORT}</a>
                    <p className="mt-2">Attempt reference: <span className="font-mono break-all">{reference}</span></p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    disabled={status === 'sending' || !canSubmitApplication(agreement, agreed, agreementLoading)}
                    className="rounded-lg bg-teal-800 px-6 py-3 text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-60 transition-colors"
                    data-testid="button-submit"
                  >
                    {status === 'sending' ? 'Sending...' : 'Submit application'}
                  </button>
                  <p className="text-xs text-slate-500 max-w-sm">
                    We use this information only to review your application and contact you regarding the partnership program.
                  </p>
                </div>
              </form>
            </>
          )}
        </section>

        <p className="mt-8 text-sm text-slate-600">
          Questions first?{' '}
          <a className="font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-900 transition-colors" href={`mailto:${CONTACT_EMAIL_SUPPORT}?subject=Partnership%20question`} data-testid="link-contact">
            {CONTACT_EMAIL_SUPPORT}
          </a>
        </p>
      </main>

      <footer className="border-t bg-white py-8 mt-auto">
        <div className="container mx-auto flex max-w-4xl flex-col gap-2 px-4 text-sm text-slate-600 sm:px-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal and support">
            <a href={siteUrl('/terms')} className="hover:text-slate-950 transition-colors" data-testid="link-terms">Terms of Service</a>
            <a href={siteUrl('/privacy')} className="hover:text-slate-950 transition-colors" data-testid="link-privacy">Privacy Policy</a>
            <a href={siteUrl('/affiliates')} className="font-semibold text-teal-800" data-testid="link-footer-affiliates">Affiliate Program</a>
          </nav>
          <p className="text-xs text-slate-500" data-testid="text-copyright">
            &copy; {new Date().getFullYear()} CMS Compliance Guardian LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
