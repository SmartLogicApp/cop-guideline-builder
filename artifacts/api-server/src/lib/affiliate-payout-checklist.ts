export type AffiliateChecklistAction = {
  type: "acknowledge_document" | "set_up_payouts" | "set_region" | "review_agreement" | "contact_admin";
  label: string;
  endpoint?: string;
  documentVersionId?: string;
};

export type AffiliateChecklistDocument = {
  id: string;
  title: string;
  version: string;
  content: string;
  url?: string;
};

export type AffiliateChecklistItem = {
  key: "agreement" | "privacy" | "ftc" | "marketing" | "tax" | "payment" | "admin";
  title: string;
  complete: boolean;
  status: "Complete" | "Action needed";
  version: string | null;
  completedAt: string | null;
  action: AffiliateChecklistAction | null;
  document?: AffiliateChecklistDocument | null;
  message?: string;
};

type ChecklistDocumentRow = {
  id: string;
  documentType: string;
  title: string;
  version: string;
  content: string;
};

type ChecklistAcknowledgementRow = {
  documentVersionId: string;
  documentType: string;
  documentVersion: string;
  acceptedAt: Date | string;
  status: string;
};

type ChecklistInputs = {
  agreementAcceptance: { agreementVersion: string; acceptedAt: Date | string } | null;
  publishedDocuments: ChecklistDocumentRow[];
  acknowledgements: ChecklistAcknowledgementRow[];
  compliance: {
    country?: string | null;
    state?: string | null;
    taxStatus?: string | null;
    paymentAuthorizationStatus?: string | null;
    stripeConnectedAccountId?: string | null;
    stripeAccountType?: string | null;
    stripeOnboardingStatus?: string | null;
    stripeDetailsSubmitted?: boolean | null;
    stripePayoutsEnabled?: boolean | null;
    stripeRequirementsDue?: string[] | null;
    stripeTaxFormLastCheckedAt?: Date | string | null;
    stripeOnboardingCompletedAt?: Date | string | null;
    adminApprovalStatus?: string | null;
    adminHoldStatus?: string | null;
  } | null;
  paymentAuthorizationCurrent: boolean;
  adminApplicationHeld?: boolean;
  activeComplianceHold?: boolean;
  affiliateStatus?: string | null;
  payoutEligible: boolean;
  paymentAuthorizationDocument?: ChecklistDocumentRow | null;
};

const DOCUMENT_ACKNOWLEDGEMENT_ENDPOINT = "/api/affiliate-compliance/portal/acknowledgements";
const SET_UP_PAYOUTS_ENDPOINT = "/api/affiliate-compliance/portal/connect";
const isUsCountry = (country: string | null | undefined) =>
  Boolean(country && ["US", "USA", "United States"].includes(country));

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function actionForDocument(document: ChecklistDocumentRow | undefined, accepted: ChecklistAcknowledgementRow | undefined) {
  if (!document || accepted?.documentVersionId === document.id) return null;
  return {
    type: "acknowledge_document" as const,
    label: "I acknowledge",
    endpoint: DOCUMENT_ACKNOWLEDGEMENT_ENDPOINT,
    documentVersionId: document.id,
  };
}

function documentFor(document: ChecklistDocumentRow | undefined, url?: string): AffiliateChecklistDocument | null {
  return document ? {
    id: document.id,
    title: document.title,
    version: document.version,
    content: document.content,
    ...(url ? { url } : {}),
  } : null;
}

function item(
  key: AffiliateChecklistItem["key"],
  title: string,
  complete: boolean,
  version: string | null,
  completedAt: Date | string | null,
  action: AffiliateChecklistAction | null,
  extra: Pick<AffiliateChecklistItem, "document" | "message"> = {},
): AffiliateChecklistItem {
  return {
    key,
    title,
    complete,
    status: complete ? "Complete" : "Action needed",
    version,
    completedAt: asIso(completedAt),
    action,
    ...extra,
  };
}

/**
 * The portal and Admin detail use this same versioned checklist projection.
 * Payout eligibility remains a separate, stricter decision: commission
 * minimums, affiliate activation, holds, and regional rules can block payout
 * even when each of these seven setup steps is complete.
 */
