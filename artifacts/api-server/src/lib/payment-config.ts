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

export function getTrialPeriodDays(
  configuredValue = process.env.STRIPE_TRIAL_PERIOD_DAYS,
): number {
  const parsed = Number.parseInt(configuredValue?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TRIAL_PERIOD_DAYS;
  return parsed;
}