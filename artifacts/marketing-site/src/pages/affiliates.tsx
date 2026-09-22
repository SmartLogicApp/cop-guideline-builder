import { useState } from 'react';
import { Link } from 'wouter';
import { CONTACT_EMAIL_SUPPORT } from '@/lib/contact';

/**
 * The public front door to the affiliate programme.
 *
 * Deliberately NOT behind authentication. An affiliate is not a customer —
 * requiring a subscription to apply would exclude exactly the consultants and
 * associations the programme is meant to reach.
 *
 * What this page must not do is over-promise. The commission schedule steps
 * down 20% → 10% → 0% if an affiliate stops referring, and there is a 60-day
 * holdback before anything is payable. Both are stated here rather than
 * discovered after signing, because an affiliate who learns about the step-down
 * when their rate drops is an affiliate who tells other people about it.
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/affiliates/apply`.replace(/\/\/api/, '/api'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'We could not record your application.');
      setStatus('sent');
    } catch (submitError) {
      setStatus('error');
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    }
  }

  const input =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 ' +
    'placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20';
  const label = 'block text-sm font-semibold text-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-9 w-9" />
            <span className="font-bold text-slate-950">CMS Compliance Suite</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-teal-800 hover:text-teal-950">
            Back to website
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Affiliate Partner Program
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-7 text-slate-700">
          If you advise healthcare facilities on CMS survey readiness — as a consultant, an association,
          or a quality-improvement group — you can earn recurring commission on the facilities you refer
          to CMS Compliance Suite.
        </p>

        {/* The numbers, stated plainly and including the ones that reduce pay. */}
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { figure: '20%', label: 'of qualifying subscription revenue', tone: 'text-teal-800' },
            { figure: 'Recurring', label: 'for as long as your referral keeps paying', tone: 'text-slate-900' },
            { figure: 'Quarterly', label: 'payouts, $100 minimum', tone: 'text-slate-900' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className={`text-2xl font-extrabold ${item.tone}`}>{item.figure}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">{item.label}</div>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-slate-950">How it works</h2>
          <ol className="mt-4 space-y-4">
            {[
              ['Apply below.', 'We review every application by hand. There is no automatic approval.'],
              ['You get a referral link.', 'A unique code we assign to you. Anyone who registers through your link is attributed to you permanently — attribution is captured at signup and never changes afterwards.'],
              ['You earn on what they pay.', '20% of qualifying subscription revenue, for as long as that customer keeps their subscription.'],
              ['We pay quarterly.', 'Commissions become payable 60 days after the customer’s payment, then pay out at the end of the quarter once your balance reaches $100. Anything below that carries forward.'],
            ].map(([title, detail], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="text-[15px] leading-7 text-slate-700">
                  <strong className="font-semibold text-slate-950">{title}</strong> {detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/*
          The terms that reduce pay, stated before anyone signs rather than
          discovered afterwards. An affiliate who finds out about the step-down
          when their rate drops is an affiliate who tells people about it.
        */}
        <section className="mt-10 rounded-xl border border-amber-300 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-950">Terms worth knowing before you apply</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
            <li>
              <strong>Staying active matters.</strong> The programme expects at least one new qualifying
              referral every twelve months. Miss that, and after a 60-day grace period your rate on future
              revenue steps down from 20% to 10%, and after another such period to 0%. Commissions you have
              already earned are never reduced retroactively.
            </li>
            <li>
              <strong>There is a 60-day holdback.</strong> A commission is recorded when your referral pays,
              but becomes payable 60 days later — so refunds and chargebacks can be settled before money moves.
            </li>
            <li>
              <strong>Refunds reverse commission.</strong> If a customer is refunded or charges back, the
              commission on that payment is cancelled or deducted from a future payout.
            </li>
            <li>
              <strong>You cannot refer yourself.</strong> Referring your own organization, or creating an
              account in another organization&rsquo;s name to generate commission, ends participation.
            </li>
            <li>
              <strong>No patient information, ever.</strong> Nothing about the programme involves PHI, and
              affiliates never receive customer content, usage data, or billing details.
            </li>
          </ul>
          <p className="mt-3 text-xs leading-5 text-amber-900">
            The full Affiliate Program Agreement is provided before enrollment is finalized. These points
            summarize it; the Agreement governs.
          </p>
        </section>

        {/* Application form */}
        <section id="apply" className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {status === 'sent' ? (
            <div role="status">
              <h2 className="text-xl font-bold text-slate-950">Application received</h2>
              <p className="mt-3 text-[15px] leading-7 text-slate-700">
                Thank you. We review applications by hand, so you will hear from us by email rather than
                immediately. If you need to add anything, reply to us at{' '}
                <a className="font-semibold text-teal-800 underline underline-offset-4" href={`mailto:${CONTACT_EMAIL_SUPPORT}`}>
                  {CONTACT_EMAIL_SUPPORT}
                </a>
                .
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Your referral code is assigned when your application is approved — it is not chosen at
                application time.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-950">Apply to the program</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Every application is reviewed by a person. Applying does not create an account or grant
                access to the Service.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="companyName">
                      Company or practice name <span className="text-teal-800">*</span>
                    </label>
                    <input
                      id="companyName" required maxLength={200} className={input}
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      placeholder="North Star Compliance Consulting"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="contactName">Your name</label>
                    <input
                      id="contactName" maxLength={200} className={input}
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
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
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="phone">Phone</label>
                    <input
                      id="phone" maxLength={50} className={input}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className={label} htmlFor="about">
                    Who do you work with, and how would you refer them?
                  </label>
                  <textarea
                    id="about" rows={4} maxLength={2000} className={input}
                    value={form.about}
                    onChange={(e) => setForm({ ...form, about: e.target.value })}
                    placeholder="e.g. We consult for 40 rural critical access hospitals across the Southeast and run quarterly survey-readiness workshops."
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="rounded-lg bg-teal-800 px-6 py-3 text-[15px] font-bold text-white hover:bg-teal-900 disabled:opacity-60"
                  >
                    {status === 'sending' ? 'Sending…' : 'Submit application'}
                  </button>
                  <p className="text-xs text-slate-500">
                    We use this only to review your application and contact you about the program.
                  </p>
                </div>
              </form>
            </>
          )}
        </section>

        <p className="mt-8 text-sm text-slate-600">
          Questions first?{' '}
          <a className="font-semibold text-teal-800 underline underline-offset-4" href={`mailto:${CONTACT_EMAIL_SUPPORT}?subject=Affiliate%20Program%20question`}>
            {CONTACT_EMAIL_SUPPORT}
          </a>
        </p>
      </main>

      <footer className="border-t bg-white py-8">
        <div className="container mx-auto flex max-w-4xl flex-col gap-2 px-4 text-sm text-slate-600 sm:px-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal and support">
            <a href={siteUrl('/terms')} className="hover:text-slate-950">Terms of Service</a>
            <a href={siteUrl('/privacy')} className="hover:text-slate-950">Privacy Policy</a>
            <a href={siteUrl('/affiliates')} className="font-semibold text-teal-800">Affiliate Program</a>
          </nav>
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} CMS Compliance Guardian LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
