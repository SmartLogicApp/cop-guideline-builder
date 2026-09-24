import { db, affiliates, affiliateAgreements, affiliateAgreementAcceptances } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export function reviewedAffiliateAgreementVersion(): string | null {
  return process.env.AFFILIATE_REVIEWED_TERMS_VERSION?.trim() || null;
}

export async function reviewedAffiliateAgreementExists(): Promise<boolean> {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return false;
  const [agreement] = await db.select({ version: affiliateAgreements.version })
    .from(affiliateAgreements).where(eq(affiliateAgreements.version, version)).limit(1);
  return Boolean(agreement);
}

export async function hasReviewedAffiliateAcceptance(affiliateId: string): Promise<boolean> {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return false;
  const [accepted] = await db.select({ id: affiliateAgreementAcceptances.id })
    .from(affiliateAgreementAcceptances)
    .innerJoin(affiliateAgreements, and(
      eq(affiliateAgreementAcceptances.agreementVersion, affiliateAgreements.version),
      eq(affiliateAgreementAcceptances.contentSha256, affiliateAgreements.contentSha256),
    ))
    .innerJoin(affiliates, and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliates.id),
      eq(affiliateAgreementAcceptances.signerEmail, sql`lower(${affiliates.email})`),
      eq(affiliateAgreementAcceptances.identityEpoch, affiliates.agreementIdentityEpoch),
    ))
    .where(and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliateId),
      eq(affiliateAgreementAcceptances.agreementVersion, version),
    )).limit(1);
  return Boolean(accepted);
}