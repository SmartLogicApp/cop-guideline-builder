/**
 * New paid partner activations stay closed until the owner explicitly confirms
 * that the terms (including the legacy commission schedule) have been reviewed.
 * Both values must be set in the server environment; requests cannot override
 * them. Existing active partners and their earned commissions are unaffected.
 */
export function affiliateActivationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AFFILIATE_ACTIVATION_ENABLED === "true"
    && typeof env.AFFILIATE_REVIEWED_TERMS_VERSION === "string"
    && env.AFFILIATE_REVIEWED_TERMS_VERSION.trim().length > 0;
}

/** Existing active records may still be edited while enrollment is paused. */
export function isBlockedAffiliateActivation(
  currentStatus: string,
  requestedStatus: string,
  enabled: boolean = affiliateActivationEnabled(),
): boolean {
  return requestedStatus === "active" && currentStatus !== "active" && !enabled;
}