export function buildAffiliatePayoutChecklist(inputs: ChecklistInputs) {
  const documents = new Map(inputs.publishedDocuments.map((document) => [document.documentType, document]));
  const acknowledgements = new Map(inputs.acknowledgements
    .filter((acknowledgement) => acknowledgement.status === "current")
    .map((acknowledgement) => [acknowledgement.documentType, acknowledgement]));
  const currentAcknowledgement = (documentType: string) => {
    const document = documents.get(documentType);
    const acknowledgement = acknowledgements.get(documentType);
    return document && acknowledgement
      && acknowledgement.documentVersionId === document.id
      && acknowledgement.documentVersion === document.version
      ? acknowledgement
      : undefined;
  };

  const privacyDocument = documents.get("privacy");
  const privacyAcceptance = currentAcknowledgement("privacy");
  const ftcDocument = documents.get("ftc_disclosure");
  const ftcAcceptance = currentAcknowledgement("ftc_disclosure");
  const marketingDocument = documents.get("marketing_guidelines");
  const marketingAcceptance = currentAcknowledgement("marketing_guidelines");
  const agreement = inputs.agreementAcceptance;
  const compliance = inputs.compliance;
  const country = compliance?.country ?? null;
  const usAffiliate = isUsCountry(country);
  const regionComplete = Boolean(country && compliance?.state);
  const taxComplete = compliance?.taxStatus === "verified_complete";
  const paymentComplete = Boolean(inputs.paymentAuthorizationCurrent
    && compliance?.stripeConnectedAccountId
    && compliance.stripeAccountType === "express"
    && compliance.stripeOnboardingStatus === "complete"
    && compliance.stripeDetailsSubmitted
    && compliance.stripePayoutsEnabled
    && !(compliance.stripeRequirementsDue?.length));
  const setupAction = (): AffiliateChecklistAction => regionComplete
    ? { type: "set_up_payouts", label: "Set up payouts", endpoint: SET_UP_PAYOUTS_ENDPOINT }
    : { type: "set_region", label: "Add country and state" };
  const stripeMessage = !country || !compliance?.state
    ? "Add your country and state before setting up payouts."
    : !usAffiliate
      ? "Stripe payout setup is currently available for U.S. affiliates only."
      : !inputs.paymentAuthorizationCurrent
        ? "Review and accept the current payment authorization before continuing."
        : undefined;

  const activeHold = Boolean(inputs.adminApplicationHeld || inputs.activeComplianceHold
    || compliance?.adminHoldStatus === "active");
  const blockedApprovalStatuses = ["rejected", "suspended", "terminated"];
  const disapproved = blockedApprovalStatuses.includes(compliance?.adminApprovalStatus ?? "")
    || ["rejected", "disapproved", "suspended", "terminated"].includes(inputs.affiliateStatus ?? "");
  const disapprovalMessage = inputs.affiliateStatus === "suspended" || compliance?.adminApprovalStatus === "suspended"
    ? "This affiliate account was suspended."
    : inputs.affiliateStatus === "terminated" || compliance?.adminApprovalStatus === "terminated"
      ? "This affiliate account was terminated."
      : "This application was disapproved.";

  const items: AffiliateChecklistItem[] = [
    item("agreement", "Partner Agreement", Boolean(agreement), agreement?.agreementVersion ?? null,
      agreement?.acceptedAt ?? null,
      agreement ? null : { type: "contact_admin", label: "Contact admin" }),
    item("privacy", "Privacy Notice", Boolean(privacyAcceptance),
      privacyAcceptance?.documentVersion ?? privacyDocument?.version ?? null,
      privacyAcceptance?.acceptedAt ?? null,
      actionForDocument(privacyDocument, privacyAcceptance),
      { document: documentFor(privacyDocument, "/privacy") }),
    item("ftc", "FTC Disclosure", Boolean(ftcAcceptance),
      ftcAcceptance?.documentVersion ?? ftcDocument?.version ?? null,
      ftcAcceptance?.acceptedAt ?? null,
      actionForDocument(ftcDocument, ftcAcceptance),
      { document: documentFor(ftcDocument) }),
    item("marketing", "Marketing Guidelines", Boolean(marketingAcceptance),
      marketingAcceptance?.documentVersion ?? marketingDocument?.version ?? null,
      marketingAcceptance?.acceptedAt ?? null,
      actionForDocument(marketingDocument, marketingAcceptance),
      { document: documentFor(marketingDocument) }),
    item("tax", "Tax information", taxComplete,
      compliance?.taxStatus ?? null,
      taxComplete ? compliance?.stripeTaxFormLastCheckedAt ?? null : null,
      taxComplete ? null : setupAction(),
      { message: stripeMessage ?? "Stripe must confirm the required tax information is provided and verified." }),
    item("payment", "Payment setup", paymentComplete,
      compliance?.stripeOnboardingStatus ?? null,
      paymentComplete ? compliance?.stripeOnboardingCompletedAt ?? null : null,
      paymentComplete ? null : setupAction(),
      {
        ...(inputs.paymentAuthorizationDocument
          ? { document: documentFor(inputs.paymentAuthorizationDocument) }
          : {}),
        ...(stripeMessage ? { message: stripeMessage } : {}),
      }),
    item("admin", "Admin Approval", !activeHold && !disapproved,
      compliance?.adminApprovalStatus ?? "pending",
      null,
      activeHold || disapproved ? { type: "contact_admin", label: "Contact admin" } : null,
      {
        ...((activeHold || disapproved)
          ? { message: activeHold ? "An administrator has placed this application on hold." : disapprovalMessage }
          : {}),
      }),
  ];
  const completedCount = items.filter((entry) => entry.complete).length;
  const remainingCount = items.length - completedCount;
  return {
    items,
    totalCount: items.length,
    completedCount,
    remainingCount,
    payoutEligible: inputs.payoutEligible,
    header: inputs.payoutEligible ? "Eligible for commission payouts" : `${remainingCount} of ${items.length} steps left`,
  };
}