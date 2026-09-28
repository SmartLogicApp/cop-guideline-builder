export function isCurrentReviewedAffiliateAcceptance(input: {
  reviewedVersion: string | null;
  acceptedVersion: string;
  acceptedContentSha256: string;
  reviewedContentSha256: string;
  acceptedSignerEmail: string;
  currentAffiliateEmail: string;
  acceptedIdentityEpoch: number;
  currentIdentityEpoch: number;
}): boolean {
  return Boolean(input.reviewedVersion
    && input.acceptedVersion === input.reviewedVersion
    && input.acceptedContentSha256 === input.reviewedContentSha256
    && input.acceptedSignerEmail.trim().toLowerCase() === input.currentAffiliateEmail.trim().toLowerCase()
    && input.acceptedIdentityEpoch === input.currentIdentityEpoch);
}