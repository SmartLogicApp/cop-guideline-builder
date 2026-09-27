import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const outDir = process.env.BUILD_OUT_DIR ?? 'dist/public';
const html = await readFile(new URL(`../${outDir}/affiliates/index.html`, import.meta.url), 'utf8');

test('affiliate route ships its own crawlable, pre-rendered HTML', () => {
  assert.match(html, /<title>Affiliate Partner Program \| CMS Compliance Suite<\/title>/);
  assert.match(html, /<meta name="description" content="Healthcare compliance consultants and associations can apply to refer facilities to CMS Compliance Suite\. Review commissions, eligibility, and terms\." \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/cmscomplianceguardian\.com\/affiliates\/" \/>/);
  assert.match(html, /<h1\b[^>]*>Become a Vendor or Affiliate<\/h1>/);
  assert.match(html, /we invite you to apply for our referral partnership program/);
  assert.match(html, /<section\b[^>]*\bid="apply"/);
  assert.match(html, /Submit application/);
  assert.doesNotMatch(html, /Navigate healthcare compliance with absolute confidence/);
});