import { clerkClient } from "@clerk/express";

/**
 * Explicitly owner-authorized email identity. It is considered only after
 * looking up the authenticated Clerk user on the server and verifying that
 * this exact address is both the user's primary and verified email.
 */
export const PLATFORM_OWNER_EMAIL = "hectorsamlut@outlook.com";

export type SuperAdminAuthorizationSource =
  | "clerk_user_id_allowlist"
  | "verified_primary_owner_email";

export type ClerkIdentity = {
  primaryEmailAddressId?: string | null;
  emailAddresses?: readonly {
    id: string;
    emailAddress: string;
    verification?: { status: string } | null;
  }[];
};

export type SuperAdminResolution = {
  source: SuperAdminAuthorizationSource | null;
  lookupFailed: boolean;
};

/**
 * Configured Clerk user IDs remain exact-match grants. The owner email is a
 * separate, explicit grant and is never read from request/session data.
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

export function isVerifiedPrimaryOwnerEmail(user: ClerkIdentity): boolean {
  const primaryEmail = user.emailAddresses?.find(
    (entry) => entry.id === user.primaryEmailAddressId,
  );
  return primaryEmail?.verification?.status === "verified"
    && primaryEmail.emailAddress.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}

/**
 * Resolves super-admin status from the authenticated Clerk subject only.
 * Existing ID allowlists short-circuit without a Clerk API request. Email
 * lookup failures fail closed and are surfaced separately so guards can
 * distinguish a verification outage from a confirmed non-owner.
 */
export async function resolveSuperAdmin(
  userId: string | null | undefined,
  lookupUser: (id: string) => Promise<ClerkIdentity> = (id) => clerkClient.users.getUser(id),
  adminIds?: string,
  ownerIds?: string,
): Promise<SuperAdminResolution> {
  if (!userId) return { source: null, lookupFailed: false };
  if (isSuperAdminId(userId, adminIds, ownerIds)) {
    return { source: "clerk_user_id_allowlist", lookupFailed: false };
  }
  try {
    const user = await lookupUser(userId);
    return {
      source: isVerifiedPrimaryOwnerEmail(user) ? "verified_primary_owner_email" : null,
      lookupFailed: false,
    };
  } catch {
    return { source: null, lookupFailed: true };
  }
}