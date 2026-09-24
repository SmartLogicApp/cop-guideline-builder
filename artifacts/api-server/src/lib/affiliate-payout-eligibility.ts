import {
  db, affiliates, affiliateCommissions, affiliateComplianceStatus,
  affiliateDocumentVersions, affiliateDocumentAcknowledgements,
  affiliatePaymentAuthorizations, affiliatePayoutHolds, affiliateAgreementAcceptances,
  affiliateAgreements, affiliateComplianceAuditLog,
} from "@workspace/db";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { reviewedAffiliateAgreementVersion } from "./affiliate-agreement-state.js";
import { payoutEligibilityReasons } from "./affiliate-compliance-rules.js";

export type AffiliatePayoutEligibility = {
  eligible: boolean;
  overall_status: "eligible_for_payouts" | "pending_approval" | "international_review_required" | "payouts_paused" | "not_eligible";
  blocking_reasons: string[];
  compliance_status: Record<string, unknown>;
  checked_at: string;
};

const requiredDocumentTypes = ["privacy", "ftc_disclosure", "marketing_guidelines"] as const;
export const PAYOUT_MINIMUM_USD = 100;

export async function calculateAffiliatePayoutEligibility(affiliateId: string, executor: any = db): Promise<AffiliatePayoutEligibility> {
  const checkedAt = new Date();
  const [affiliate] = await executor.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!affiliate) {
    return { eligible: false, overall_status: "not_eligible", blocking_reasons: ["Affiliate record was not found."], compliance_status: {}, checked_at: checkedAt.toISOString() };
  }
  const [[status], holds, payableRows, currentDocs, acknowledgements, paymentAuthorization] = await Promise.all([
    executor.select().from(affiliateComplianceStatus).where(eq(affiliateComplianceStatus.affiliateId, affiliateId)).limit(1),
    executor.select({ id: affiliatePayoutHolds.id, holdType: affiliatePayoutHolds.holdType, reason: affiliatePayoutHolds.reason })
      .from(affiliatePayoutHolds).where(and(eq(affiliatePayoutHolds.affiliateId, affiliateId), eq(affiliatePayoutHolds.status, "active"))),
    executor.select({ total: sql<number>`coalesce(sum(${affiliateCommissions.commissionUsd}), 0)` })
      .from(affiliateCommissions).where(and(eq(affiliateCommissions.affiliateId, affiliateId), eq(affiliateCommissions.status, "payable"))),
     executor.select().from(affiliateDocumentVersions).where(and(
       eq(affiliateDocumentVersions.status, "published"),
       lte(affiliateDocumentVersions.effectiveAt, checkedAt),
     )),
    executor.select().from(affiliateDocumentAcknowledgements).where(and(eq(affiliateDocumentAcknowledgements.affiliateId, affiliateId), eq(affiliateDocumentAcknowledgements.status, "current"))),
    executor.select().from(affiliatePaymentAuthorizations).where(and(eq(affiliatePaymentAuthorizations.affiliateId, affiliateId), eq(affiliatePaymentAuthorizations.status, "current"))).orderBy(desc(affiliatePaymentAuthorizations.acceptedAt)).limit(1),
  ]);

  const publishedByType = new Map<string, typeof currentDocs[number]>();
  for (const doc of currentDocs) {
    const seen = publishedByType.get(doc.documentType);
    if (!seen || (doc.effectiveAt ?? doc.publishedAt ?? doc.createdAt) > (seen.effectiveAt ?? seen.publishedAt ?? seen.createdAt)) publishedByType.set(doc.documentType, doc);
  }
  const acceptedByType = new Map<string, typeof affiliateDocumentAcknowledgements.$inferSelect>(
    (acknowledgements as Array<typeof affiliateDocumentAcknowledgements.$inferSelect>)
      .map((ack) => [ack.documentType, ack] as [string, typeof affiliateDocumentAcknowledgements.$inferSelect]),
  );
  const currentAgreement = reviewedAffiliateAgreementVersion();
  const acceptedAgreementRows = currentAgreement ? await executor.select({ id: affiliateAgreementAcceptances.id })
    .from(affiliateAgreementAcceptances)
    .innerJoin(affiliateAgreements, and(
      eq(affiliateAgreementAcceptances.agreementVersion, affiliateAgreements.version),
      eq(affiliateAgreementAcceptances.contentSha256, affiliateAgreements.contentSha256),
    ))
    .where(and(
      eq(affiliateAgreementAcceptances.affiliateId, affiliateId),
      eq(affiliateAgreementAcceptances.agreementVersion, currentAgreement),
      eq(affiliateAgreementAcceptances.signerEmail, sql`lower(${affiliate.email})`),
      eq(affiliateAgreementAcceptances.identityEpoch, affiliate.agreementIdentityEpoch),
    )).limit(1) : [];
  const documentAcceptance = Object.fromEntries(requiredDocumentTypes.map((type) => {
    const current = publishedByType.get(type);
    const accepted = acceptedByType.get(type);
    return [type, Boolean(current && accepted && accepted.documentVersionId === current.id)];
  }));
  const currentPaymentAuthorizationDoc = publishedByType.get("payment_authorization");
  const acceptedPaymentAuthorization = paymentAuthorization[0];
  const paymentAuthorizationCurrent = Boolean(currentPaymentAuthorizationDoc && acceptedPaymentAuthorization
    && acceptedPaymentAuthorization.authorizationDocumentVersionId === currentPaymentAuthorizationDoc.id
    && acceptedPaymentAuthorization.authorizationVersion === currentPaymentAuthorizationDoc.version);
  const activeHolds = holds as Array<{ id: string; holdType: string; reason: string }>;
  const payableAmount = Number(payableRows[0]?.total ?? 0);
  const reasons = payoutEligibilityReasons({
    affiliateStatus: affiliate.status,
    country: status?.country ?? null,
    state: status?.state ?? null,
    agreementAccepted: Boolean(currentAgreement && acceptedAgreementRows.length),
    privacyAccepted: documentAcceptance.privacy === true,
    ftcAccepted: documentAcceptance.ftc_disclosure === true,
    marketingAccepted: documentAcceptance.marketing_guidelines === true,
    taxStatus: status?.taxStatus ?? "not_started",
    stripeConnected: Boolean(status?.stripeConnectedAccountId),
    stripeAccountType: status?.stripeAccountType ?? null,
    stripeOnboardingStatus: status?.stripeOnboardingStatus ?? "not_started",
    stripeDetailsSubmitted: status?.stripeDetailsSubmitted ?? false,
    stripePayoutsEnabled: status?.stripePayoutsEnabled ?? false,
    paymentAuthorizationAccepted: paymentAuthorizationCurrent,
    adminApprovalStatus: status?.adminApprovalStatus ?? "pending",
    activeHolds: activeHolds.length ? activeHolds : status?.adminHoldStatus === "active" ? [{ holdType: "Admin", reason: status.adminHoldReason ?? "Admin payout hold is active." }] : [],
    payableAmount, minimumAmount: PAYOUT_MINIMUM_USD,
  });
  const eligible = reasons.length === 0;
  const international = Boolean(status?.country && !["US", "USA", "United States"].includes(status.country));
  const overall_status = international ? "international_review_required"
    : eligible ? "eligible_for_payouts"
    : holds.length || status?.adminHoldStatus === "active" ? "payouts_paused"
    : status?.adminApprovalStatus !== "approved" ? "pending_approval"
    : "not_eligible";

  const snapshot = {
    affiliateStatus: affiliate.status,
    country: status?.country ?? null,
    state: status?.state ?? null,
    agreementAccepted: !reasons.some((reason) => reason.includes("Affiliate Partner Agreement")),
    documents: Object.fromEntries(requiredDocumentTypes.map((type) => [type, acceptedByType.get(type)?.documentVersion ?? null])),
    taxStatus: status?.taxStatus ?? "not_started",
    stripe: { connected: Boolean(status?.stripeConnectedAccountId), accountType: status?.stripeAccountType ?? null, detailsSubmitted: status?.stripeDetailsSubmitted ?? false, payoutsEnabled: status?.stripePayoutsEnabled ?? false },
    paymentAuthorization: paymentAuthorizationCurrent,
    adminApprovalStatus: status?.adminApprovalStatus ?? "pending",
    activeHolds: activeHolds.length,
    payableAmount,
    minimumAmount: PAYOUT_MINIMUM_USD,
  };
  if (status) {
    await executor.update(affiliateComplianceStatus).set({
      payoutEligibilityStatus: eligible ? "eligible" : "not_eligible",
      payoutEligibilityLastCheckedAt: checkedAt,
      updatedAt: checkedAt,
    }).where(eq(affiliateComplianceStatus.affiliateId, affiliateId));
  }
  return { eligible, overall_status, blocking_reasons: reasons, compliance_status: snapshot, checked_at: checkedAt.toISOString() };
}

export async function auditBlockedPayoutAttempt(
  affiliateId: string, actorId: string | null, action: string, reasons: string[],
): Promise<void> {
  await db.insert(affiliateComplianceAuditLog).values({
    affiliateId, actorType: actorId ? "admin" : "system", actorId,
    eventType: "payout_blocked", reason: reasons.join(" "),
    metadata: { attemptedAction: action },
  });
}
