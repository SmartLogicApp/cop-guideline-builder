export const TRIAL_ACCESS_VIEW = Object.freeze({
  WORKSPACE: "workspace",
  END_STATE: "end-state",
});

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