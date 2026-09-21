/**
 * Two words mean "on trial", and they are not interchangeable.
 *
 * APP_TRIAL_STATUS is the local default set at account creation, before any
 * Stripe subscription exists. Its end date lives in accounts.trial_ends_at.
 *
 * STRIPE_TRIAL_STATUS is what Stripe itself reports, and the webhook writes it
 * verbatim. Stripe owns the subscription, so when it says a subscription is
 * trialing we trust that without re-deriving it from a local date.
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
  if (status === STRIPE_TRIAL_STATUS) return true;
  return status === APP_TRIAL_STATUS &&
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