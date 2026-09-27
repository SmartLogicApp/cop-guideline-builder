import { db, affiliates, affiliateAgreements, affiliateAgreementAcceptances } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
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
      and ${affiliateAgreementAcceptances.signerEmail} = lower(${affiliates.email})
      and ${affiliateAgreementAcceptances.identityEpoch} = ${affiliates.agreementIdentityEpoch}
  )`;
}