export const TRIAL_ACCESS_VIEW: Readonly<{
  WORKSPACE: "workspace";
  END_STATE: "end-state";
}>;

export type TrialSubscription = {
  status?: string | null;
  isActive?: boolean;
  daysLeftInTrial?: number;
};

export function getTrialAccessView(
  subscription: TrialSubscription | null | undefined,
): (typeof TRIAL_ACCESS_VIEW)[keyof typeof TRIAL_ACCESS_VIEW];