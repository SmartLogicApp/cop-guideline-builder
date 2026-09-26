/**
 * Payment acceptance stays off by default. Enabling the UI and API later
 * requires the corresponding development/production configuration to be set
 * explicitly after the payment provider and billing terms are ready.
 */
export function isPaymentAcceptanceEnabled(
  configuredValue = process.env.PAYMENT_ACCEPTANCE_ENABLED,
): boolean {
  return configuredValue?.trim().toLowerCase() === "true";
}

/**
 * Length of the free trial attached to the Stripe Checkout Session, in days.
 *
 * Stripe runs the trial clock; the app mirrors it. Overridable by
 * STRIPE_TRIAL_PERIOD_DAYS so the term can change without a deploy.
 * A value of 0 disables the trial and charges at checkout.
 */
export const DEFAULT_TRIAL_PERIOD_DAYS = 30;
export const LOCAL_TRIAL_CHECKOUT_MIN_REMAINING_MS = 49 * 60 * 60 * 1000;

const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

export function isRecoverableStripeSubscriptionStatus(status: string): boolean {
  return !TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.has(status);
}

export function getTrialPeriodDays(
  configuredValue = process.env.STRIPE_TRIAL_PERIOD_DAYS,
): number {
  const normalized = configuredValue?.trim() ?? "";
  if (!normalized) return DEFAULT_TRIAL_PERIOD_DAYS;
  if (!/^\d+$/.test(normalized)) return DEFAULT_TRIAL_PERIOD_DAYS;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_TRIAL_PERIOD_DAYS;
  return parsed;
}

export function isProductionTrialPeriodExactly30(
  configuredValue = process.env.STRIPE_TRIAL_PERIOD_DAYS,
): boolean {
  const normalized = configuredValue?.trim() ?? "";
  if (!normalized) return true;
  return /^\d+$/.test(normalized) && Number(normalized) === DEFAULT_TRIAL_PERIOD_DAYS;
}

export type CheckoutTrialPlan =
  | { kind: "first-direct"; trialPeriodDays: number }
  | { kind: "existing-local"; trialEnd: number }
  | { kind: "local-trial-active"; trialEnd: number }
  | { kind: "none" };

export function resolveCheckoutTrialPlan({
  subscriptionStatus,
  trialEndsAt,
  hasStripeSubscriptionHistory,
  now = new Date(),
  trialPeriodDays = getTrialPeriodDays(),
}: {
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  hasStripeSubscriptionHistory: boolean;
  now?: Date;
  trialPeriodDays?: number;
}): CheckoutTrialPlan {
  if (hasStripeSubscriptionHistory) return { kind: "none" };

  if (
    (subscriptionStatus === "trial" || subscriptionStatus === "trialing") &&
    trialEndsAt
  ) {
    const trialEnd = Math.floor(trialEndsAt.getTime() / 1000);
    const remainingMs = trialEndsAt.getTime() - now.getTime();
    if (remainingMs <= 0) return { kind: "none" };
    // Stripe Checkout requires subscription_data[trial_end] to be at least
    // 48 hours in the future. Keep a one-hour margin for request/network
    // latency; do not substitute an immediate charge or invent another trial
    // when the local trial is too close to its end.
    if (remainingMs >= LOCAL_TRIAL_CHECKOUT_MIN_REMAINING_MS) {
      return { kind: "existing-local", trialEnd };
    }
    return { kind: "local-trial-active", trialEnd };
  }

  if (subscriptionStatus === "pending_payment") {
    return { kind: "first-direct", trialPeriodDays };
  }
  return { kind: "none" };
}
