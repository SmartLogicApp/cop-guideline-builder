import assert from "node:assert/strict";
import test from "node:test";

import { resolveTokenUsageAccountId } from "./token-usage-attribution.ts";

test("resolves the sole linked account for a Clerk user", () => {
  assert.equal(
    resolveTokenUsageAccountId([{ accountId: "account-1" }]),
    "account-1",
  );
});

test("does not attribute usage when the Clerk user has no account link", () => {
  assert.equal(resolveTokenUsageAccountId([]), null);
  assert.equal(resolveTokenUsageAccountId([{ accountId: null }]), null);
});

test("rejects ambiguous account links but tolerates duplicate identical links", () => {
  assert.equal(
    resolveTokenUsageAccountId([
      { accountId: "account-1" },
      { accountId: "account-2" },
    ]),
    null,
  );
  assert.equal(
    resolveTokenUsageAccountId([
      { accountId: "account-1" },
      { accountId: "account-1" },
    ]),
    "account-1",
  );
});