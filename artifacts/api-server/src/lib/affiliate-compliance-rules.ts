export type EligibilityFacts = {
  affiliateStatus: string;
  country: string | null;
  state: string | null;
  agreementAccepted: boolean;
  privacyAccepted: boolean;
  ftcAccepted: boolean;
  marketingAccepted: boolean;
  taxStatus: string;
  stripeConnected: boolean;
  stripeAccountType: string | null;
  stripeOnboardingStatus: string;
  stripeDetailsSubmitted: boolean;
  stripePayoutsEnabled: boolean;
  paymentAuthorizationAccepted: boolean;
  adminApprovalStatus: string;
  activeHolds: Array<{ holdType: string; reason: string }>;
  payableAmount: number;
  minimumAmount: number;
};

export function payoutEligibilityReasons(facts: EligibilityFacts): string[] {
  const reasons: string[] = [];
  const isUs = Boolean(facts.country && ["US", "USA", "United States"].includes(facts.country));
  const isInternational = Boolean(facts.country && !isUs);
  if (!facts.agreementAccepted) reasons.push("Accept the current Affiliate Partner Agreement.");
  if (!facts.privacyAccepted) reasons.push("Accept the current Privacy Notice.");
  if (!facts.ftcAccepted) reasons.push("Accept the current FTC affiliate disclosure acknowledgement.");
  if (!facts.marketingAccepted) reasons.push("Accept the current Marketing and brand guidelines.");
  if (isInternational) {
    reasons.push("International review required; payouts are not available outside the United States.");
  } else if (!facts.country) {
    reasons.push("Confirm the affiliate's country before payout setup.");
  } else if (!facts.state) {
    reasons.push("Admin must confirm the affiliate's U.S. state and country before payouts.");
  }
  if (facts.affiliateStatus !== "active") reasons.push("Affiliate account must be active and approved by an Admin.");
  if (facts.adminApprovalStatus !== "approved") reasons.push("Admin approval is required.");
  if (isUs && facts.state) {
    if (facts.taxStatus !== "verified_complete") reasons.push("U.S. tax information must be verified as complete.");
    if (!facts.stripeConnected || facts.stripeAccountType !== "express" || facts.stripeOnboardingStatus !== "complete"
        || !facts.stripeDetailsSubmitted || !facts.stripePayoutsEnabled) {
      reasons.push("Complete Stripe Express payment setup with payouts enabled.");
    }
    if (!facts.paymentAuthorizationAccepted) reasons.push("Accept the current payment authorization.");
  }
  if (facts.activeHolds.length) {
    reasons.push(...facts.activeHolds.map((hold) => `${hold.holdType || "Compliance"} hold: ${hold.reason}`));
  }
  if (facts.affiliateStatus === "suspended" || facts.affiliateStatus === "terminated") {
    reasons.push(`Affiliate account is ${facts.affiliateStatus}.`);
  }
  if (facts.payableAmount < facts.minimumAmount) {
    reasons.push(`Payable commissions must meet the $${facts.minimumAmount} minimum (currently $${facts.payableAmount.toFixed(2)}).`);
  }
  return reasons;
}

/** Replayed terminal Connect events are no-ops. */
export function shouldApplyTransferWebhook(currentStatus: string, eventType: string): boolean {
  if (eventType === "transfer.created") return currentStatus === "payout_processing";
  if (eventType === "transfer.reversed") return currentStatus === "paid" || currentStatus === "payout_processing";
  return false;
}