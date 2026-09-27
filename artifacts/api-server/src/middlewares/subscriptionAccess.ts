/**
 * Two words mean "on trial", and they are not interchangeable.
 *
 * APP_TRIAL_STATUS is the local default set at account creation, before any
 * Stripe subscription exists. Its end date lives in accounts.trial_ends_at.
 *
 * STRIPE_TRIAL_STATUS is what Stripe itself reports, and the webhook writes it
 * verbatim. In both trial states the mirrored trial end is an access boundary:
 * it prevents a delayed/missed cancellation webhook from extending a trial.
 * When a Stripe trial converts to a paid subscription Stripe changes the status
 * to "active", which is handled separately.
 *
 * Treating only "trial" as a trial locks out every customer Stripe considers
 * trialing. Use isTrialStatus() rather than comparing to either literal.
 */
export const APP_TRIAL_STATUS = "trial";
export const STRIPE_TRIAL_STATUS = "trialing";

export function isTrialStatus(status: string | null | undefined): boolean {
  return status === APP_TRIAL_STATUS || status === STRIPE_TRIAL_STATUS;
}

export function hasActiveSubscription(
  account: { subscriptionStatus: string | null; trialEndsAt: Date | null } | null,
  now = new Date(),
): boolean {
  const status = account?.subscriptionStatus;
  if (status === "active") return true;
  return isTrialStatus(status) &&
    account?.trialEndsAt != null &&
    account.trialEndsAt > now;
}

export function hasEffectiveAccess({
  isAdminUser,
  hasComplimentaryAccess,
  account,
  now = new Date(),
}: {
  isAdminUser: boolean;
  hasComplimentaryAccess: boolean;
  account: { subscriptionStatus: string | null; trialEndsAt: Date | null } | null;
  now?: Date;
}): boolean {
  return isAdminUser || hasComplimentaryAccess || hasActiveSubscription(account, now);
}