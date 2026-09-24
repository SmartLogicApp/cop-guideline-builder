import { CONTACT_EMAIL_SUPPORT } from '@/lib/contact';
import { Link } from 'wouter';
import { TermsDocument } from '@/components/terms-document';

const supportEmail = CONTACT_EMAIL_SUPPORT;
const siteUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

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
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <TermsDocument />
        </article>
      </main>

      <footer className="border-t bg-white py-8">
        <div className="container mx-auto flex max-w-4xl flex-col gap-4 px-4 text-sm text-slate-600 sm:px-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal and support">
            <a href={siteUrl('/terms')} className="font-semibold text-teal-800">Terms of Service</a>
            <a href={siteUrl('/privacy')} className="hover:text-slate-950">Privacy Policy</a>
            <a href={`${siteUrl('/terms')}#billing`} className="hover:text-slate-950">Billing &amp; Cancellation</a>
            <a href={`mailto:${supportEmail}`} className="hover:text-slate-950">Support</a>
          </nav>
          <p>© {new Date().getFullYear()} CMS Compliance Guardian LLC.</p>
        </div>
      </footer>
    </div>
  );
}