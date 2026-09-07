import source from '@assets/Pasted--IMPLEMENTATION-NOTE-FOR-REPLIT-AGENT-DO-NOT-DISPLAY-TO_1788789158586.txt?raw';

const publicationDate = 'September 7, 2026';

function buildTerms(): string {
  const start = source.indexOf('# CMS COMPLIANCE SUITE — TERMS OF SERVICE');
  const end = source.indexOf('# ATTORNEY REVIEW NOTES');

  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Terms Version 1.0 source is incomplete.');
  }

  return source
    .slice(start, end)
    .replace('[EFFECTIVE DATE]', publicationDate)
    .replace('[PUBLICATION DATE]', publicationDate)
    .replaceAll('CMSComplianceGuardian@Outlook.com', 'CMSComplianceGaurdian@outlook.com')
    .replaceAll('CMSComplianceGuardianHelp@Outlook.com', 'CMSComplianceGaurdian@outlook.com')
    .replace(
      'By clicking "I Agree," creating an account, completing a purchase, or accessing or using the Service, you accept these Terms and our Privacy Policy.',
      'By creating an account or accessing or using the Service, you accept these Terms and acknowledge our Privacy Policy. Affirmative clickwrap acceptance will be required when paid checkout becomes available.',
    )
    .replace(
      '- **Subscriptions renew automatically** until you cancel. Token usage is billed separately in arrears. You can cancel any time from your account settings. (Sections 13–14)',
      '- **Paid billing is not active yet.** Stripe checkout, paid subscriptions, automatic renewals, and token billing will not begin until they are configured and updated billing terms are presented to you. (Sections 13–15)',
    )
    .replace(
      '(b) the pricing, billing period, and plan details displayed at checkout and in your account ("Order Details"), and (c)',
      '(b) any future pricing, billing period, and plan details displayed at checkout and in your account after paid billing launches ("Order Details"), and (c)',
    )
    .replace(
      '[VERIFY AND NAME THE ACTUAL AI PROVIDER(S) USED, e.g., "Anthropic, PBC." Do not list a provider that is not actually used.]',
      'The current AI provider is Anthropic, PBC.',
    )
    .replace(
      ' [DO NOT STATE THAT COMPANY PERFORMS HUMAN REVIEW UNLESS THE SERVICE ACTUALLY DOES.]',
      ' Company does not perform human review of your Output.',
    )
    .replace(
      ' [STATE THE ACTUAL NUMBER OF AUTHORIZED USERS INCLUDED IN EACH PLAN IF THE APPLICATION ENFORCES A LIMIT.]',
      ' The Service does not currently enforce a published per-plan Authorized User limit.',
    )
    .replace(
      ' [VERIFY THE AI PROVIDER\'S COMMERCIAL API TERMS ON TRAINING AND RETENTION AND STATE THE ACTUAL POSITION IN THE PRIVACY POLICY. DO NOT ASSERT THAT THE PROVIDER DOES NOT TRAIN OR RETAIN UNLESS CONFIRMED.]',
      ' Anthropic processes submitted content under its applicable commercial API terms and privacy documentation; details are described in our Privacy Policy.',
    )
    .replace(
      /\*\*10\.3 Session End\.\*\*[\s\S]*?\n\n\*\*10\.4/,
      '**10.3 Session End.** "Session End" occurs when the temporary browser session expires after 30 minutes, when you explicitly log out, when the browser tab session ends, or when a server-side generation result is retrieved or automatically expires. Closing a browser tab normally ends browser session storage, but browser behavior may vary.\n\n**10.4',
    )
    .replace(
      ' [VERIFY THAT LOGS DO NOT CAPTURE DOCUMENT CONTENTS.]',
      ' Application request logs are designed to record operational metadata rather than the substantive text of uploaded policies or generated Output.',
    )
    .replace(
      /\*\*10\.6 Backups and third parties\.\*\*[\s\S]*?\n\n\*\*10\.7/,
      '**10.6 Backups and third parties.** Substantive Customer Content is processed in temporary browser session storage and transient server memory and is not intentionally written to the application database, permanent object storage, or application backups. Third-party providers retain and delete data under their own terms, as described in the Privacy Policy.\n\n**10.7',
    )
    .replace(
      /## 13\. Fees, Billing, Proration, Token Usage, and Payment[\s\S]*?(?=## 16\. Confidentiality)/,
      `## 13. Fees, Billing, Token Usage, and Payment — Not Yet Active

**13.1 Pre-launch status.** As of the Effective Date, paid checkout and payment processing are not active. The Service does not currently charge maintenance fees, process paid subscriptions, automatically renew subscriptions, collect payment-card information, or invoice Token Usage.

**13.2 Stripe placeholder.** Company intends to use Stripe as its payment processor after the required business and payment-account setup is complete. This statement is informational only and does not authorize a charge or create a paid subscription.

**13.3 Future pricing.** Proposed pricing, including any monthly or annual maintenance fee and any charge for Token Usage, is not effective unless it is displayed at an operational checkout and accepted by you before purchase. No bracketed, draft, or placeholder rate is a binding price.

**13.4 Future activation.** Before paid billing begins, Company will publish updated billing terms and checkout disclosures describing the price, billing period, proration method if any, taxes, renewal terms, cancellation method, refund rules, and Token Usage charges. You will be required to affirmatively accept the applicable Terms and Order Details before any paid subscription is activated.

**13.5 No current payment authorization.** These Terms do not authorize Company or Stripe to charge you while checkout is unavailable.

## 14. Automatic Renewal and Cancellation — Reserved

No subscription currently renews automatically because paid subscriptions are not active. When paid subscriptions become available, renewal and cancellation terms will be presented before purchase. The Service will not rely on this reserved section as authorization for automatic renewal.

## 15. Refunds — Reserved

Because paid checkout is not active, there are currently no subscription payments to refund. Refund rules for future paid services will be disclosed before purchase and will preserve any non-waivable rights under applicable law.

`,
    )
    .replace(
      /\*\*18\.1\*\*[\s\S]*?\n\n\*\*18\.2\*\*/,
      '**18.1** The Service currently relies on Replit for hosting, Clerk for authentication, Anthropic for AI processing, and Resend for email delivery. Stripe-related code is present as a disabled integration placeholder, but payment processing is not active. The Privacy Policy identifies providers that process Customer Content or account information.\n\n**18.2**',
    )
    .replace(
      '**21.1 Term.** These Terms apply from your first acceptance and continue until your subscription ends and your account is closed.',
      '**21.1 Term.** These Terms apply from your first acceptance and continue until your account is closed or your access ends.',
    )
    .replace(
      '**21.3 Termination by Customer.** You may terminate by cancelling under Section 14 and closing your account.',
      '**21.3 Termination by Customer.** You may stop using the Service and request account closure by contacting Support. Paid cancellation terms will apply only after paid billing launches.',
    )
    .replace(
      '(b) future maintenance renewals stop; (c) all accrued fees, Token Usage charges, and other amounts owed remain due and become immediately payable;',
      '(b) any future paid renewals stop as provided by the billing terms then in effect; (c) any valid amounts incurred after paid billing launches remain payable;',
    )
    .replace(
      'Your acceptance record identifies the exact version you accepted.',
      'Where an acceptance record is collected, it will identify the exact version accepted.',
    )
    .replace(
      '**32.7 Counterparts and records.** Company\'s electronic records of acceptance, versions, and transactions are admissible evidence of the agreement and its terms.',
      '**32.7 Counterparts and records.** Company may maintain electronic records of published versions and, after affirmative acceptance recording is implemented, acceptance and transaction records.',
    )
    .trim();
}

export const termsV1 = buildTerms();