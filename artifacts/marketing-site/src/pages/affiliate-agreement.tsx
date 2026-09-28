import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';

type Agreement = { version: string; body: string; companyName: string; suggestedSigner: string };
const apiUrl = `${import.meta.env.BASE_URL}api/affiliates/agreements`;

export default function AffiliateAgreementPage() {
  const [token] = useState(() => {
    const match = /^#token=([a-f0-9]{64})$/.exec(window.location.hash);
    // The fragment never reaches the server, and removing it avoids retaining
    // the invitation in screenshots or browser history after the page loads.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return match?.[1] ?? '';
  });
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [createLoginUrl, setCreateLoginUrl] = useState('');

  useEffect(() => {
    if (!token) { setError('This invitation link is invalid. Ask the administrator for a new one.'); return; }
    const controller = new AbortController();
    fetch(`${apiUrl}/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }), signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('This invitation has expired or is no longer valid. Ask for a new one.');
      return response.json() as Promise<Agreement>;
    }).then((document) => {
      setAgreement(document);
      setName(document.suggestedSigner);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [token]);

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!agreement || !agreed) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signerName: name, agreed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not record acceptance.');
      if (typeof result.signUpUrl === 'string') setCreateLoginUrl(result.signUpUrl);
      setCompleted(true);
      setAgreement(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not record acceptance.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
      <Link href="/" className="text-sm font-semibold text-teal-800">CMS Compliance Suite</Link>
      <h1 className="mt-6 text-3xl font-bold">Affiliate agreement</h1>
      {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
      {completed
         ? <div role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-green-900">
             <p>Your acceptance was recorded. Create a secure account using the email on your application to activate your affiliate account and start your 30-day workspace access.</p>
             {createLoginUrl && <a href={createLoginUrl} className="mt-4 inline-flex rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white">
               Create your secure login
             </a>}
           </div>
        : agreement
          ? <form onSubmit={accept} className="mt-6 space-y-6">
              <p className="text-sm">For {agreement.companyName} · Agreement version {agreement.version}</p>
              <p className="text-sm text-slate-600">
                The applicant's business name shown above will be recorded with this acceptance.
              </p>
              <div tabIndex={0} aria-label="Full affiliate agreement" className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-slate-50 p-5 text-sm leading-7">
                {agreement.body}
              </div>
              <label className="block text-sm font-semibold">Your full name
                <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={200}
                  required className="mt-2 block w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="flex gap-3 text-sm">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required />
                I have read and agree to the affiliate agreement version {agreement.version} on behalf of the applicant.
              </label>
              <button disabled={busy || !agreed} className="rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white disabled:opacity-50">
                {busy ? 'Recording…' : 'Accept agreement'}
              </button>
            </form>
          : !error && <p role="status" className="mt-5">Loading your agreement…</p>}
    </div>
  </main>;
}