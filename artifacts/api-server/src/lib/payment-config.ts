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