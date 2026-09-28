import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canSubmitApplication } from './affiliates-agreement.ts';

const agreement = { version: '4.0', body: 'Published document', contentSha256: 'a'.repeat(64) };

test('the form cannot submit until the published agreement is loaded and checked', () => {
  assert.equal(canSubmitApplication(null, true, false), false);
  assert.equal(canSubmitApplication(agreement, false, false), false);
  assert.equal(canSubmitApplication(agreement, true, true), false);
  assert.equal(canSubmitApplication(agreement, true, false), true);
  const form = readFileSync(new URL('./affiliates.tsx', import.meta.url), 'utf8');
  assert.match(form, /if \(!canSubmitApplication\(agreement, agreed, agreementLoading\) \|\| !agreement\) return/);
  assert.match(form, /disabled=\{status === 'sending' \|\| !canSubmitApplication\(agreement, agreed, agreementLoading\)\}/);
  assert.match(form, /type="checkbox" checked=\{agreed\}[\s\S]*?required data-testid="checkbox-agreement"/);
  assert.match(form, /agreementSha256: agreement\.contentSha256/);
});

test('duplicate affiliate email points the applicant to sign in instead of creating a second application', () => {
  const form = readFileSync(new URL('./affiliates.tsx', import.meta.url), 'utf8');
  assert.match(form, /if \(conflict\?\.code === 'APPLICATION_ALREADY_EXISTS'\) \{[\s\S]*?setStatus\('error'\);[\s\S]*?setSignInAfterDuplicate\(true\);[\s\S]*?Sign in to continue/);
  assert.match(form, /Sign in<\/a>/);
  assert.match(form, /if \(!response\.ok\) throw new Error\('Application submission failed'\);\s*setStatus\('sent'\)/);
});

test('affiliate enrollment explains immediate verified signup and the separate 30-day workspace trial', () => {
  const form = readFileSync(new URL('./affiliates.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(form, /We review every application manually/, "manual-review wording must not return");
  assert.match(form, /30 days of full workspace access/);
  assert.match(form, /first \$299\/month charge is on day 31/);
  assert.match(form, /new URLSearchParams\(\{\s*affiliate: '1',\s*email: form\.email\.trim\(\)\.toLowerCase\(\),\s*company: form\.companyName\.trim\(\)/);
});

test('older pending applications without acceptance retain the invitation button', () => {
  const admin = readFileSync(new URL('../../../../index.jsx', import.meta.url), 'utf8');
  const applications = admin.slice(admin.indexOf('function AffiliateApplicationsSection('), admin.indexOf('function AdminQuickPanel('));
  assert.match(applications, /row\.agreementAcceptance\.invitationId == null \? "with application" : "after invitation"/);
  assert.match(applications, /isSuperAdmin && !row\.agreementAcceptance && <button[^>]*[\s\S]*?Send agreement invitation/);
  assert.match(applications, /isSuperAdmin && agreementStatus\?\.published && row\.agreementAcceptance\?\.version === agreementStatus\.version && !row\.applicationHeldAt && <>/);
  assert.doesNotMatch(applications, /activationEnabled|paid partner approvals are paused|paid approvals paused/i);
  assert.match(applications, /!loading && isSuperAdmin && <section[\s\S]*?type="checkbox" checked=\{confirmedReviewed\}/);
  assert.match(applications, /disabled=\{actionBusy \|\| !confirmedReviewed \|\| !agreementStatus\}[\s\S]*?Publish immutable agreement version/);
});

test('application review exposes hold and release while approval generates its code on the server', () => {
  const admin = readFileSync(new URL('../../../../index.jsx', import.meta.url), 'utf8');
  const applications = admin.slice(admin.indexOf('function AffiliateApplicationsSection('), admin.indexOf('function AdminQuickPanel('));
  assert.match(applications, /\/hold`/);
  assert.match(applications, /\/release-hold`/);
  assert.match(applications, /row\.applicationHeldAt && <p role="status"/);
  assert.match(applications, /row\.agreementAcceptance\?\.version === agreementStatus\.version && !row\.applicationHeldAt/);
  assert.match(applications, /body: JSON\.stringify\(\{ commissionRatePct: ratesById\[row\.id\] \?\? 20 \}\)/);
  assert.doesNotMatch(applications.slice(applications.indexOf('async function approve('), applications.indexOf('async function hold(')), /window\.prompt/);
});