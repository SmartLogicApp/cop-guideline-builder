import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateProductionClerkCredentials,
} from './validate-clerk-credentials.mjs';

const marketingSiteDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workspaceRoot = path.resolve(marketingSiteDir, '..', '..');
const contractBuildOutDir = 'dist/clerk-credential-contract';

function runContractBuild(extraEnv = {}) {
  return spawnSync(
    'pnpm',
    ['exec', 'vite', 'build', '--config', 'vite.config.ts'],
    {
      cwd: marketingSiteDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASE_PATH: '/',
        BUILD_OUT_DIR: contractBuildOutDir,
        PORT: '4176',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_browser_contract',
        ...extraEnv,
      },
    },
  );
}

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

test('only the explicit Playwright browser-test configuration can build with development credentials', () => {
  const defaultBuild = runContractBuild({
    CLERK_AUTH_BROWSER_TEST: '',
  });

  assert.notEqual(defaultBuild.status, 0);
  assert.match(
    `${defaultBuild.stdout}\n${defaultBuild.stderr}`,
    /Production build blocked:.*development credentials/,
  );

  const playwrightConfig = readFileSync(
    path.join(workspaceRoot, 'playwright.config.ts'),
    'utf8',
  );
  const browserTestFlags = playwrightConfig.match(
    /CLERK_AUTH_BROWSER_TEST:\s*["']true["']/g,
  );

  assert.equal(
    browserTestFlags?.length,
    2,
    'Both Playwright marketing-site web servers must explicitly opt into development Clerk credentials.',
  );

  const browserTestBuild = runContractBuild({
    CLERK_AUTH_BROWSER_TEST: 'true',
  });

  try {
    assert.equal(
      browserTestBuild.status,
      0,
      `${browserTestBuild.stdout}\n${browserTestBuild.stderr}`,
    );
  } finally {
    rmSync(path.join(marketingSiteDir, contractBuildOutDir), {
      force: true,
      recursive: true,
    });
  }
});
