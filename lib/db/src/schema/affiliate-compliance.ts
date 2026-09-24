import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { affiliateCommissions, affiliates } from "./affiliates";

/**
 * Additive compliance and manual-payout workflow records.
 *
 * Stripe and tax fields here are status/identifier metadata only. Never add
 * bank details, tax identifiers, W-9 files, or Stripe credentials to this
 * schema. Existing affiliate agreement acceptances remain authoritative for
 * the agreement flow already in use.
 */
export const affiliateComplianceStatus = pgTable("affiliate_compliance_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  state: text("state"),
  country: text("country").notNull().default("US"),
  agreementStatus: text("agreement_status").notNull().default("not_started"),
  agreementDocumentVersion: text("agreement_document_version"),
  privacyStatus: text("privacy_status").notNull().default("not_started"),
  privacyDocumentVersion: text("privacy_document_version"),
  taxStatus: text("tax_status").notNull().default("not_started"),
  paymentAuthorizationStatus: text("payment_authorization_status").notNull().default("not_started"),
  paymentAuthorizationVersion: text("payment_authorization_version"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  stripeAccountType: text("stripe_account_type"),
  stripeOnboardingStatus: text("stripe_onboarding_status").notNull().default("not_started"),
  stripeOnboardingStartedAt: timestamp("stripe_onboarding_started_at", { withTimezone: true }),
  stripeOnboardingCompletedAt: timestamp("stripe_onboarding_completed_at", { withTimezone: true }),
  stripeChargesEnabled: boolean("stripe_charges_enabled"),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false),
  stripeRequirementsDue: jsonb("stripe_requirements_due").$type<string[]>(),
  stripeTaxFormStatus: text("stripe_tax_form_status").notNull().default("not_started"),
  stripeTaxFormLastCheckedAt: timestamp("stripe_tax_form_last_checked_at", { withTimezone: true }),
  stripeAccountLastSyncedAt: timestamp("stripe_account_last_synced_at", { withTimezone: true }),
  ftcAcknowledgementStatus: text("ftc_acknowledgement_status").notNull().default("not_started"),
  ftcAcknowledgementVersion: text("ftc_acknowledgement_version"),
  marketingGuidelinesStatus: text("marketing_guidelines_status").notNull().default("not_started"),
  marketingGuidelinesVersion: text("marketing_guidelines_version"),
  adminApprovalStatus: text("admin_approval_status").notNull().default("pending"),
  adminHoldStatus: text("admin_hold_status").notNull().default("none"),
  adminHoldReason: text("admin_hold_reason"),
  payoutEligibilityStatus: text("payout_eligibility_status").notNull().default("not_eligible"),
  payoutEligibilityLastCheckedAt: timestamp("payout_eligibility_last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_compliance_status_affiliate_uidx").on(table.affiliateId),
  uniqueIndex("affiliate_compliance_status_stripe_account_uidx").on(table.stripeConnectedAccountId),
  index("affiliate_compliance_status_tax_idx").on(table.taxStatus),
  index("affiliate_compliance_status_eligibility_idx").on(table.payoutEligibilityStatus),
  index("affiliate_compliance_status_approval_idx").on(table.adminApprovalStatus),
]);

export const affiliateDocumentVersions = pgTable("affiliate_document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentType: text("document_type").notNull(),
  version: text("version").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedByAdminId: text("published_by_admin_id"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_document_versions_type_version_uidx").on(table.documentType, table.version),
  index("affiliate_document_versions_status_idx").on(table.status),
  index("affiliate_document_versions_type_status_idx").on(table.documentType, table.status),
  check("affiliate_document_versions_status_check", sql`${table.status} IN ('draft', 'published', 'retired')`),
]);

export const affiliateDocumentAcknowledgements = pgTable("affiliate_document_acknowledgements", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  documentVersionId: uuid("document_version_id").notNull().references(() => affiliateDocumentVersions.id, { onDelete: "restrict" }),
  documentType: text("document_type").notNull(),
  documentVersion: text("document_version").notNull(),
  documentTitle: text("document_title").notNull(),
  documentUrl: text("document_url"),
  typedLegalName: text("typed_legal_name").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  acceptanceMethod: text("acceptance_method").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("current"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_document_acknowledgements_affiliate_idx").on(table.affiliateId),
  index("affiliate_document_acknowledgements_version_idx").on(table.documentVersionId),
  index("affiliate_document_acknowledgements_type_status_idx").on(table.documentType, table.status),
  uniqueIndex("affiliate_document_acknowledgements_current_uidx")
    .on(table.affiliateId, table.documentType)
    .where(sql`${table.status} = 'current'`),
  check("affiliate_document_acknowledgements_status_check", sql`${table.status} IN ('current', 'superseded', 'revoked')`),
]);

