import { Link } from 'wouter';
import { termsV1 } from '@/legal/terms-v1';
import type { ReactNode } from 'react';

const supportEmail = 'CMSComplianceGaurdian@outlook.com';

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>
      : part,
  );
}

function TermsDocument() {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-700">
      {termsV1.split('\n').map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-1" aria-hidden="true" />;
        if (line === '---') return <hr key={index} className="my-7 border-slate-200" />;
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          const title = line.slice(3);
          const id = title.startsWith('13.') ? 'billing' : undefined;
          return <h2 key={index} id={id} className="scroll-mt-8 pt-7 text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>;
        }
        if (line.startsWith('- ')) {
          return <div key={index} className="flex gap-3 pl-2"><span aria-hidden="true">•</span><p>{renderInline(line.slice(2))}</p></div>;
        }
        if (line.startsWith('> ')) {
          return <blockquote key={index} className="my-4 border-l-4 border-teal-700 bg-teal-50 px-5 py-3 text-slate-800">{renderInline(line.slice(2))}</blockquote>;
        }
        if (line.startsWith('|')) {
          return <pre key={index} className="overflow-x-auto rounded bg-slate-50 px-3 py-1 text-xs text-slate-700">{line}</pre>;
        }
        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export default function TermsPage() {
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
        <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Pre-launch billing notice:</strong> Stripe checkout, paid subscriptions, automatic renewals,
          and token billing are not currently active. Sections 13–15 reserve space for billing terms that
          will be presented before any paid service begins.
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <TermsDocument />
        </article>
      </main>

      <footer className="border-t bg-white py-8">
        <div className="container mx-auto flex max-w-4xl flex-col gap-4 px-4 text-sm text-slate-600 sm:px-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal and support">
            <a href="/terms" className="font-semibold text-teal-800">Terms of Service</a>
            <a href="/terms#privacy" className="hover:text-slate-950">Privacy Policy</a>
            <a href="/terms#billing" className="hover:text-slate-950">Billing &amp; Cancellation</a>
            <a href={`mailto:${supportEmail}`} className="hover:text-slate-950">Support</a>
          </nav>
          <p>© {new Date().getFullYear()} CMS Compliance Guardian LLC.</p>
        </div>
      </footer>
    </div>
  );
}