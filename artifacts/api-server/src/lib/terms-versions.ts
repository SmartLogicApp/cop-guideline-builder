/**
 * The registry of published Terms versions.
 *
 * WHY THIS EXISTS: the version string recorded against a customer's acceptance
 * is the evidence of what they agreed to. Before this file, the constant was
 * "2026-08-13" while the published document was dated September 7, 2026 — the
 * record pointed at a version that did not correspond to the document shown.
 * Versions are now explicit, dated, and listed here so the two cannot drift.
 *
 * Adding a version: append an entry, move CURRENT_TERMS_VERSION to it, and
 * publish the matching document in the marketing site. Never edit or remove a
 * past entry — customers are bound by the version they accepted, and deleting
 * it destroys the record of what that was.
 */

export type TermsVersion = {
  version: string;
  /** Publication date of the document this version identifies. */
  publishedOn: string;
  /** True once the document is live and may be presented for acceptance. */
  published: boolean;
  summary: string;
};

export const TERMS_VERSIONS: readonly TermsVersion[] = [
  {
    version: "2026-08-13",
    publishedOn: "2026-08-13",
    published: true,
    summary:
      "Version 1.0. Pre-launch. Paid billing not active. Scoped the subscription " +
      "to a single CMS-certified Facility and forbade use on behalf of any other " +
      "facility. Superseded by 2026-09-21. Retained exactly as recorded for " +
      "customers who accepted it.",
  },
  {
    version: "2026-09-21",
    publishedOn: "2026-09-21",
    published: true,
    summary:
      "Version 1.1. Paid billing still not active. Corrects two things Version 1.0 " +
      "got wrong: the subscription unit is an Account registered to a Provider " +
      "Identifier (CCN, NPI, CLIA, or one the Service issues), not a CMS-certified " +
      "Facility, and a consulting Customer may deliver Output to its own clients; " +
      "and the contact addresses, which pointed at a misspelled mailbox that does " +
      "not exist. Re-acceptance is required because the scope of the licence changed.",
  },
  {
    version: "2.0",
    publishedOn: "",
    published: false, // flip to true when counsel approves and the document ships
    summary:
      "Paid billing active. $299 per Account per month, $3,588 annually, " +
      "30-day trial with card up front, token cost included, fair use, " +
      "15-day deactivation notice, cancellation via the Stripe portal.",
  },
] as const;

/**
 * The version customers must have accepted to be charged.
 *
 * Only ever move this to a version whose document is published and readable —
 * moving it early makes the checkout gate demand acceptance of something
 * nobody can see. It stays at 1.1 until Terms 2.0 clears counsel.
 *
 * Moving it to 1.1 makes needsAcceptance() true for anyone who accepted 1.0,
 * which is the intended effect: 1.1 widens who may hold a subscription and
 * what a consulting Customer may do with Output, so the earlier acceptance no
 * longer describes the licence on offer.
 */
export const CURRENT_TERMS_VERSION = "2026-09-21";

export function getTermsVersion(version: string): TermsVersion | undefined {
  return TERMS_VERSIONS.find((entry) => entry.version === version);
}

export function isAcceptableVersion(version: string): boolean {
  const entry = getTermsVersion(version);
  return entry?.published === true;
}

/**
 * Whether this account needs to accept before it can be charged.
 * A customer on an older published version must re-accept the current one.
 */
export function needsAcceptance(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion !== CURRENT_TERMS_VERSION;
}
