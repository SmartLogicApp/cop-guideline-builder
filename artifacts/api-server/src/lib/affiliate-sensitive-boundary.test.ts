import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  approvalRateChangeNote,
  containsSensitiveFinancialData,
  containsSensitiveFinancialNumber,
  hasSensitiveContact,
  isSafeAffiliateIdentifier,
  isSafeDocumentVersion,
  isSafeEmailTemplateKey,
  redactSensitiveFinancialData,
} from "./affiliate-sensitive-boundary.ts";

// Synthetic identifiers only. These tests execute the same boundary functions
// that the API routes use; source assertions below additionally pin their wiring.
test("suffixed numbers in notes and nested history are rejected and redacted", () => {
  for (const number of ["0000-0000-ref", "123456789-ref"]) {
    assert.equal(containsSensitiveFinancialNumber(`Reason: ${number}`), true);
    assert.equal(containsSensitiveFinancialData({
      id: "scan-1",
      result: { met: [{ detail: `Reason: ${number}` }], metadata: { [`key-${number}`]: number } },
    }), true);
    const redacted = redactSensitiveFinancialData({
      note: `Reason: ${number}`,
      result: { met: [{ detail: number }], metadata: { [`key-${number}`]: `Reason: ${number}` } },
    });
    assert.equal(JSON.stringify(redacted).includes(number), false);
    assert.match(redacted.note, /\[redacted financial number\]-ref/);
  }
  assert.equal(containsSensitiveFinancialNumber("reference 2026-09-24-ref"), false);
  assert.equal(containsSensitiveFinancialNumber("event 12345678-1234-5678-1234-123456789abc"), false);
});

test("admin creation and approval reject numeric referral codes without copying codes into rate notes", () => {
  for (const code of ["000000000", "123456789-ref"]) {
    assert.equal(isSafeAffiliateIdentifier(code), false, `unsafe admin create code ${code}`);
    assert.equal(isSafeAffiliateIdentifier(code), false, `unsafe admin approval code ${code}`);
    assert.equal(containsSensitiveFinancialNumber(approvalRateChangeNote()), false);
    assert.equal(approvalRateChangeNote().includes(code), false);
  }
  assert.equal(isSafeAffiliateIdentifier("NORTH-STAR-2026"), true);
});

test("document versions and email-template keys cannot be stored or copied into acknowledgements", () => {
  assert.equal(isSafeDocumentVersion("000000000"), false);
  assert.equal(isSafeDocumentVersion("123456789-ref"), false);
  assert.equal(isSafeEmailTemplateKey("a_000000000"), false);
  assert.equal(isSafeEmailTemplateKey("000000000"), false);
  assert.equal(isSafeDocumentVersion("privacy-v3"), true);
  assert.equal(isSafeEmailTemplateKey("complete_payout_setup"), true);

  const legacy = redactSensitiveFinancialData({
    documentVersion: "000000000",
    authorizationVersion: "000000000",
    templateKey: "a_000000000",
  });
  assert.equal(JSON.stringify(legacy).includes("000000000"), false);
});

test("public application and admin contact inputs reject financial numbers in phone and email", () => {
  const badPhone = { email: "applicant@example.org", phone: "000000000" };
  const badEmail = { email: "user-123456789-ref@example.org", phone: "(555) 010-1234" };
  for (const contact of [badPhone, badEmail]) {
    assert.equal(hasSensitiveContact(contact), true, "public application must reject");
    assert.equal(hasSensitiveContact(contact), true, "admin create and PATCH must reject");
  }
  assert.equal(hasSensitiveContact({ email: "applicant@example.org", phone: "(555) 010-1234" }), false);
  assert.equal(redactSensitiveFinancialData(badEmail).email.includes("123456789"), false);
});

test("route handlers actually call the executable boundary functions", () => {
  const affiliates = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const compliance = readFileSync(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  const history = readFileSync(new URL("../routes/gapHistory.ts", import.meta.url), "utf8");
  assert.match(affiliates, /hasSensitiveContact\(\{ email, phone \}\)/);
  assert.match(affiliates, /hasSensitiveContact\(body\)/);
  assert.match(affiliates, /!isSafeAffiliateIdentifier\(code\)/);
  assert.match(affiliates, /!isSafeAffiliateIdentifier\(requestedCode\)/);
  assert.match(affiliates, /note: approvalRateChangeNote\(\)/);
  assert.match(compliance, /!isSafeDocumentVersion\(version\)/);
  assert.match(compliance, /!isSafeDocumentVersion\(document\.version\)/);
  assert.match(compliance, /!isSafeDocumentVersion\(authorizationDoc\.version\)/);
  assert.match(compliance, /!isSafeEmailTemplateKey\(templateKey\)/);
  assert.match(compliance, /!isSafeEmailTemplateKey\(existing\.templateKey\)/);
  assert.match(history, /containsSensitiveFinancialData\(\{/);
  assert.match(history, /redactSensitiveFinancialData\(\{/);
});