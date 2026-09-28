import type Stripe from "stripe";
import { stripeTaxStatus } from "./affiliate-connect-tax.js";

/**
 * Normalize the Stripe Account fields used by both the hosted-onboarding
 * return sync and signed account.updated webhook before persisting them.
 */
export function affiliateConnectChecklistStatus(
  account: Stripe.Account,
  transferCapabilityActive: boolean,
) {
  const requirementsDue = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ].filter((item): item is string => typeof item === "string").slice(0, 50);
  const detailsSubmitted = Boolean(account.details_submitted);
  const payoutsEnabled = Boolean(account.payouts_enabled) && transferCapabilityActive;
  return {
    detailsSubmitted,
    payoutsEnabled,
    chargesEnabled: Boolean(account.charges_enabled),
    requirementsDue,
    onboardingComplete: detailsSubmitted && payoutsEnabled && requirementsDue.length === 0,
    taxStatus: stripeTaxStatus(account),
  };
}