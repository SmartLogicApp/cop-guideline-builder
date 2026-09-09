import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverEntry = readFileSync(
  new URL("../index.ts", import.meta.url),
  "utf8",
);

test("app-owned database schema is not mutated during API startup", () => {
  assert.doesNotMatch(
    serverEntry,
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+ecfr_cache_entries/i,
  );
  assert.doesNotMatch(
    serverEntry,
    /ALTER\s+TABLE\s+accounts/i,
  );
});

test("Stripe setup never blocks or mutates the database during API startup", () => {
  assert.doesNotMatch(serverEntry, /\brunMigrations\b/);
  assert.doesNotMatch(serverEntry, /\bfindOrCreateManagedWebhook\b/);
  assert.doesNotMatch(serverEntry, /\bsyncBackfill\b/);
});