import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionClerkCredentials } from "./production-clerk-credentials.ts";

test("production accepts Clerk live credentials", () => {
  assert.doesNotThrow(() => validateProductionClerkCredentials("production", "sk_live_example", "pk_live_example"));
});

test("production rejects development, missing, and unrecognized secrets without echoing them", () => {
  assert.throws(
    () => validateProductionClerkCredentials("production", "sk_test_sensitive", "pk_live_example"),
    /Production startup blocked:.*development credentials.*sk_live_/,
  );
  assert.throws(
    () => validateProductionClerkCredentials("production", undefined, "pk_live_example"),
    /Production startup blocked:.*required/,
  );
  assert.throws(
    () => validateProductionClerkCredentials("production", "invalid", "pk_live_example"),
    /Production startup blocked:.*sk_live_/,
  );
});

test("production rejects development, missing, and unrecognized publishable keys", () => {
  assert.throws(
    () => validateProductionClerkCredentials("production", "sk_live_example", "pk_test_sensitive"),
    /Production startup blocked:.*CLERK_PUBLISHABLE_KEY.*development credentials.*pk_live_/,
  );
  assert.throws(
    () => validateProductionClerkCredentials("production", "sk_live_example", undefined),
    /Production startup blocked:.*CLERK_PUBLISHABLE_KEY.*required/,
  );
  assert.throws(
    () => validateProductionClerkCredentials("production", "sk_live_example", "invalid"),
    /Production startup blocked:.*CLERK_PUBLISHABLE_KEY.*pk_live_/,
  );
});

test("local development accepts development or missing secrets", () => {
  assert.doesNotThrow(() => validateProductionClerkCredentials("development", "sk_test_example", "pk_test_example"));
  assert.doesNotThrow(() => validateProductionClerkCredentials("development", undefined, undefined));
});