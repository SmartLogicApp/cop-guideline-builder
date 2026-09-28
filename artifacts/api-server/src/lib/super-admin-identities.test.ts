import assert from "node:assert/strict";
import test from "node:test";
import { getSuperAdminIds, isSuperAdminId } from "./super-admin-identities.ts";

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