import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  AFFILIATE_AGREEMENT_V4_VERSION,
  isCanonicalAffiliateAgreementPublication,
  prepareAffiliateAgreementV4,
} from "./affiliate-agreement-v4.ts";

const sourceUrl = new URL("../legal/affiliate-partner-agreement-v4-source.txt", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

function normalizedParagraphs(text: string): string[] {
  return text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

test("Version 4.0 is derived from the DOCX text with exactly the two approved corrections", () => {
  const oldAddress = "550 Biltmore Way, Suite 200";
  const newAddress = "550 Biltmore Way, Suite 209";
  const removedBullets = new Set([
    "•  IP address or other technical acceptance information;",
    "•  applicable program version;",
  ]);

  const sourceParagraphs = normalizedParagraphs(source);
  assert.equal(source.split(oldAddress).length - 1, 2, "the supplied DOCX has exactly two address occurrences");
  for (const bullet of removedBullets) {
    assert.equal(sourceParagraphs.filter((paragraph) => paragraph === bullet).length, 1);
  }

  const expectedParagraphs = sourceParagraphs
    .filter((paragraph) => !removedBullets.has(paragraph))
    .map((paragraph) => paragraph.replaceAll(oldAddress, newAddress));
  const actual = prepareAffiliateAgreementV4(source);
  assert.deepEqual(normalizedParagraphs(actual), expectedParagraphs);
  assert.equal(actual.split(newAddress).length - 1, 2);
  for (const bullet of removedBullets) assert.equal(actual.includes(bullet), false);
  assert.equal(AFFILIATE_AGREEMENT_V4_VERSION, "4.0");
});

test("prepared agreement access is super-admin-only and never publishes the draft", async () => {
  const routes = await readFile(new URL("../routes/affiliate-agreements.ts", import.meta.url), "utf8");
  assert.match(routes, /router\.get\("\/v4-draft", requireSuperAdmin/);
  assert.match(routes, /router\.post\("\/publish", requireSuperAdmin/);
  assert.match(routes, /return res\.json\(\{\s*version: AFFILIATE_AGREEMENT_V4_VERSION,\s*body,\s*contentSha256:/);
  assert.match(routes, /if \(version === AFFILIATE_AGREEMENT_V4_VERSION\)/);
  assert.match(routes, /isCanonicalAffiliateAgreementPublication\(version, submittedBody, affiliateAgreementV4Source\)/);
});

test("Version 4.0 publication accepts only the exact prepared body", () => {
  const canonical = prepareAffiliateAgreementV4(source);
  assert.equal(isCanonicalAffiliateAgreementPublication(AFFILIATE_AGREEMENT_V4_VERSION, canonical, source), true);
  assert.equal(isCanonicalAffiliateAgreementPublication(
    AFFILIATE_AGREEMENT_V4_VERSION,
    canonical.replace("550 Biltmore Way, Suite 209", "550 Biltmore Way, Suite 200"),
    source,
  ), false);
  assert.equal(isCanonicalAffiliateAgreementPublication("reviewed-v1", "Existing custom agreement", source), true);
});

test("both acceptance paths snapshot the submitted business name into the acceptance record", async () => {
  const invitations = await readFile(new URL("../routes/affiliate-agreements.ts", import.meta.url), "utf8");
  const portal = await readFile(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../../lib/db/src/schema/affiliate-agreements.ts", import.meta.url), "utf8");

  assert.match(invitations, /legalBusinessName: row!\.companyName/);
  assert.match(portal, /legalBusinessName: affiliate\.companyName/);
  assert.match(schema, /legalBusinessName: text\("legal_business_name"\)/);
});