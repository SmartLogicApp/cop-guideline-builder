import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { zodResolver } from '@hookform/resolvers/zod';
import { agreementPublishSchema } from './agreement-publish-schema.ts';

const fields = {
  version: 'reviewed-test',
  body: 'A synthetic full-length reviewed agreement body for validation only. '.repeat(3),
};

test('the form rejects submission without the user checking the review box', () => {
  assert.equal(agreementPublishSchema.safeParse({ ...fields, confirmedReviewed: false }).success, false);
  assert.equal(agreementPublishSchema.safeParse({ ...fields }).success, false);
  assert.equal(agreementPublishSchema.safeParse({ ...fields, confirmedReviewed: true }).success, true);
  assert.equal(agreementPublishSchema.safeParse({ ...fields, version: 'SAMPLE-test', confirmedReviewed: true }).success, false);
});

test('the form resolver does not pass unchecked values to its submit handler', async () => {
  const resolve = zodResolver(agreementPublishSchema);
  const unchecked = await resolve({ ...fields, confirmedReviewed: false }, {}, {
    fields: {}, shouldUseNativeValidation: false,
  });
  assert.deepEqual(unchecked.values, {});
  assert.ok(unchecked.errors.confirmedReviewed);

  const checked = await resolve({ ...fields, confirmedReviewed: true }, {}, {
    fields: {}, shouldUseNativeValidation: false,
  });
  assert.equal(checked.values.confirmedReviewed, true);
  assert.deepEqual(checked.errors, {});
});

test('the rendered form is wired to that validation and disables unchecked publication', () => {
  const component = readFileSync(new URL('./AdminPartnerAgreement.tsx', import.meta.url), 'utf8');
  assert.match(component, /resolver:\s*zodResolver\(agreementPublishSchema\)/);
  assert.match(component, /defaultValues:\s*\{[^}]*confirmedReviewed:\s*false/);
  assert.match(component, /if \(fields\.confirmedReviewed !== true\) return/);
  assert.match(component, /confirmedReviewed:\s*fields\.confirmedReviewed/);
  assert.match(component, /type="checkbox"[^>]*required/);
  assert.match(component, /disabled=\{!reviewed \|\| publish\.isPending \|\| form\.formState\.isSubmitting\}/);
});