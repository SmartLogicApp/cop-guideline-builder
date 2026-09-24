// A development-only consent fixture, not contractual terms. Changing the
// wording requires a new version so recorded content hashes remain meaningful.
export const SAMPLE_AGREEMENT_VERSION = "SAMPLE-2026-09-24";
export const SAMPLE_AGREEMENT_BODY = `SAMPLE AFFILIATE PARTNER AGREEMENT — PLACEHOLDER ONLY

This text is a demonstration of the agreement review and consent-capture process. It has not been reviewed or approved by an attorney. It is not the final Affiliate Partner Agreement, does not establish an affiliate partnership, and does not grant commission or payout rights.

By checking the sample-consent box, you are testing how a versioned acknowledgement is recorded. Your test acknowledgement does not replace acceptance of future attorney-reviewed terms. Do not use this sample for real enrollment or payments.

END OF SAMPLE — NOT FINAL LEGAL COPY`;

export function sampleAgreementAvailable(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isSampleAgreementVersion(version: string): boolean {
  return /^SAMPLE(?:-|$)/i.test(version);
}

export function eligibleReviewedAgreementVersion(configured: string | undefined): string | null {
  const version = configured?.trim() || null;
  return version && !isSampleAgreementVersion(version) ? version : null;
}