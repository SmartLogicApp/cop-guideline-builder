import { pgTable, uuid, text, timestamp, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { affiliates } from "./affiliates";

// Published documents and acceptance evidence are append-only. Never edit a
// published version: accepted hashes must always identify the original text.
export const affiliateAgreements = pgTable("affiliate_agreements", {
  version: text("version").primaryKey(),
  body: text("body").notNull(),
  contentSha256: text("content_sha256").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  publishedBy: text("published_by").notNull(),
});

export const affiliateAgreementInvitations = pgTable("affiliate_agreement_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id),
  agreementVersion: text("agreement_version").notNull().references(() => affiliateAgreements.version),
  tokenSha256: text("token_sha256").notNull().unique("affiliate_agreement_invitations_token_sha256_key"),
  recipientEmail: text("recipient_email").notNull(),
  identityEpoch: integer("identity_epoch").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_agreement_invitations_affiliate_idx").on(table.affiliateId),
]);

export const affiliateAgreementAcceptances = pgTable("affiliate_agreement_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id),
  invitationId: uuid("invitation_id").notNull().references(() => affiliateAgreementInvitations.id),
  agreementVersion: text("agreement_version").notNull().references(() => affiliateAgreements.version),
  contentSha256: text("content_sha256").notNull(),
  signerName: text("signer_name").notNull(),
  // Immutable copy of affiliates.companyName at the instant this signature
  // was recorded. Historical rows stay nullable because the prior value
  // cannot safely be reconstructed from the mutable affiliate profile.
  legalBusinessName: text("legal_business_name"),
  signerEmail: text("signer_email").notNull(),
  identityEpoch: integer("identity_epoch").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_agreement_acceptances_invitation_idx").on(table.invitationId),
  index("affiliate_agreement_acceptances_affiliate_version_idx").on(table.affiliateId, table.agreementVersion),
  uniqueIndex("affiliate_agreement_acceptances_once_idx").on(table.affiliateId, table.agreementVersion, table.identityEpoch),
]);