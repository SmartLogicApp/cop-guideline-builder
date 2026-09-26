import { addDays, type CommissionRatePct } from "./affiliate-commission.ts";

export type ReferralRateDecision =
  | { kind: "accrue"; ratePct: CommissionRatePct; restored: boolean; rateEffectiveAt: Date }
  | { kind: "zero-rate" }
  | { kind: "out-of-order-payment" };

export function acceptanceCoversPayment(acceptedAt: Date, paidAt: Date): boolean {
  return acceptedAt.getTime() <= paidAt.getTime();
}

/**
 * Resolve the rate for a payment after any reductions effective by `paidAt`
 * have been applied. A payment earlier than the current rate's effective date
 * needs historical-rate review; using the mutable current rate could
 * miscalculate money or backdate a restoration.
 */
export function resolveReferralRate(input: {
  currentRatePct: number;
  rateEffectiveAt: Date;
  paidAt: Date;
  firstQualifyingReferral: boolean;
}): ReferralRateDecision {
  const { currentRatePct, rateEffectiveAt, paidAt, firstQualifyingReferral } = input;
  if (paidAt.getTime() < rateEffectiveAt.getTime()) {
    return { kind: "out-of-order-payment" };
  }

  if (!firstQualifyingReferral) {
    if (currentRatePct === 0) return { kind: "zero-rate" };
    if (currentRatePct !== 10 && currentRatePct !== 20) return { kind: "zero-rate" };
    return {
      kind: "accrue",
      ratePct: currentRatePct,
      restored: false,
      rateEffectiveAt,
    };
  }

  if (currentRatePct === 10) {
    return { kind: "accrue", ratePct: 20, restored: true, rateEffectiveAt: paidAt };
  }
  if (currentRatePct === 0) {
    const restorationDeadline = addDays(rateEffectiveAt, 60);
    if (paidAt.getTime() > restorationDeadline.getTime()) return { kind: "zero-rate" };
    return { kind: "accrue", ratePct: 20, restored: true, rateEffectiveAt: paidAt };
  }
  if (currentRatePct !== 20) return { kind: "zero-rate" };
  return { kind: "accrue", ratePct: 20, restored: false, rateEffectiveAt };
}

export function latestQualifyingReferralAt(current: Date | null, paidAt: Date): Date {
  return current && current.getTime() > paidAt.getTime() ? current : paidAt;
}