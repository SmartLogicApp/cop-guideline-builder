/** Retained for older callers: affiliate enrollment is no longer feature-paused. */
export function affiliateActivationEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return true;
}

/** Retained for older callers: the owner removed the activation pause. */
export function isBlockedAffiliateActivation(
  _currentStatus: string,
  _requestedStatus: string,
  _enabled: boolean = affiliateActivationEnabled(),
): boolean {
  return false;
}