export const affiliatePaymentAuthorizations = pgTable("affiliate_payment_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  authorizationVersion: text("authorization_version").notNull(),
  authorizationDocumentVersionId: uuid("authorization_document_version_id")
    .notNull().references(() => affiliateDocumentVersions.id, { onDelete: "restrict" }),
  typedLegalName: text("typed_legal_name").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("current"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_payment_authorizations_affiliate_idx").on(table.affiliateId),
  uniqueIndex("affiliate_payment_authorizations_current_uidx")
    .on(table.affiliateId)
    .where(sql`${table.status} = 'current'`),
  check("affiliate_payment_authorizations_status_check", sql`${table.status} IN ('current', 'superseded', 'revoked')`),
]);

export const affiliatePayoutHolds = pgTable("affiliate_payout_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  holdType: text("hold_type").notNull(),
  reason: text("reason").notNull(),
  createdByAdminId: text("created_by_admin_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedByAdminId: text("released_by_admin_id"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
}, (table) => [
  index("affiliate_payout_holds_affiliate_idx").on(table.affiliateId),
  index("affiliate_payout_holds_status_idx").on(table.status),
  index("affiliate_payout_holds_type_status_idx").on(table.holdType, table.status),
  check("affiliate_payout_holds_status_check", sql`${table.status} IN ('active', 'released')`),
]);

export const affiliateComplianceAuditLog = pgTable("affiliate_compliance_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  eventType: text("event_type").notNull(),
  priorValue: jsonb("prior_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_compliance_audit_log_affiliate_idx").on(table.affiliateId),
  index("affiliate_compliance_audit_log_actor_idx").on(table.actorType, table.actorId),
  index("affiliate_compliance_audit_log_created_at_idx").on(table.createdAt),
  check("affiliate_compliance_audit_log_actor_type_check", sql`${table.actorType} IN ('affiliate', 'admin', 'system', 'stripe_webhook')`),
]);

/**
 * Separate from the established affiliate_payouts quarterly ledger. This
 * additive table models the newer review/approval/send workflow without
 * rewriting or colliding with its existing records.
 */
export const affiliatePayoutWorkflow = pgTable("affiliate_payout_workflow", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  payoutPeriodStart: timestamp("payout_period_start", { withTimezone: true }).notNull(),
  payoutPeriodEnd: timestamp("payout_period_end", { withTimezone: true }).notNull(),
  grossCommissionAmount: numeric("gross_commission_amount", { precision: 14, scale: 2 }).notNull(),
  adjustmentsAmount: numeric("adjustments_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  netPayoutAmount: numeric("net_payout_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  payoutStatus: text("payout_status").notNull().default("accrued"),
  stripeTransferId: text("stripe_transfer_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  approvedByAdminId: text("approved_by_admin_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_payout_workflow_idempotency_uidx").on(table.idempotencyKey),
  uniqueIndex("affiliate_payout_workflow_transfer_uidx").on(table.stripeTransferId)
    .where(sql`${table.stripeTransferId} IS NOT NULL`),
  index("affiliate_payout_workflow_affiliate_idx").on(table.affiliateId),
  index("affiliate_payout_workflow_status_idx").on(table.payoutStatus),
  index("affiliate_payout_workflow_created_at_idx").on(table.createdAt),
  check(
    "affiliate_payout_workflow_status_check",
    sql`${table.payoutStatus} IN ('accrued', 'pending_hold_period', 'payable_pending_compliance', 'payable_pending_admin_approval', 'approved_for_payout', 'payout_processing', 'paid', 'failed', 'reversed', 'reversal_review_required', 'withheld', 'voided')`,
  ),
  check("affiliate_payout_workflow_period_check", sql`${table.payoutPeriodEnd} >= ${table.payoutPeriodStart}`),
]);

export const affiliatePayoutWorkflowCommissions = pgTable("affiliate_payout_workflow_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutWorkflowId: uuid("payout_workflow_id").notNull().references(() => affiliatePayoutWorkflow.id, { onDelete: "restrict" }),
  commissionId: uuid("commission_id").notNull().references(() => affiliateCommissions.id, { onDelete: "restrict" }),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  commissionAmount: numeric("commission_amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("claimed"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_payout_workflow_commission_pair_uidx").on(table.payoutWorkflowId, table.commissionId),
  uniqueIndex("affiliate_payout_workflow_commission_active_uidx").on(table.commissionId)
    .where(sql`${table.status} IN ('claimed', 'paid')`),
  index("affiliate_payout_workflow_commissions_workflow_idx").on(table.payoutWorkflowId),
  index("affiliate_payout_workflow_commissions_affiliate_idx").on(table.affiliateId),
  check("affiliate_payout_workflow_commission_status_check", sql`${table.status} IN ('claimed', 'paid', 'released', 'reversed')`),
  check("affiliate_payout_workflow_commission_amount_check", sql`${table.commissionAmount} > 0`),
]);

