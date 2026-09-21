import { CONTACT_EMAIL_SUPPORT, mailto } from '@/lib/contact';
import { Link } from 'wouter';

const siteUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

const sections = [
  ['1. Overview', 'This Privacy Policy explains how CMS Compliance Guardian LLC handles information in CMS Compliance Suite. We collect only information reasonably necessary to operate, secure, and support the Service.'],
  ['2. Account information', 'Clerk handles registration and authentication and may process your email address, name, hashed credentials, authentication tokens, and session metadata. We receive a Clerk user identifier but do not receive your plaintext password.'],
  ['3. Facility and service data', 'We may store account identifiers, contact details, facility name, CMS Certification Number when provided, trial or access status, token-usage metadata, and security or login-event metadata. Paid billing records will be collected only after payment processing is activated.'],
  ['4. Temporary policy and analysis data', 'Uploaded policy files are parsed in your browser. Extracted policy text, organization-specific analysis, and generated recommendations are held in temporary browser session storage for up to 30 minutes, are cleared on logout, and normally end when the browser tab session ends. They are not intentionally stored in the permanent application database or object storage. Download any result you want to keep.'],
  ['5. AI processing', 'Text submitted for analysis is sent to Anthropic solely to perform the requested processing. CMS Compliance Guardian LLC does not use Customer Content to train its own AI models. Anthropic handles API data under its applicable commercial terms and privacy documentation. Do not submit PHI or content you are not authorized to process.'],
  ['6. Regulatory data', 'The Service may retrieve public regulatory text from eCFR.gov. Personal information is not intentionally included in those regulatory-source requests.'],
  ['7. Cookies and tracking', 'Clerk authentication uses technical session cookies. We do not intentionally use advertising cookies, tracking pixels, or third-party advertising analytics. Replit may use technical cookies necessary to host and operate the Service.'],
  ['8. Data security', 'We use reasonable safeguards appropriate for the information the Service is designed to process. No system is perfectly secure, and the Service is not designed or authorized for PHI or ePHI.'],
  ['9. Children', 'The Service is intended for business and healthcare-compliance professionals and is not directed to children under 13.'],
  ['10. Privacy requests', 'To request access, correction, or deletion of eligible account information, contact CMSComplianceGuardian@Outlook.com. Some records may be retained where required by law or reasonably needed for security, disputes, or future billing compliance. We do not sell personal information.'],
  ['11. Changes', 'We may update this policy and will identify the current publication date. Material changes may be communicated through the Service or the email associated with your account.'],
];

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
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: September 7, 2026</p>
          <div className="mt-10 space-y-8 text-[15px] leading-7 text-slate-700">
            {sections.map(([title, body]) => (
              <section key={title}>
                <h2 className="text-xl font-bold text-slate-950">{title}</h2>
                <p className="mt-2">{body}</p>
              </section>
            ))}
          </div>
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