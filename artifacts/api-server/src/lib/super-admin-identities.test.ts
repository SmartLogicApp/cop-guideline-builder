import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getSuperAdminIds,
  isSuperAdminId,
  resolveSuperAdmin,
} from "./super-admin-identities.ts";

test("owner access recognizes only exact configured Clerk IDs", () => {
  const configured = " user_dev123 , user_live456 , user_live456, owner@example.com, ";
  assert.deepEqual(getSuperAdminIds(configured, ""), ["user_dev123", "user_live456"]);
  assert.equal(isSuperAdminId("user_live456", configured, ""), true);
  assert.equal(isSuperAdminId("user_dev123", configured, ""), true);
  assert.equal(isSuperAdminId("user_newLiveAccount", configured, ""), false);
  assert.equal(isSuperAdminId("owner@example.com", configured, ""), false);
  assert.equal(isSuperAdminId(null, configured, ""), false);
});

test("the same email in another Clerk environment never grants owner access", () => {
  const productionIds = "user_live456";
  assert.equal(isSuperAdminId("user_dev123", productionIds, ""), false);
  assert.equal(isSuperAdminId("user_live456", productionIds, ""), true);
  assert.equal(isSuperAdminId("User_live456", productionIds, ""), false);
});

test("a production owner ID restores only that owner without replacing other admins", () => {
  const previousAdmins = "user_dev123,user_otherAdmin";
  const productionOwner = "user_live456";
  assert.deepEqual(getSuperAdminIds(previousAdmins, productionOwner), [
    "user_dev123", "user_otherAdmin", "user_live456",
  ]);
  assert.equal(isSuperAdminId(productionOwner, previousAdmins, productionOwner), true);
  assert.equal(isSuperAdminId("user_unlisted", previousAdmins, productionOwner), false);
  assert.equal(isSuperAdminId("owner@example.com", previousAdmins, productionOwner), false);
});

test("the owner's verified primary Clerk email matches case-insensitively", async () => {
  const result = await resolveSuperAdmin("user_owner", async (id) => {
    assert.equal(id, "user_owner");
    return {
      primaryEmailAddressId: "email_primary",
      emailAddresses: [{
        id: "email_primary",
        emailAddress: "  HeCtOrSaMlUt@OuTlOoK.cOm ",
        verification: { status: "verified" },
      }],
    };
  }, "", "");
  assert.deepEqual(result, {
    source: "verified_primary_owner_email",
    lookupFailed: false,
  });
});

test("an unverified owner address cannot grant super-admin access", async () => {
  const result = await resolveSuperAdmin("user_unverified", async () => ({
    primaryEmailAddressId: "email_primary",
    emailAddresses: [{
      id: "email_primary",
      emailAddress: "HectorSamlut@Outlook.com",
      verification: { status: "unverified" },
    }],
  }), "", "");
  assert.deepEqual(result, { source: null, lookupFailed: false });
});

test("a verified secondary address cannot grant super-admin access", async () => {
  const result = await resolveSuperAdmin("user_secondary", async () => ({
    primaryEmailAddressId: "email_primary",
    emailAddresses: [
      {
        id: "email_primary",
        emailAddress: "other@example.com",
        verification: { status: "verified" },
      },
      {
        id: "email_secondary",
        emailAddress: "HectorSamlut@Outlook.com",
        verification: { status: "verified" },
      },
    ],
  }), "", "");
  assert.deepEqual(result, { source: null, lookupFailed: false });
});

test("authorization reads the authenticated Clerk user ID and never a request email", async () => {
  const lookupIds: string[] = [];
  const result = await resolveSuperAdmin("user_attacker", async (id) => {
    lookupIds.push(id);
    return {
      primaryEmailAddressId: "email_primary",
      emailAddresses: [{
        id: "email_primary",
        emailAddress: "attacker@example.com",
        verification: { status: "verified" },
      }],
    };
  }, "", "");
  assert.deepEqual(lookupIds, ["user_attacker"]);
  assert.deepEqual(result, { source: null, lookupFailed: false });
  const guards = readFileSync(new URL("./admin-guards.ts", import.meta.url), "utf8");
  assert.match(guards, /getAuth\(req as any\)/);
  assert.match(guards, /resolveSuperAdmin\(userId\)/);
  assert.doesNotMatch(guards, /req\.(?:body|query|params).*email/i);
});

test("a different Clerk user does not inherit owner access when lookup fails", async () => {
  const result = await resolveSuperAdmin("user_other", async () => {
    throw new Error("Clerk lookup failed");
  }, "", "");
  assert.deepEqual(result, { source: null, lookupFailed: true });
});

test("payout approval and affiliate activation continue to require the shared super-admin guard", () => {
  const affiliateRoutes = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const complianceRoutes = readFileSync(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  assert.match(affiliateRoutes, /router\.post\("\/:id\/approve",\s*requireSuperAdmin/);
  assert.match(complianceRoutes, /router\.post\("\/admin\/payouts\/:id\/approve",\s*requireSuperAdmin/);
  assert.match(complianceRoutes, /router\.post\("\/admin\/payouts\/:id\/send",\s*requireSuperAdmin/);
});

test("admin checks use the same server-resolved identity and retain ordinary-admin separation", () => {
  const guards = readFileSync(new URL("./admin-guards.ts", import.meta.url), "utf8");
  const subscription = readFileSync(new URL("../middlewares/requireActiveSubscription.ts", import.meta.url), "utf8");
  const accounts = readFileSync(new URL("../routes/accounts.ts", import.meta.url), "utf8");
  assert.match(guards, /resolveSuperAdmin\(userId\)/);
  assert.match(guards, /markAdminAuthorization\(req, userId, "active_admin_database_record", false\)/);
  assert.match(subscription, /resolveSuperAdmin\(clerkUserId\)/);
  assert.match(accounts, /router\.get\("\/whoami", requireAuth, async/);
  assert.match(accounts, /router\.get\("\/me", requireAuth, async/);
  assert.match(accounts, /const authorization = await resolveSuperAdmin\(userId\)/);
});