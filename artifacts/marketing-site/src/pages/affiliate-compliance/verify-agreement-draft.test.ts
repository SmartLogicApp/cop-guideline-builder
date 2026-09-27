import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyAgreementDraft } from './verify-agreement-draft.ts';

// Development-only check: synthetic responses, no API requests or publication.
const body = 'Synthetic Partner Agreement body with a non-ASCII character: café.';
const contentSha256 = createHash('sha256').update(body, 'utf8').digest('hex');

test('only the exact UTF-8 body matching its checksum is returned to the review form', async () => {
  const draft = { version: '4.0', body, contentSha256 };
  assert.deepEqual(await verifyAgreementDraft(draft), draft);
  await assert.rejects(verifyAgreementDraft({ ...draft, body: `${body} corrupted` }), /integrity check failed/);
  await assert.rejects(verifyAgreementDraft({ ...draft, contentSha256: '0'.repeat(64) }), /integrity check failed/);
  await assert.rejects(verifyAgreementDraft({ ...draft, contentSha256: 'not-a-digest' }), /integrity check failed/);
});

test('a matching body and checksum cannot be reviewed under an unexpected version', async () => {
  const draft = { version: '4.0', body, contentSha256 };
  for (const version of ['4.1', '3.0', ' 4.0 ', '', null, undefined]) {
    await assert.rejects(verifyAgreementDraft({ ...draft, version }), /not Version 4\.0/);
  }
});

test('review stays unavailable while loading or after a rejected draft', () => {
  const hook = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');
  const form = readFileSync(new URL('./AdminPartnerAgreement.tsx', import.meta.url), 'utf8');
  assert.match(hook, /mutationFn: async \(\) => verifyAgreementDraft\(await fetchAuth\('\/v4-draft'\)\)/);
  assert.match(form, /setCanonicalV4Loaded\(false\);[\s\S]*?form\.reset\(\{ version: '', body: '', confirmedReviewed: false \}\);[\s\S]*?await v4Draft\.mutateAsync\(\)/);
  assert.match(form, /disabled=\{!canonicalV4Loaded \|\| v4Draft\.isPending\}/);
  assert.match(form, /if \(!canonicalV4Loaded \|\| fields\.confirmedReviewed !== true\) return/);
});