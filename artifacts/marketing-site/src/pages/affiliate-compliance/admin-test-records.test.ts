import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const clients = read('AdminClients.tsx');
const affiliates = read('AdminAffiliatesList.tsx');
const payouts = read('AdminPayouts.tsx');
const hooks = read('hooks.ts');

test('test records are hidden by default and each explicit review view fetches the includeTest list', () => {
  assert.match(clients, /includeTest \|\| \(!isClientTestRecord\(client\) && !isAffiliateTestRecord\(client\)\)/);
  assert.match(clients, /clients\$\{includeTest \? "\?includeTest=true" : ""\}/);
  assert.match(clients, /data-testid="toggle-show-test-clients"/);
  assert.match(affiliates, /includeTest \|\| affiliate\.isTest !== true/);
  assert.match(affiliates, /affiliates\$\{includeTest \? "\?includeTest=true" : ""\}/);
  assert.match(affiliates, /data-testid="toggle-show-test-affiliates"/);
  assert.match(payouts, /useAdminPayouts\(includeTest && isSuperAdmin\)/);
  assert.match(payouts, /data-testid="toggle-show-test-payouts"/);
  assert.match(hooks, /queryKey: \['admin-affiliates', includeTest\]/);
  assert.match(hooks, /fetchAuth\(`\/admin\$\{includeTest \? '\?includeTest=true' : ''\}`\)/);
  assert.match(affiliates, /type=\$\{type\}\$\{includeTest \? "&includeTest=true" : ""\}/);
  assert.match(clients, /clients\/download\$\{includeTest \? "\?includeTest=true" : ""\}/);
});

test('record mutation requires a verified Super Admin, explicit confirmation, and written explanation', () => {
  for (const source of [clients, affiliates]) {
    assert.match(source, /useAdminAccountAccess\(true\)/);
    assert.match(source, /!adminAccess\.isError && adminAccess\.data\?\.isSuperAdmin === true/);
    assert.match(source, /if \(!isSuperAdmin\) return/);
    assert.match(source, /window\.confirm\(confirmation\)/);
    assert.match(source, /window\.prompt\(`Required:/);
    assert.match(source, /reason\.trim\(\)\.length < 10/);
    assert.match(source, /data and history will be preserved/);
    assert.match(source, /omitted from admin counts and payout selection/);
  }

  assert.match(hooks, /const collection = recordType === 'client' \? 'clients' : 'affiliates'/);
  assert.match(hooks, /method: 'PATCH'/);
  assert.match(hooks, /body: JSON\.stringify\(\{ isTest, reason: reason\.trim\(\) \}\)/);
  assert.match(hooks, /invalidateQueries\(\{ queryKey: \['admin-stats'\] \}\)/);
  assert.match(hooks, /invalidateQueries\(\{ queryKey: \['admin-payouts'\] \}\)/);
});

test('test affiliates and payouts are visibly tagged and cannot be approved or sent', () => {
  assert.match(clients, /isClientTestRecord\(client\) && <span[^>]*>Test client<\/span>/);
  assert.match(clients, /isAffiliateTestRecord\(client\) && <span[^>]*>Test affiliate<\/span>/);
  assert.match(clients, /setTestFlag\(client, "affiliate", client\.affiliateId!, isAffiliateTestRecord\(client\)\)/);
  assert.match(clients, /setTestFlag\(client, "client", client\.id, isClientTestRecord\(client\)\)/);
  assert.match(clients, /client\.affiliateId && !client\.isClientAccount \? client\.affiliateId : client\.id/);
  assert.match(affiliates, /affiliate\.isTest === true && <span[^>]*>Test<\/span>/);
  assert.match(payouts, /payout\.testLinked === true \|\| affiliate\?\.isTest === true/);
  assert.match(payouts, /data-testid=\{`badge-test-payout-\$\{payout\.id\}`\}/);
  assert.match(payouts, /disabled=\{isTestPayout \|\| !payout\.eligibility\?\.eligible\}/);
  assert.match(payouts, />Approve<\/Button>/);
  assert.match(payouts, />Send<\/Button>/);
});