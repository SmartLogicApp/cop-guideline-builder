import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateProductionClerkCredentials,
} from './validate-clerk-credentials.mjs';

test('accepts Clerk production publishable keys', () => {
  assert.doesNotThrow(() =>
    validateProductionClerkCredentials('pk_live_example'),
  );
});

test('rejects Clerk development publishable keys with publishing guidance', () => {
  assert.throws(
    () => validateProductionClerkCredentials('pk_test_example'),
    /Production build blocked:.*development credentials.*pk_live_/,
  );
});

test('rejects a missing publishable key', () => {
  assert.throws(
    () => validateProductionClerkCredentials(undefined),
    /Production build blocked:.*required/,
  );
});

test('rejects unrecognized Clerk publishable key formats', () => {
  assert.throws(
    () => validateProductionClerkCredentials('example'),
    /Production build blocked:.*pk_live_/,
  );
});