export const affiliateTaxReviewDecisions = pgTable("affiliate_tax_review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "restrict" }),
  taxStatus: text("tax_status").notNull(),
  decisionType: text("decision_type").notNull(),
  reason: text("reason").notNull(),
  reviewedByAdminId: text("reviewed_by_admin_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("affiliate_tax_review_decisions_affiliate_idx").on(table.affiliateId),
  index("affiliate_tax_review_decisions_status_idx").on(table.taxStatus),
  index("affiliate_tax_review_decisions_created_at_idx").on(table.createdAt),
  check(
    "affiliate_tax_review_decisions_status_check",
    sql`${table.taxStatus} IN ('not_started', 'submitted_to_stripe', 'verified_complete', 'needs_correction', 'manual_review_required', 'not_applicable')`,
  ),
]);

export const affiliateEmailTemplates = pgTable("affiliate_email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateKey: text("template_key").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedByAdminId: text("updated_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("affiliate_email_templates_key_uidx").on(table.templateKey),
  index("affiliate_email_templates_enabled_idx").on(table.enabled),
]);

export const insertAffiliateComplianceStatusSchema = createInsertSchema(affiliateComplianceStatus)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateDocumentVersionSchema = createInsertSchema(affiliateDocumentVersions)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateDocumentAcknowledgementSchema = createInsertSchema(affiliateDocumentAcknowledgements)
  .omit({ id: true, acceptedAt: true, createdAt: true, updatedAt: true });
export const insertAffiliatePaymentAuthorizationSchema = createInsertSchema(affiliatePaymentAuthorizations)
  .omit({ id: true, acceptedAt: true, createdAt: true, updatedAt: true });
export const insertAffiliatePayoutHoldSchema = createInsertSchema(affiliatePayoutHolds)
  .omit({ id: true, createdAt: true });
export const insertAffiliateComplianceAuditEntrySchema = createInsertSchema(affiliateComplianceAuditLog)
  .omit({ id: true, createdAt: true });
export const insertAffiliatePayoutWorkflowSchema = createInsertSchema(affiliatePayoutWorkflow)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateTaxReviewDecisionSchema = createInsertSchema(affiliateTaxReviewDecisions)
  .omit({ id: true, decidedAt: true, createdAt: true });
export const insertAffiliateEmailTemplateSchema = createInsertSchema(affiliateEmailTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type InsertAffiliateComplianceStatus = z.infer<typeof insertAffiliateComplianceStatusSchema>;
export type InsertAffiliateDocumentVersion = z.infer<typeof insertAffiliateDocumentVersionSchema>;
export type InsertAffiliateDocumentAcknowledgement = z.infer<typeof insertAffiliateDocumentAcknowledgementSchema>;
export type InsertAffiliatePaymentAuthorization = z.infer<typeof insertAffiliatePaymentAuthorizationSchema>;
export type InsertAffiliatePayoutHold = z.infer<typeof insertAffiliatePayoutHoldSchema>;
export type InsertAffiliateComplianceAuditEntry = z.infer<typeof insertAffiliateComplianceAuditEntrySchema>;
export type InsertAffiliatePayoutWorkflowItem = z.infer<typeof insertAffiliatePayoutWorkflowSchema>;
export type InsertAffiliateTaxReviewDecision = z.infer<typeof insertAffiliateTaxReviewDecisionSchema>;
export type InsertAffiliateEmailTemplate = z.infer<typeof insertAffiliateEmailTemplateSchema>;

export type AffiliateComplianceStatus = typeof affiliateComplianceStatus.$inferSelect;
export type AffiliateDocumentVersion = typeof affiliateDocumentVersions.$inferSelect;
export type AffiliateDocumentAcknowledgement = typeof affiliateDocumentAcknowledgements.$inferSelect;
export type AffiliatePaymentAuthorization = typeof affiliatePaymentAuthorizations.$inferSelect;
export type AffiliatePayoutHold = typeof affiliatePayoutHolds.$inferSelect;
export type AffiliateComplianceAuditEntry = typeof affiliateComplianceAuditLog.$inferSelect;
export type AffiliatePayoutWorkflowItem = typeof affiliatePayoutWorkflow.$inferSelect;
export type AffiliateTaxReviewDecision = typeof affiliateTaxReviewDecisions.$inferSelect;
export type AffiliateEmailTemplate = typeof affiliateEmailTemplates.$inferSelect;