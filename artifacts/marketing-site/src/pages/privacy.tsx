import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { privacyV2 } from '@/legal/privacy-v2';
import { CONTACT_EMAIL_SUPPORT, mailto } from '@/lib/contact';

// Privacy Policy Version 2.0, effective September 23, 2026.
// The source string is the owner's exact approved text; render Markdown
// formatting without altering its wording or replacing the source.
const PRIVACY_POLICY_VERSION = '2.0';

const siteUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>;
    }
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (match) {
      const [, label, sourceHref] = match;
      // The approved source retains its literal citation URL, while the
      // requested Stripe Privacy Policy link points to Stripe's canonical page.
      const href = label === 'Stripe Privacy Policy' ? 'https://stripe.com/privacy' : sourceHref;
      if (href.startsWith('https://') || href.startsWith('mailto:')) {
        return <a key={index} href={href} className="font-medium text-teal-800 underline underline-offset-2">{label}</a>;
      }
    }
    return part;
  });
}

function PrivacyDocument() {
  return <div className="space-y-3 text-[15px] leading-7 text-slate-700">
    {privacyV2.split('\n').map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return <div key={index} className="h-1" aria-hidden="true" />;
      if (line === '---') return <hr key={index} className="my-7 border-slate-200" />;
      if (line.startsWith('# ')) return <h1 key={index} className="pt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{line.slice(2)}</h1>;
      if (line.startsWith('## ')) return <h2 key={index} className="scroll-mt-8 pt-7 text-xl font-bold text-slate-950 sm:text-2xl">{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={index} className="pt-5 text-lg font-semibold text-slate-950">{line.slice(4)}</h3>;
      if (line.startsWith('* ') || line.startsWith('- ')) return <div key={index} className="flex gap-3 pl-2"><span aria-hidden="true">•</span><p>{inline(line.slice(2))}</p></div>;
      if (line.startsWith('|')) return <pre key={index} className="overflow-x-auto rounded bg-slate-50 px-3 py-1 text-xs text-slate-700">{line}</pre>;
      return <p key={index}>{inline(line)}</p>;
    })}
  </div>;
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" className="font-bold text-slate-950">CMS Compliance Suite</Link>
          <Link href="/" className="text-sm font-semibold text-teal-800">Back to website</Link>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10" data-privacy-version={PRIVACY_POLICY_VERSION}>
          <PrivacyDocument />
        </article>
      </main>
      <footer className="border-t bg-white py-8">
        <nav className="container mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-2 px-4 text-sm text-slate-600 sm:px-6" aria-label="Legal and support">
          <a href={siteUrl('/terms')} className="hover:text-slate-950">Terms of Service</a>
          <a href={siteUrl('/privacy')} className="font-semibold text-teal-800">Privacy Policy</a>
          <a href={`${siteUrl('/terms')}#billing`} className="hover:text-slate-950">Billing &amp; Cancellation</a>
          <a href={mailto(CONTACT_EMAIL_SUPPORT)} className="hover:text-slate-950">Support</a>
        </nav>
      </footer>
    </div>
  );
}