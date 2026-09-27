const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { validateProductionClerkCredentials } = require('./validate-clerk-credentials');

const mobileDir = path.resolve(__dirname, '..');

test('production mobile build accepts a live publishable key', () => {
  assert.doesNotThrow(() => validateProductionClerkCredentials({ CLERK_PUBLISHABLE_KEY: 'pk_live_example' }));
  assert.doesNotThrow(() => validateProductionClerkCredentials({ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_example' }));
});

test('production mobile build rejects development keys even when another key is live', () => {
  for (const credentials of [
    { CLERK_PUBLISHABLE_KEY: 'pk_test_example' },
    { CLERK_PUBLISHABLE_KEY: 'pk_live_example', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' },
  ]) {
    assert.throws(
      () => validateProductionClerkCredentials(credentials),
      /Production mobile build blocked:.*development credentials.*pk_live_/,
    );
  }
});

test('production mobile build rejects absent and unrecognized keys', () => {
  assert.throws(() => validateProductionClerkCredentials({}), /Production mobile build blocked:.*required/);
  assert.throws(
    () => validateProductionClerkCredentials({ CLERK_PUBLISHABLE_KEY: 'invalid' }),
    /Production mobile build blocked:.*pk_live_/,
  );
});

test('release build entry rejects a development key before replacing build output', () => {
  const result = spawnSync(process.execPath, ['scripts/build.js'], {
    cwd: mobileDir,
    encoding: 'utf8',
    env: { ...process.env, CLERK_PUBLISHABLE_KEY: 'pk_test_example', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production mobile build blocked:.*development credentials/);
  assert.doesNotMatch(result.stdout, /Preparing build directories/);
});

test('local mobile development command does not run the release guard', () => {
  const { readFileSync } = require('node:fs');
  const scripts = JSON.parse(readFileSync(path.join(mobileDir, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.dev, /expo start/);
  assert.doesNotMatch(scripts.dev, /validate-clerk-credentials|scripts\/build\.js/);
});