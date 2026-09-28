/**
 * Platform owner access is tied to exact Clerk user IDs. Development and
 * production Clerk accounts have different IDs, even for the same email.
 * Never elevate a general admin or an email match to owner access.
 */
export function getSuperAdminIds(
  adminIds = process.env.ADMIN_CLERK_USER_IDS ?? "",
  ownerIds = process.env.OWNER_CLERK_USER_IDS ?? "",
): string[] {
  // Keep the legacy allowlist intact. A production-only owner ID can be added
  // separately without replacing the IDs of other authorized administrators.
  return [...new Set(`${adminIds},${ownerIds}`.split(",")
    .map((id) => id.trim()).filter((id) => id.startsWith("user_")))];
}

export function isSuperAdminId(
  userId: string | null | undefined,
  adminIds?: string,
  ownerIds?: string,
): boolean {
  return Boolean(userId && getSuperAdminIds(adminIds, ownerIds).includes(userId));
}