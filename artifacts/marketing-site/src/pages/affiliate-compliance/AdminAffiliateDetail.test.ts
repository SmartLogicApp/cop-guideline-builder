import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { affiliateApplicationActivationGate } from './types';

const detailPage = readFileSync(new URL('./AdminAffiliateDetail.tsx', import.meta.url), 'utf8');
const hooks = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');

test('activation is enabled only for a super-admin after current agreement acceptance and hold release', () => {
  assert.deepEqual(affiliateApplicationActivationGate(true, false, 'super_admin'), {
    canActivate: true,
    blockingReasons: [],
  });

  const missingAcceptance = affiliateApplicationActivationGate(false, false, 'super_admin');
  assert.equal(missingAcceptance.canActivate, false);
  assert.match(missingAcceptance.blockingReasons.join(' '), /current reviewed Partner Agreement/);

  const held = affiliateApplicationActivationGate(true, true, 'super_admin');
  assert.equal(held.canActivate, false);
  assert.match(held.blockingReasons.join(' '), /Release the application hold/);

  const ordinaryAdmin = affiliateApplicationActivationGate(true, false, 'ordinary_admin');
  assert.equal(ordinaryAdmin.canActivate, false);
  assert.match(ordinaryAdmin.blockingReasons.join(' '), /Only super-admins can activate/);
});

test('the detail UI gates activation from the server checklist and account permission state', () => {
  assert.match(detailPage, /affiliate\.checklist\?\.find\(\(item\) => item\.key === 'agreement'\)/);
  assert.match(detailPage, /affiliateApplicationActivationGate\(/);
  assert.match(detailPage, /adminAccess\.isFetching \|\| !adminAccess\.data/);
  assert.match(detailPage, /disabled=\{decision\.isPending \|\| !activationGate\.canActivate\}/);
  assert.match(detailPage, /data-testid="application-activation-blockers"/);
  assert.match(detailPage, /data-testid="button-approve-application"/);
  assert.match(hooks, /useAdminAccountAccess/);
  assert.match(hooks, /useFetchAuth\('\/api\/accounts'\)/);
  assert.match(hooks, /queryFn: \(\) => fetchAuth\('\/me', \{ cache: 'no-store' \}\)/);
});