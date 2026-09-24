import type { ReactNode } from 'react';
import { termsV1 } from 'virtual:public-terms-v1';
import { termsV4 } from '@/legal/terms-v4';

/**
 * The single renderer for the Terms document.
 *
 * Extracted from the public terms page so the acceptance screen and the public
 * page cannot drift. A customer must be able to prove that what they agreed to
 * is what is published, and two copies of this markup would eventually differ.
 *
 * Future published versions must be added here and in the API registry together.
 * Keep past entries readable: the acceptance gate records their version keys.
 */

const DOCUMENTS: Record<string, string> = {
  // 1.0 and 1.1 render the same source. The 1.1 change was to the scope of the
  // licence and the contact addresses, both of which live in the source
  // document, so there is one file and two version labels pointing at it —
  // rather than a frozen copy of 1.0, which would immediately drift.
  //
  // This is correct only while no customer has accepted 1.0 against a document
  // that has since changed. If that ever stops being true, 1.0 must be snapshot
  // to its own file before the shared source is edited again.
  '2026-08-13': termsV1,
  '2026-09-21': termsV1,
  '2026-09-23': termsV4,
};

export const CLIENT_CURRENT_TERMS_VERSION = '2026-09-23';

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>
      : part,
  );
}

export function TermsDocument({ version }: { version?: string }) {
  const source = DOCUMENTS[version ?? CLIENT_CURRENT_TERMS_VERSION];

  if (!source) {
    return (
      <p className="text-[15px] leading-7 text-slate-700">
        This version of the Terms is not available to display. Please contact support.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-700">
      {source.split('\n').map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-1" aria-hidden="true" />;
        if (line === '---') return <hr key={index} className="my-7 border-slate-200" />;
        if (line === 'TERMS OF SERVICE' && (version ?? CLIENT_CURRENT_TERMS_VERSION) === '2026-09-23') {
          return <h1 key={index} className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{line}</h1>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          const title = line.slice(3);
          const id = title.startsWith('13.') || title.startsWith('6. FEES') ? 'billing' : undefined;
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
