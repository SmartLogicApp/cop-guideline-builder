export const TRIAL_ACCESS_VIEW: Readonly<{
  WORKSPACE: "workspace";
  END_STATE: "end-state";
}>;

export function isPaymentSetupPending(
  account: { subscriptionStatus?: string | null; trialEndsAt?: Date | null } | null | undefined,
): boolean;

export type TrialSubscription = {
  status?: string | null;
  isActive?: boolean;
  daysLeftInTrial?: number;
};

export type AccountAccessState<T = { clerkUserId?: string }> = {
  requestKey: string | null;
  ownerId: string | null | undefined;
  accountData: T | null;
  status: "loading" | "resolved" | "error";
};

export function getScopedAccountAccess<T extends { clerkUserId?: string }>(
  state: AccountAccessState<T>,
  clerkUserId: string | null | undefined,
): {
  ownerId: string | null | undefined;
  accountData: T | null;
  status: "loading" | "resolved" | "error";
};

export function getTrialAccessView(
  subscription: TrialSubscription | null | undefined,
): (typeof TRIAL_ACCESS_VIEW)[keyof typeof TRIAL_ACCESS_VIEW];