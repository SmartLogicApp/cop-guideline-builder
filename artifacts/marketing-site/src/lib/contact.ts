/**
 * The company's two mailboxes, defined once.
 *
 * These were previously hard-coded in six places across the site and, in the
 * Terms builder, rewritten to a misspelled third address that collapsed both
 * into one. The result was that cancellation requests, security reports and
 * support mail were all directed at a mailbox that does not exist.
 *
 * Import these rather than typing an address. A literal in a page is how the
 * drift started.
 */

/** Business, legal, privacy and enterprise. Notices to Company go here. */
export const CONTACT_EMAIL_MAIN = 'CMSComplianceGuardian@Outlook.com';

/** Customer support, cancellation requests, and account security reports. */
export const CONTACT_EMAIL_SUPPORT = 'CMSComplianceGuardianHelp@Outlook.com';

export const mailto = (address: string, subject?: string) =>
  subject
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}`
    : `mailto:${address}`;
