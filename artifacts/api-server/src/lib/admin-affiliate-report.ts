import { activityWindow, nextRateDown } from "./affiliate-commission.js";

const ZERO_RATE_RESTORATION_DAYS = 60;

export type ConsultantWorkspaceLink = {
  clerkUserId: string;
  email: string | null;
  hasComplimentaryAccess: boolean;
  accountId: string;
  accountIdentifierType: string;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  subscriptionCurrentPeriodEnd: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionCanceledAt: Date | null;
};

type AffiliateIdentity = {
  clerkUserId: string | null;
  email: string;
  commissionRatePct: number;
  rateEffectiveAt: Date | null;
};

export function affiliateReportStatus(affiliate: { status: string; applicationHeldAt: Date | null }): string {
  if (affiliate.status === "pending" && affiliate.applicationHeldAt) return "Held";
  const labels: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    rejected: "Rejected",
    suspended: "Suspended",
    terminated: "Terminated",
  };
  return labels[affiliate.status] ?? affiliate.status;
}

/** Application rows may have a default rate/date, but only active partners have a live schedule. */
export function affiliateReportRateFields(affiliate: {
  status: string;
  applicationHeldAt: Date | null;
  commissionRatePct: number;
  rateEffectiveAt: Date | null;
  createdAt: Date | null;
  lastQualifyingReferralAt: Date | null;
}, now = new Date()) {
  const status = affiliateReportStatus(affiliate);
  if (status !== "Active") {
    return { status, nextRateChangeDate: null, newRate: null, restorationDeadline: null };
  }
  const nextRate = affiliate.commissionRatePct > 0 ? nextRateDown(affiliate.commissionRatePct) : null;
  const window = nextRate === null ? null : activityWindow({
    currentRatePct: affiliate.commissionRatePct,
    lastQualifyingReferralAt: affiliate.lastQualifyingReferralAt,
    rateEffectiveAt: affiliate.rateEffectiveAt ?? affiliate.createdAt ?? now,
  });
  return {
    status,
    nextRateChangeDate: window?.graceEndsAt ?? null,
    newRate: nextRate,
    restorationDeadline: affiliateRestorationDeadline(affiliate.commissionRatePct, affiliate.rateEffectiveAt),
  };
}

function normalizedEmail(email: string | null | undefined) {
  return email?.trim().toLocaleLowerCase("en-US") ?? "";
}

/**
 * Consultant signup stores the verified Clerk primary email on account_users
 * and binds affiliates.clerk_user_id at the same time. Prefer that immutable
 * Clerk ID. Email fallback is permitted only for an unbound affiliate and an
 * account explicitly registered as a consultant; ambiguous emails never link.
 */
export function findAffiliateConsultantWorkspace(
  affiliate: Pick<AffiliateIdentity, "clerkUserId" | "email">,
  workspaces: ConsultantWorkspaceLink[],
): ConsultantWorkspaceLink | null {
  const consultants = workspaces.filter((workspace) => workspace.accountIdentifierType === "consultant");
  let matches: ConsultantWorkspaceLink[];
  if (affiliate.clerkUserId) {
    matches = consultants.filter((workspace) => workspace.clerkUserId === affiliate.clerkUserId);
  } else {
    const email = normalizedEmail(affiliate.email);
    if (!email) return null;
    matches = consultants.filter((workspace) => normalizedEmail(workspace.email) === email);
  }
  return matches.length === 1 ? matches[0]! : null;
}

export function affiliateRestorationDeadline(
  ratePct: number,
  rateEffectiveAt: Date | null,
): Date | null {
  if (ratePct !== 0 || !rateEffectiveAt) return null;
  const deadline = new Date(rateEffectiveAt);
  deadline.setUTCDate(deadline.getUTCDate() + ZERO_RATE_RESTORATION_DAYS);
  return deadline;
}

function deriveWorkspaceAccess(
  workspace: ConsultantWorkspaceLink | null,
  now: Date,
): { status: string; endDate: Date | null } {
  if (!workspace) return { status: "No linked workspace", endDate: null };
  const status = (workspace.subscriptionStatus ?? "").toLowerCase();

  if (status === "removed") {
    return { status: "Removed", endDate: workspace.subscriptionCanceledAt };
  }
  if (workspace.hasComplimentaryAccess) {
    return { status: "Active (complimentary)", endDate: null };
  }
  if (status === "trial" || status === "trialing") {
    const endDate = workspace.trialEndsAt;
    return endDate && endDate > now
      ? { status: "Trial", endDate }
      : { status: "Trial ended", endDate };
  }
  if (status === "active") {
    if (workspace.subscriptionCancelAtPeriodEnd) {
      return { status: "Canceled (period end)", endDate: workspace.subscriptionCurrentPeriodEnd };
    }
    return { status: "Active", endDate: null };
  }
  if (status === "canceled" || status === "cancelled" || status === "expired") {
    return {
      status: status === "expired" ? "Expired" : "Canceled",
      endDate: workspace.subscriptionCurrentPeriodEnd ?? workspace.subscriptionCanceledAt,
    };
  }
  if (["pending_payment", "incomplete", "incomplete_expired", "past_due", "unpaid"].includes(status)) {
    return { status: "Payment pending", endDate: workspace.subscriptionCurrentPeriodEnd };
  }
  return {
    status: status ? status.replace(/_/g, " ") : "No access",
    endDate: workspace.subscriptionCurrentPeriodEnd,
  };
}

/** Shared source for the affiliate report JSON and CSV workspace/rate fields. */
export function getAffiliateWorkspaceReport(
  affiliate: AffiliateIdentity,
  workspaces: ConsultantWorkspaceLink[],
  now = new Date(),
) {
  const linkedWorkspace = findAffiliateConsultantWorkspace(affiliate, workspaces);
  const access = deriveWorkspaceAccess(linkedWorkspace, now);
  return {
    workspaceAccessStatus: access.status,
    workspaceAccessEndDate: access.endDate,
    restorationDeadline: affiliateRestorationDeadline(
      affiliate.commissionRatePct,
      affiliate.rateEffectiveAt,
    ),
  };
}