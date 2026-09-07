export function hasActiveSubscription(
  account: { subscriptionStatus: string | null; trialEndsAt: Date | null } | null,
  now = new Date(),
): boolean {
  return account?.subscriptionStatus === "active" ||
    (account?.subscriptionStatus === "trial" &&
      account.trialEndsAt != null &&
      account.trialEndsAt > now);
}