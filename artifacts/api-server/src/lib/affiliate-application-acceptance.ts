/**
 * Public applicants have no Clerk account. The affiliate row identifies the
 * applicant; immutable signer details and request evidence identify the click.
 */
export function applicationAcceptanceEvidence(input: {
  affiliateId: string;
  identityEpoch: number;
  version: string;
  contentSha256: string;
  companyName: string;
  contactName: string;
  email: string;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return {
    affiliateId: input.affiliateId,
    invitationId: null,
    agreementVersion: input.version,
    contentSha256: input.contentSha256,
    signerName: input.contactName,
    legalBusinessName: input.companyName,
    signerEmail: input.email,
    identityEpoch: input.identityEpoch,
    acceptedAt: input.acceptedAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  };
}