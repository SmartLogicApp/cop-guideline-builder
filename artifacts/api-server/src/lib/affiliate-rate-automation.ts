import {
  addDays,
  activityWindow,
  pendingRateReductions,
  type ActivityClockInput,
  type PendingRateReduction,
} from "./affiliate-commission.ts";

export const AFFILIATE_RATE_NOTICE_LEAD_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AffiliateRateNoticeType =
  | "activity-period"
  | "grace-period"
  | "zero-restoration-window";

export type AffiliateRateNoticeCandidate = {
  type: AffiliateRateNoticeType;
  deadlineAt: Date;
  currentRatePct: number;
  nextRatePct: number | null;
};

/**
 * Apply every due ladder step in order. Callers must hold the affiliate row
 * lock and run `persist` inside the same transaction; this keeps the rate
 * update and its audit row atomic, including both steps of a late sweep.
 */
export async function applyPendingAffiliateRateReductions(
  input: ActivityClockInput,
  now: Date,
  persist: (reduction: PendingRateReduction) => Promise<void>,
): Promise<PendingRateReduction[]> {
  const reductions = pendingRateReductions(input, now);
  for (const reduction of reductions) {
    await persist(reduction);
  }
  return reductions;
}

export function affiliateRateNoticeCandidates(
  input: ActivityClockInput,
): AffiliateRateNoticeCandidate[] {
  if (input.currentRatePct === 0) {
    return [{
      type: "zero-restoration-window",
      deadlineAt: addDays(input.rateEffectiveAt, 60),
      currentRatePct: 0,
      nextRatePct: 20,
    }];
  }
  if (input.currentRatePct !== 20 && input.currentRatePct !== 10) return [];

  const window = activityWindow(input);
  return [
    {
      type: "activity-period",
      deadlineAt: window.activityPeriodEndsAt,
      currentRatePct: input.currentRatePct,
      nextRatePct: null,
    },
    {
      type: "grace-period",
      deadlineAt: window.graceEndsAt,
      currentRatePct: input.currentRatePct,
      nextRatePct: input.currentRatePct === 20 ? 10 : 0,
    },
  ];
}

/** A UTC calendar-day check gives one full daily scheduler window per notice. */
export function isAffiliateRateNoticeDue(deadlineAt: Date, now: Date): boolean {
  const deadlineDay = Date.UTC(
    deadlineAt.getUTCFullYear(),
    deadlineAt.getUTCMonth(),
    deadlineAt.getUTCDate(),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const noticeDay = deadlineDay - AFFILIATE_RATE_NOTICE_LEAD_DAYS * MS_PER_DAY;
  return today === noticeDay;
}

export function dueAffiliateRateNotices(
  input: ActivityClockInput,
  now: Date,
): AffiliateRateNoticeCandidate[] {
  return affiliateRateNoticeCandidates(input)
    .filter((candidate) => isAffiliateRateNoticeDue(candidate.deadlineAt, now));
}

function formatDeadline(deadlineAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(deadlineAt);
}

export type AffiliateRateNoticeEmail = {
  subject: string;
  text: string;
  html: string;
};

/** Factual deadline notices; no new contractual conditions are introduced. */
export function affiliateRateNoticeEmail(
  candidate: AffiliateRateNoticeCandidate,
): AffiliateRateNoticeEmail {
  const deadline = formatDeadline(candidate.deadlineAt);
  let subject: string;
  let text: string;

  if (candidate.type === "activity-period") {
    subject = "Affiliate commission-rate notice: activity period";
    text = `Your ${candidate.currentRatePct}% commission rate's 12-month activity period ends on ${deadline} (UTC). After that date, the 60-day grace period begins. Your current rate remains in place during the grace period.`;
  } else if (candidate.type === "grace-period") {
    subject = "Affiliate commission-rate notice: grace period";
    text = `Your 60-day grace period at ${candidate.currentRatePct}% is scheduled to end on ${deadline} (UTC). If no new Qualifying Referral is recorded by that deadline, your commission rate will decrease from ${candidate.currentRatePct}% to ${candidate.nextRatePct}% prospectively.`;
  } else {
    subject = "Affiliate commission-rate notice: restoration window";
    text = `Your 60-day automatic restoration window for your 0% rate ends on ${deadline} (UTC). A new Qualifying Referral within that window restores your rate to 20%. After the window expires, restoration requires administrator approval.`;
  }

  const html = `<p>${text}</p><p>This is an informational notice about the dates recorded for your affiliate account.</p>`;
  return { subject, text, html };
}