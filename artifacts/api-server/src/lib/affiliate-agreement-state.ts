import { db, affiliates, affiliateAgreements, affiliateAgreementAcceptances } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { isCurrentReviewedAffiliateAcceptance } from "./affiliate-reviewed-agreement-acceptance.js";
import { eligibleReviewedAgreementVersion } from "./affiliate-sample-agreement.js";

export function reviewedAffiliateAgreementVersion(): string | null {
  // A sample record can never become a reviewed agreement through configuration.
  return eligibleReviewedAgreementVersion(process.env.AFFILIATE_REVIEWED_TERMS_VERSION);
}

export async function reviewedAffiliateAgreementExists(): Promise<boolean> {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return false;
  const [agreement] = await db.select({ version: affiliateAgreements.version })
    .from(affiliateAgreements).where(eq(affiliateAgreements.version, version)).limit(1);
  return Boolean(agreement);
}

export async function getReviewedAffiliateAcceptance(affiliateId: string) {
  const reviewedVersion = reviewedAffiliateAgreementVersion();
  if (!reviewedVersion) return null;
  const candidates = await db.select({
    agreementVersion: affiliateAgreementAcceptances.agreementVersion,
    acceptedAt: affiliateAgreementAcceptances.acceptedAt,
    acceptedContentSha256: affiliateAgreementAcceptances.contentSha256,
    reviewedContentSha256: affiliateAgreements.contentSha256,
    acceptedSignerEmail: affiliateAgreementAcceptances.signerEmail,
    currentAffiliateEmail: affiliates.email,
    acceptedIdentityEpoch: affiliateAgreementAcceptances.identityEpoch,
    currentIdentityEpoch: affiliates.agreementIdentityEpoch,
  })
    .from(affiliateAgreementAcceptances)
    .innerJoin(affiliateAgreements, eq(affiliateAgreementAcceptances.agreementVersion, affiliateAgreements.version))
    .innerJoin(affiliates, eq(affiliateAgreementAcceptances.affiliateId, affiliates.id))
    .where(and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliateId),
      eq(affiliateAgreementAcceptances.agreementVersion, reviewedVersion),
    ))
    .orderBy(desc(affiliateAgreementAcceptances.acceptedAt));
  const accepted = candidates.find((candidate) => isCurrentReviewedAffiliateAcceptance({
    acceptedVersion: candidate.agreementVersion,
    acceptedContentSha256: candidate.acceptedContentSha256,
    reviewedContentSha256: candidate.reviewedContentSha256,
    acceptedSignerEmail: candidate.acceptedSignerEmail,
    currentAffiliateEmail: candidate.currentAffiliateEmail,
    acceptedIdentityEpoch: candidate.acceptedIdentityEpoch,
    currentIdentityEpoch: candidate.currentIdentityEpoch,
    reviewedVersion,
  }));
  return accepted ? {
    agreementVersion: accepted.agreementVersion,
    acceptedAt: accepted.acceptedAt,
  } : null;
}

export async function hasReviewedAffiliateAcceptance(affiliateId: string): Promise<boolean> {
  return Boolean(await getReviewedAffiliateAcceptance(affiliateId));
}

/**
 * Use in the WHERE clause of the activating UPDATE, not only as a preceding
 * read: the accepted document and applicant identity must still match at the
 * instant the row changes status.
 */
export function currentReviewedAffiliateAcceptanceCondition() {
  const version = reviewedAffiliateAgreementVersion();
  if (!version) return sql`false`;
  return sql`exists (
    select 1 from ${affiliateAgreementAcceptances}
    inner join ${affiliateAgreements}
      on ${affiliateAgreementAcceptances.agreementVersion} = ${affiliateAgreements.version}
      and ${affiliateAgreementAcceptances.contentSha256} = ${affiliateAgreements.contentSha256}
    where ${affiliateAgreementAcceptances.affiliateId} = ${affiliates.id}
      and ${affiliateAgreementAcceptances.agreementVersion} = ${version}
       and ${affiliateAgreementAcceptances.signerEmail} = lower(trim(${affiliates.email}))
      and ${affiliateAgreementAcceptances.identityEpoch} = ${affiliates.agreementIdentityEpoch}
  )`;
}