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

test("Stripe credentials are confirmed before its vendor migration runs", () => {
  const connectorCheck = serverEntry.indexOf(
    "const stripeSync = await getStripeSync();",
  );
  const vendorMigration = serverEntry.indexOf(
    "await runMigrations({ databaseUrl });",
  );

  assert.notEqual(connectorCheck, -1);
  assert.notEqual(vendorMigration, -1);
  assert.ok(connectorCheck < vendorMigration);
});