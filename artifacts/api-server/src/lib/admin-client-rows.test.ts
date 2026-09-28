import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  includeActiveAffiliateContacts,
  includeTestRows,
  parseIncludeTest,
} from "./admin-client-rows.ts";

const makeClient = (id: string, facilityName: string) => ({
  id, facilityName, createdAt: null, status: "Active", nextBillingDate: null,
  contact: { name: "Workspace admin", email: `${id}@example.com`, phone: null },
  referredBy: null, totalTokens: 0, thisMonth: { totalTokens: 0 }, isClientAccount: true,
});

const makeAffiliate = (id: string, clerkUserId: string | null, status = "active") => ({
  id, status, clerkUserId, companyName: `Affiliate ${id}`, contactName: `Owner ${id}`,
  email: `${id}@example.com`, phone: null, createdAt: null, isTest: false,
});

test("admin clients merges active affiliate owners into existing account rows without losing client accounts", () => {
  const rows = includeActiveAffiliateContacts(
    [makeClient("direct-account", "Direct clinic"), makeClient("consultant-account", "Consultant workspace")],
    [
      { clerkUserId: "affiliate-user", email: "linked@example.com", accountId: "direct-account" },
      { clerkUserId: "consultant-user", email: "consultant@example.com", accountId: "consultant-account" },
    ],
    [
      makeAffiliate("linked", "affiliate-user"),
      makeAffiliate("duplicate-linked", "affiliate-user"),
      makeAffiliate("unlinked", null),
      { ...makeAffiliate("duplicate-unlinked", null), email: "unlinked@example.com" },
      makeAffiliate("pending", "pending-user", "pending"),
    ],
  );

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ type }) => type), ["Affiliate", "Client", "Affiliate"]);
  assert.equal(rows[0].facilityName, "Direct clinic");
  assert.equal(rows[0].id, "direct-account");
  assert.equal(rows[0].isClientAccount, true);
  assert.equal(rows[0].affiliateId, "linked");
  assert.equal(rows[0].clientIsTest, false);
  assert.equal(rows[0].affiliateIsTest, false);
  assert.equal(rows[0].contact?.email, "linked@example.com");
  assert.equal(rows[1].id, "consultant-account");
  assert.equal(rows[1].type, "Client");
  assert.equal(rows[1].isClientAccount, true);
  assert.equal(rows[2].id, "affiliate:unlinked");
  assert.equal(rows[2].affiliateId, "unlinked");
  assert.equal(rows.filter((row) => row.id === "direct-account").length, 1);
  assert.equal(rows.some((row) => row.id.includes("pending")), false);
});

test("the JSON list and CSV export share type classification and preserve the Type column", async () => {
  const admin = await readFile(new URL("../routes/admin.ts", import.meta.url), "utf8");
  assert.match(admin, /includeActiveAffiliateContacts\(clients, allUsers, affiliateRowsRaw, includeTest\)/);
  assert.match(admin, /const rows = includeActiveAffiliateContacts\(clients, allUsers, affiliateRowsRaw, includeTest\);/);
  assert.match(admin, /"Client name", "Type", "Test", "Client Test", "Affiliate Test", "Affiliate ID", "Unique ID"/);
});

