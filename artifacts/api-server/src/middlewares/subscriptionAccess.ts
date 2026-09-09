export function hasActiveSubscription(
  account: { subscriptionStatus: string | null; trialEndsAt: Date | null } | null,
  now = new Date(),
): boolean {
  return account?.subscriptionStatus === "active" ||
    (account?.subscriptionStatus === "trial" &&
      account.trialEndsAt != null &&
      account.trialEndsAt > now);
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