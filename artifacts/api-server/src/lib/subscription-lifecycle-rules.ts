const DAY_MS = 24 * 60 * 60 * 1_000;

export type StripeSubscriptionSummary = {
  id: string;
  status: string;
  created: number;
  metadata?: Record<string, string> | null;
};

export type SubscriptionReconciliation = {
  primary: StripeSubscriptionSummary | null;
  duplicates: StripeSubscriptionSummary[];
};

export function isFacilityBillingAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function subscriptionLifecycleHttpStatus(
  failedAccountCount: number,
): 200 | 207 {
  return failedAccountCount > 0 ? 207 : 200;
}

export function isAuthorizedPostRemovalCheckout(input: {
  subscriptionStatus: string | null;
  removedAt: Date | null;
  metadata: Record<string, string> | null | undefined;
  checkoutAuthenticatedAtMilliseconds: number | null | undefined;
}): boolean {
  if (
    input.subscriptionStatus !== "removed" ||
    !input.removedAt ||
    input.metadata?.removalResubscribe !== "true"
  ) return false;
  const removedAtMilliseconds = input.removedAt.getTime();
  const metadataRemovedAt = Number(input.metadata.removedAt);
  const authenticatedAt = Number(input.metadata.authenticatedCheckoutAt);
  const checkoutAuthenticatedAt = input.checkoutAuthenticatedAtMilliseconds;
  return Number.isSafeInteger(metadataRemovedAt) &&
    metadataRemovedAt === removedAtMilliseconds &&
    Number.isSafeInteger(authenticatedAt) &&
    authenticatedAt === checkoutAuthenticatedAt &&
    typeof checkoutAuthenticatedAt === "number" &&
    Number.isFinite(checkoutAuthenticatedAt) &&
    checkoutAuthenticatedAt >= removedAtMilliseconds;
}

/**
 * Deterministically keep one non-terminal Stripe subscription even when
 * completion/webhook events arrive in a different order. Once persisted, the
 * selected subscription remains primary until it becomes terminal.
 */
export function reconcileStripeSubscriptionSet(
  subscriptions: StripeSubscriptionSummary[],
  persistedSubscriptionId: string | null,
): SubscriptionReconciliation {
  const nonTerminal = subscriptions.filter((subscription) =>
    !["canceled", "incomplete_expired"].includes(subscription.status)
  );
  const byOldestCreation = (a: StripeSubscriptionSummary, b: StripeSubscriptionSummary) =>
    a.created - b.created || a.id.localeCompare(b.id);
  const persisted = nonTerminal.find((subscription) =>
    subscription.id === persistedSubscriptionId
  );
  const primary = persisted ?? [...nonTerminal].sort(byOldestCreation)[0] ??
    [...subscriptions].sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))[0] ??
    null;
  return {
    primary,
    duplicates: primary
      ? nonTerminal.filter((subscription) => subscription.id !== primary.id)
      : [],
  };
}

export function isStaleForStripeReconciliation(
  lastStripeSyncAt: Date | null | undefined,
  now = new Date(),
): boolean {
  return !lastStripeSyncAt || now.getTime() - lastStripeSyncAt.getTime() >= DAY_MS;
}

export function chooseCanonicalStripeSubscription(
  subscriptions: StripeSubscriptionSummary[],
): StripeSubscriptionSummary | null {
  const newestFirst = [...subscriptions].sort((a, b) => b.created - a.created);
  return newestFirst.find((subscription) =>
    !["canceled", "incomplete_expired"].includes(subscription.status)
  ) ?? newestFirst[0] ?? null;
}