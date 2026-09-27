import { randomBytes } from "node:crypto";

// Opaque codes cannot look like an endorsement from CMS or another agency.
// The database's unique constraint remains the final collision guard.
export function generateAffiliateReferralCode(): string {
  return `AFF-${randomBytes(10).toString("hex").toUpperCase()}`;
}