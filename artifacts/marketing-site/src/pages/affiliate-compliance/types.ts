export const PAYOUT_CHECKLIST_ORDER = [
  'agreement',
  'privacy',
  'ftc',
  'marketing',
  'tax',
  'payment',
  'admin',
] as const;

export type PayoutChecklistKey = typeof PAYOUT_CHECKLIST_ORDER[number];

export interface PayoutChecklistAction {
  type: 'acknowledge_document' | 'set_up_payouts' | 'set_region' | 'review_agreement' | 'contact_admin';
  label: string;
  endpoint?: string;
  documentVersionId?: string;
}

export interface AcknowledgeDocumentInput {
  documentVersionId: string;
  typedLegalName: string;
  agreed: boolean;
}

export function buildAcknowledgementPayload(input: AcknowledgeDocumentInput) {
  return { ...input, confirmedReviewed: true as const };
}

export interface ComplianceDocument {
  id: string;
  version: string;
  title: string;
  content: string;
  url?: string;
}

export interface PayoutChecklistItem {
  key: PayoutChecklistKey;
  title: string;
  complete: boolean;
  status: 'Complete' | 'Action needed';
  version: string | null;
  completedAt: string | null;
  action: PayoutChecklistAction | null;
  message?: string | null;
  document?: ComplianceDocument | null;
}

export interface AffiliatePortalData {
  affiliate?: { id: string; contactName?: string | null; companyName?: string | null; email?: string | null };
  checklist?: PayoutChecklistItem[];
  eligible?: boolean;
  blocking_reasons?: string[];
  country?: string;
  state?: string | null;
  internationalReviewRequired?: boolean;
  paymentAuthorizationText?: string | null;
  paymentAuthorizationVersion?: string | null;
  paymentAuthorizationAccepted?: boolean;
  stripe?: {
    onboardingStatus?: string;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    taxStatus?: string;
  };
}

export interface AdminAffiliateDetailData {
  legalName?: string | null;
  businessName?: string | null;
  email?: string | null;
  overallStatus?: string;
  payoutEligibility?: boolean;
  blockingReasons?: string[];
  country?: string | null;
  state?: string | null;
  referralCode?: string | null;
  commissionBalance?: number;
  affiliate?: {
    id?: string;
    status?: string;
    applicationHeldAt?: string | null;
    applicationHoldReason?: string | null;
    legalName?: string | null;
    contactName?: string | null;
    businessName?: string | null;
    companyName?: string | null;
    email?: string | null;
  };
  checklist?: PayoutChecklistItem[];
  eligibility?: {
    eligible?: boolean;
    overall_status?: string;
    blocking_reasons?: string[];
  };
  auditLog?: any[];
  [key: string]: unknown;
}

export interface AdminAccountAccessData {
  isAdminUser: boolean;
  isSuperAdmin: boolean;
}

export interface PayoutSummary {
  id: string;
  affiliateId: string;
  affiliateName?: string | null;
  stripeTransferId?: string | null;
  quarter?: string | null;
  testLinked?: boolean;
  payoutPeriodStart: string;
  payoutPeriodEnd: string;
  payoutStatus: string;
  currency: string;
  grossCommissionAmount: string | number;
  adjustmentsAmount: string | number;
  netPayoutAmount: string | number;
  createdAt: string;
  paidAt: string | null;
  failureReason?: string | null;
  eligibility?: { eligible: boolean; blocking_reasons?: string[] };
}

export interface PayoutStatement {
  payout: PayoutSummary;
  yearToDatePaidUsd?: string | number | null;
  yearToDateYear?: string | number | null;
  lines: {
    clientName: string;
    billingMonth: string;
    billingMonthSource: 'invoice_line_period' | 'invoice_period' | 'payment_month_fallback';
    clientPaymentUsd: string | number;
    commissionRatePct: string | number;
    commissionAmountUsd: string | number;
    commissionStatus: string;
    holdbackReleaseAt?: string | null;
  }[];
  adjustmentLines?: {
    type: string;
    description: string;
    amountUsd: string | number;
    clientName?: string | null;
  }[];
  totalClientPaymentUsd: string | number;
  totalCommissionUsd: string | number;
  adjustmentsAmount: string | number;
  netPayoutAmount: string | number;
}

