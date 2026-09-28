/**
 * Resolve the owning account for a Clerk user before writing usage. A missing
 * account link is not attributable and must never be recorded as an unowned
 * token row; multiple distinct account links are treated as ambiguous.
 */
export function resolveTokenUsageAccountId(
  memberships: ReadonlyArray<{ accountId: string | null }>,
): string | null {
  const accountIds = new Set(
    memberships
      .map(({ accountId }) => accountId)
      .filter((accountId): accountId is string => Boolean(accountId)),
  );
  return accountIds.size === 1 ? [...accountIds][0]! : null;
}