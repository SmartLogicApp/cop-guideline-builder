import { clerkClient } from "@clerk/express";

export type AccountContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type AccountUser = {
  clerkUserId: string;
  role: string | null;
  email: string | null;
};

type ClerkContactUser = {
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: readonly {
    id: string;
    emailAddress: string;
    verification?: { status: string } | null;
  }[];
  primaryPhoneNumberId: string | null;
  phoneNumbers: readonly { id: string; phoneNumber: string }[];
};

const lookupClerkUser = (id: string): Promise<ClerkContactUser> => clerkClient.users.getUser(id);

/**
 * Prefer the account admin's verified Clerk primary email. Registration and
 * older accounts may have a stored email instead; never mistake a failed Clerk
 * lookup with no fallback for an account that truly has no email.
 */
export async function resolveAccountContact(
  users: readonly AccountUser[],
  lookup: (id: string) => Promise<ClerkContactUser> = lookupClerkUser,
): Promise<AccountContact> {
  const ordered = [...users].sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin"));
  let lookupFailed = false;
  for (const user of ordered) {
    const storedEmail = user.email?.trim() || null;
    try {
      const clerkUser = await lookup(user.clerkUserId);
      const primaryEmail = clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId);
      const verifiedEmail = primaryEmail?.verification?.status === "verified"
        ? primaryEmail.emailAddress.trim() || null : null;
      const email = verifiedEmail ?? storedEmail;
      if (!email) continue;
      const name = [clerkUser.firstName?.trim(), clerkUser.lastName?.trim()].filter(Boolean).join(" ") || null;
      const phone = clerkUser.phoneNumbers.find((entry) => entry.id === clerkUser.primaryPhoneNumberId)
        ?.phoneNumber.trim() || null;
      return { name, email, phone };
    } catch {
      if (storedEmail) return { name: null, email: storedEmail, phone: null };
      lookupFailed = true;
    }
  }
  if (lookupFailed) throw new Error("Unable to resolve account contact from Clerk.");
  return { name: null, email: null, phone: null };
}

/** Bound concurrent Clerk requests for the Admin report and CSV export. */
export async function resolveAccountContacts(
  usersByAccount: Map<string, AccountUser[]>,
  accountIds: readonly string[],
  lookup: (id: string) => Promise<ClerkContactUser> = lookupClerkUser,
): Promise<Map<string, AccountContact>> {
  const contacts = new Map<string, AccountContact>();
  for (let offset = 0; offset < accountIds.length; offset += 5) {
    const batch = accountIds.slice(offset, offset + 5);
    await Promise.all(batch.map(async (id) => {
      contacts.set(id, await resolveAccountContact(usersByAccount.get(id) ?? [], lookup));
    }));
  }
  return contacts;
}