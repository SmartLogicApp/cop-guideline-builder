export const TRIAL_ACCESS_VIEW = Object.freeze({
  WORKSPACE: "workspace",
  END_STATE: "end-state",
});

export function isPaymentSetupPending(account) {
  return account?.subscriptionStatus === "pending_payment";
}

// Never expose access resolved for another Clerk identity, including during
// the render before the effect for a newly signed-in user starts its request.
export function getScopedAccountAccess(identityState, clerkUserId) {
  if (!clerkUserId || identityState.requestKey !== clerkUserId) {
    return { ownerId: undefined, accountData: null, status: "loading" };
  }
  if (identityState.accountData?.clerkUserId !== undefined &&
      identityState.accountData.clerkUserId !== clerkUserId) {
    return { ownerId: undefined, accountData: null, status: "error" };
  }
  return {
    ownerId: identityState.ownerId,
    accountData: identityState.accountData,
    status: identityState.status,
  };
}

export function getTrialAccessView(subscription) {
  const accessEnded = subscription !== undefined && (
    subscription === null ||
    subscription.isActive === false ||
    (subscription.status === "trial" && subscription.daysLeftInTrial === 0)
  );

  return accessEnded
    ? TRIAL_ACCESS_VIEW.END_STATE
    : TRIAL_ACCESS_VIEW.WORKSPACE;
}