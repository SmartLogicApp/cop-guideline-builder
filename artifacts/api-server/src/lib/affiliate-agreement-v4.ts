export const AFFILIATE_AGREEMENT_V4_VERSION = "4.0";

const OLD_ADDRESS = "550 Biltmore Way, Suite 200";
const NEW_ADDRESS = "550 Biltmore Way, Suite 209";
const REMOVED_ACCEPTANCE_BULLETS = [
  "•  IP address or other technical acceptance information;",
  "•  applicable program version;",
] as const;

/**
 * Apply only the two owner-authorized corrections to the source text extracted
 * from the attorney-provided DOCX. Fail closed if the source has drifted.
 */
export function prepareAffiliateAgreementV4(source: string): string {
  const addressCount = source.split(OLD_ADDRESS).length - 1;
  if (addressCount !== 2) {
    throw new Error(`Expected exactly two Suite 200 address occurrences; found ${addressCount}.`);
  }

  const paragraphs = source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  for (const bullet of REMOVED_ACCEPTANCE_BULLETS) {
    const matches = paragraphs.filter((paragraph) => paragraph === bullet).length;
    if (matches !== 1) {
      throw new Error(`Expected exactly one Section 33 acceptance bullet to remove; found ${matches}.`);
    }
  }

  const corrected = paragraphs
    .filter((paragraph) => !REMOVED_ACCEPTANCE_BULLETS.includes(paragraph as typeof REMOVED_ACCEPTANCE_BULLETS[number]))
    .map((paragraph) => paragraph.replaceAll(OLD_ADDRESS, NEW_ADDRESS))
    .join("\n\n");

  if (!corrected.includes("Agreement Version: Affiliate Partner Agreement — Version 4.0")) {
    throw new Error("The source agreement does not identify itself as Version 4.0.");
  }
  return corrected;
}

/**
 * Version 4.0 is fixed to the attorney-provided source and its two authorized
 * corrections. Other version strings retain the existing publication flow.
 */
export function isCanonicalAffiliateAgreementPublication(
  version: string,
  submittedBody: string,
  source: string,
): boolean {
  return version !== AFFILIATE_AGREEMENT_V4_VERSION
    || submittedBody === prepareAffiliateAgreementV4(source);
}