test("test clients and affiliates are excluded by default and visible only on explicit inclusion", () => {
  const clients = [
    { ...makeClient("direct-account", "Direct clinic"), isTest: false },
    { ...makeClient("paired-account", "Affiliate-owned clinic"), isTest: false },
    { ...makeClient("test-account", "Test clinic"), isTest: true },
  ];
  const affiliates = [
    { ...makeAffiliate("test-affiliate", "test-user"), email: "affiliate-owner@example.com", isTest: true },
    { ...makeAffiliate("direct-account", "unmatched-user"), isTest: false },
  ];

  assert.deepEqual(includeTestRows(clients).map((row) => row.id), ["direct-account", "paired-account"]);
  assert.deepEqual(parseIncludeTest("true"), true);
  assert.equal(parseIncludeTest("TRUE"), false);
  assert.equal(parseIncludeTest(undefined), false);

  const users = [
    { clerkUserId: "test-user", email: "affiliate-owner@example.com", accountId: "paired-account" },
  ];
  const defaultRows = includeActiveAffiliateContacts(clients, users, affiliates);
  assert.deepEqual(defaultRows.map((row) => row.id), ["direct-account", "paired-account", "affiliate:direct-account"]);
  const liveClient = defaultRows.find((row) => row.id === "paired-account");
  assert.equal(liveClient?.type, "Client",
    "a live client stays visible and classified as a client when its affiliate is test-flagged");
  assert.equal(liveClient?.affiliateId, null,
    "default ownership matching must not expose a test affiliate on a live client row");
  assert.equal(liveClient?.clientIsTest, false);
  assert.equal(liveClient?.affiliateIsTest, false);
  assert.equal(defaultRows.some((row) => row.id === "affiliate:test-affiliate"), false,
    "a test affiliate-only row remains hidden by default");
  assert.equal(defaultRows.some((row) => row.id === "test-account"), false,
    "a test client must be hidden by default");
  assert.equal(new Set(defaultRows.map((row) => row.id)).size, defaultRows.length,
    "client UUIDs and affiliate-only keys must not collide");

  const allRows = includeActiveAffiliateContacts(clients, users, affiliates, true);
  const pairedRow = allRows.find((row) => row.id === "paired-account");
  assert.equal(pairedRow?.type, "Affiliate");
  assert.equal(pairedRow?.isClientAccount, true);
  assert.equal(pairedRow?.affiliateId, "test-affiliate");
  assert.equal(pairedRow?.clientIsTest, false);
  assert.equal(pairedRow?.affiliateIsTest, true);
  assert.equal(pairedRow?.isTest, true);
  assert.equal(allRows.find((row) => row.id === "test-account")?.clientIsTest, true);
  const affiliateOnly = allRows.find((row) => row.id === "affiliate:direct-account");
  assert.equal(affiliateOnly?.affiliateId, "direct-account");
  assert.equal(affiliateOnly?.clientIsTest, false);
  assert.equal(affiliateOnly?.affiliateIsTest, false);
});

test("test flag mutation routes use Super Admin guards and preserve an audit reason", async () => {
  const admin = await readFile(new URL("../routes/admin.ts", import.meta.url), "utf8");
  assert.match(admin, /router\.patch\("\/clients\/:id\/test", requireSuperAdmin/);
  assert.match(admin, /router\.patch\("\/affiliates\/:id\/test", requireSuperAdmin/);
  assert.match(admin, /adminTestFlagAudit/);
  assert.match(admin, /reason\.length < 10/);
  assert.match(admin, /const reportedAccounts = includeTestRows\(allAccounts\)/);
  assert.match(admin, /includeTestRows\(accountRows, includeTest\)/);
});

test("both admin CSV routes honor includeTest=true when building review exports", async () => {
  const admin = await readFile(new URL("../routes/admin.ts", import.meta.url), "utf8");
  const clientExport = admin.slice(
    admin.indexOf('router.get("/clients/download"'),
    admin.indexOf('router.get("/affiliates"', admin.indexOf('router.get("/clients/download"')),
  );
  const affiliateExport = admin.slice(
    admin.indexOf('router.get("/affiliates/download"'),
    admin.indexOf("type AdminTestEntity", admin.indexOf('router.get("/affiliates/download"')),
  );
  assert.match(clientExport, /parseIncludeTest\(req\.query\.includeTest\)/);
  assert.match(clientExport, /includeActiveAffiliateContacts\(clients, allUsers, affiliateRowsRaw, includeTest\)/);
  assert.match(affiliateExport, /parseIncludeTest\(req\.query\.includeTest\)/);
  assert.match(affiliateExport, /includeTestRows\(affiliateRowsRaw, includeTest\)/);
  assert.match(affiliateExport, /includeTestRows\(accountRows, includeTest\)/);
});

test("test flags are included in additive schema and audit table migration", async () => {
  const migration = await readFile(new URL("../../../../lib/db/migrations/0012_admin_test_flags.sql", import.meta.url), "utf8");
  const accountSchema = await readFile(new URL("../../../../lib/db/src/schema/accounts.ts", import.meta.url), "utf8");
  const affiliateSchema = await readFile(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE accounts[\s\S]*ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ALTER TABLE affiliates[\s\S]*ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_test_flag_audit/);
  assert.match(accountSchema, /isTest:\s+boolean\("is_test"\)\.default\(false\)\.notNull\(\)/);
  assert.match(affiliateSchema, /isTest: boolean\("is_test"\)\.default\(false\)\.notNull\(\)/);
});