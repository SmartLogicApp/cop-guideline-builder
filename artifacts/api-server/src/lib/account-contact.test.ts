import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccountContact, resolveAccountContacts } from "./account-contact.ts";

const clerkUser = (email: string | null, overrides = {}) => ({
  firstName: "Ada",
  lastName: "Lovelace",
  primaryEmailAddressId: "primary",
  emailAddresses: email ? [{
    id: "primary",
    emailAddress: email,
    verification: { status: "verified" },
  }] : [],
  primaryPhoneNumberId: "phone",
  phoneNumbers: [{ id: "phone", phoneNumber: "+15551234567" }],
  ...overrides,
});

test("a Clerk contact fills the client report even when the stored email is absent", async () => {
  const contact = await resolveAccountContact(
    [{ clerkUserId: "admin", role: "admin", email: null }],
    async () => clerkUser("ada@example.com"),
  );
  assert.deepEqual(contact, { name: "Ada Lovelace", email: "ada@example.com", phone: "+15551234567" });
});

test("admin contact wins and a verified primary address supersedes a stale stored address", async () => {
  const visited: string[] = [];
  const contact = await resolveAccountContact([
    { clerkUserId: "member", role: "member", email: "member@example.com" },
    { clerkUserId: "admin", role: "admin", email: "old@example.com" },
  ], async (id) => {
    visited.push(id);
    return clerkUser("new@example.com");
  });
  assert.equal(contact.email, "new@example.com");
  assert.deepEqual(visited, ["admin"]);
});

test("an unverified Clerk address cannot replace a stored address", async () => {
  const contact = await resolveAccountContact([
    { clerkUserId: "admin", role: "admin", email: "stored@example.com" },
  ], async () => clerkUser("unverified@example.com", {
    emailAddresses: [{ id: "primary", emailAddress: "unverified@example.com", verification: { status: "unverified" } }],
  }));
  assert.equal(contact.email, "stored@example.com");
});

test("a failed lookup falls back to the stored address, but never silently reports a missing one", async () => {
  const failedLookup = async (): Promise<ReturnType<typeof clerkUser>> => { throw new Error("Clerk unavailable"); };
  assert.deepEqual(await resolveAccountContact(
    [{ clerkUserId: "admin", role: "admin", email: "stored@example.com" }], failedLookup,
  ), { name: null, email: "stored@example.com", phone: null });
  await assert.rejects(
    resolveAccountContact([{ clerkUserId: "admin", role: "admin", email: null }], failedLookup),
    /Unable to resolve account contact/,
  );
});

test("a second linked account user can supply the email if the first has none", async () => {
  const contact = await resolveAccountContact([
    { clerkUserId: "admin", role: "admin", email: null },
    { clerkUserId: "member", role: "member", email: "member@example.com" },
  ], async (id) => clerkUser(id === "member" ? "member@example.com" : null));
  assert.equal(contact.email, "member@example.com");
  const contacts = await resolveAccountContacts(new Map([["account", [
    { clerkUserId: "member", role: "member", email: null },
  ]]]), ["account"], async () => clerkUser("member@example.com"));
  assert.equal(contacts.get("account")?.email, contact.email);
});