export type RecoveryDecision = 'recovered' | 'waived';

export interface PaidCommissionRecoveryReview {
  affiliateId: string;
  affiliateName: string;
  stripeInvoiceId: string;
  chargeAmountUsd: string | number;
  refundedAmountUsd: string | number;
  disputeStatus: string | null;
  recoveryReviewReason: string;
  updatedAt: string;
  clientName?: string | null;
  commissionAmountUsd?: string | number | null;
  stripePaymentIntentId?: string | null;
}

export function recoveryResolutionIsValid(decision: RecoveryDecision | null, reason: string): boolean {
  return decision !== null && reason.trim().length >= 10;
}

export function payoutStatusLabel(status: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'reversal_review_required') return 'Reversal review required';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function billingMonthUTC(value: string): string {
  const date = new Date(/^\d{4}-\d{2}$/.test(value) ? `${value}-01T00:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export type SuperAdminAccessState = 'checking' | 'unavailable' | 'super_admin' | 'ordinary_admin';

export function affiliateApplicationActivationGate(
  agreementAccepted: boolean,
  applicationHeld: boolean,
  superAdminAccess: SuperAdminAccessState,
) {
  const blockingReasons: string[] = [];
  if (superAdminAccess === 'checking') {
    blockingReasons.push('Super-admin permissions are being checked; activation is temporarily disabled.');
  } else if (superAdminAccess === 'unavailable') {
    blockingReasons.push('Super-admin permissions could not be verified; activation is disabled. Refresh and try again.');
  } else if (superAdminAccess === 'ordinary_admin') {
    blockingReasons.push('Only super-admins can activate affiliate applications. Ordinary admins can review but cannot activate.');
  }
  if (applicationHeld) blockingReasons.push('Release the application hold before activation.');
  if (!agreementAccepted) {
    blockingReasons.push('The applicant must accept the current reviewed Partner Agreement before activation.');
  }

  return { canActivate: blockingReasons.length === 0, blockingReasons };
}

export function orderPayoutChecklist(items: PayoutChecklistItem[] | undefined): PayoutChecklistItem[] {
  const byKey = new Map((items ?? []).map((item) => [item.key, item]));
  return PAYOUT_CHECKLIST_ORDER.flatMap((key) => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
}

export function payoutChecklistNeedsRegion(items: PayoutChecklistItem[] | undefined) {
  return (items ?? []).some((item) =>
    (item.key === 'tax' || item.key === 'payment') && item.action?.type === 'set_region',
  );
}

export function payoutChecklistProgress(items: PayoutChecklistItem[] | undefined, payoutEligible: boolean) {
  const orderedItems = orderPayoutChecklist(items);
  const completed = orderedItems.filter(isChecklistComplete).length;
  const allSevenComplete = orderedItems.length === PAYOUT_CHECKLIST_ORDER.length
    && completed === PAYOUT_CHECKLIST_ORDER.length;
  const eligible = allSevenComplete && payoutEligible;

  return {
    items: orderedItems,
    completed,
    remaining: PAYOUT_CHECKLIST_ORDER.length - completed,
    eligible,
    heading: eligible ? 'Eligible for commission payouts' : `${PAYOUT_CHECKLIST_ORDER.length - completed} of ${PAYOUT_CHECKLIST_ORDER.length} steps left`,
  };
}

export function checklistAcceptanceDetails(item: PayoutChecklistItem) {
  if (!['agreement', 'privacy', 'ftc', 'marketing'].includes(item.key)) return null;
  const timestamp = item.completedAt;
  const version = item.version;
  if (!isChecklistComplete(item) || !timestamp || !version) return null;
  return { timestamp, version };
}

export function isChecklistComplete(item: PayoutChecklistItem) {
  return item.complete === true && item.status === 'Complete';
}