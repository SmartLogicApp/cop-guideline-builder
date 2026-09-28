import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  containsSensitiveFinancialData,
  containsSensitiveFinancialNumber,
  redactSensitiveFinancialData,
} from "./sensitive-financial-text.ts";

// Synthetic values only. Never use real account or tax identifiers in fixtures.
const examples = ["000-00-0000", "00-0000000", "000000000", "000 00 0000", "000.00.0000", "0000 0000", "0000-0000", "0000 0000 0000", "0000-0000-0000-0000"];

test("rejects likely tax identifiers in notes and nested history/audit JSON", () => {
  for (const example of examples) {
    assert.equal(containsSensitiveFinancialNumber(`note: ${example}`), true);
    assert.equal(containsSensitiveFinancialData({ result: { met: [{ detail: example }] } }), true);
    assert.equal(containsSensitiveFinancialData({ metadata: { [example]: "value" } }), true);
    const output = redactSensitiveFinancialData({ reason: `note: ${example}`, metadata: { nested: [example] } });
    assert.equal(JSON.stringify(output).includes(example), false);
    assert.match(output.reason, /\[redacted financial number\]/);
  }
  assert.equal(containsSensitiveFinancialData({ result: { score: 80, year: 2026, note: "Review in Q3" } }), false);
  assert.equal(redactSensitiveFinancialData("2026-09-24T12:30:00.000Z"), "2026-09-24T12:30:00.000Z");
  assert.equal(redactSensitiveFinancialData("2026-09-24 12:30"), "2026-09-24 12:30");
  assert.equal(redactSensitiveFinancialData("event 12345678-1234-5678-1234-123456789abc"), "event 12345678-1234-5678-1234-123456789abc");
  assert.equal(containsSensitiveFinancialData({ result: { detail: 100000000 } }), true);
  assert.equal(redactSensitiveFinancialData({ detail: 100000000 }).detail, "[redacted financial number]");
});

test("write boundaries reject, and display boundaries redact, unsafe free text", () => {
  const routes = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const history = readFileSync(new URL("../routes/gapHistory.ts", import.meta.url), "utf8");
  const compliance = readFileSync(new URL("../routes/affiliate-compliance.ts", import.meta.url), "utf8");
  const audit = readFileSync(new URL("./affiliate-compliance.ts", import.meta.url), "utf8");
  const section = (source: string, start: string, end: string) =>
    source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start) + start.length));

  assert.match(section(routes, 'router.post("/apply"', "async function provisionalReferralCode"), /about\]\.some\(containsSensitiveFinancialNumber\)/);
  const adminCreate = section(routes, 'router.post("/", requireSuperAdmin', 'router.patch("/:id"');
  assert.match(adminCreate, /containsSensitiveFinancialNumber\(value\)/);
  assert.match(adminCreate, /req\.body\?\.agreementVersion/);
  assert.match(adminCreate, /req\.body\?\.enrollmentVersion/);
  assert.match(adminCreate, /hasSensitiveContact\(\{ email,/);
  assert.match(section(routes, 'router.post("/:id/rate"', 'router.post("/:id/commissions"'), /containsSensitiveFinancialNumber\(req\.body\.note\)/);
  assert.match(section(routes, 'router.post("/commissions/:commissionId/reverse"', 'router.post("/cron/maturity-sweep"'), /containsSensitiveFinancialNumber\(reason\)/);
  assert.match(section(routes, 'router.patch("/:id"', 'router.post("/:id/approve"'), /"adminNotes"\]\.some/);
  assert.match(section(compliance, 'router.post("/admin/documents"', 'router.patch("/admin/documents/:id"'), /containsSensitiveFinancialNumber\(content\)/);
  assert.match(section(compliance, 'router.post("/admin/:id/action"', 'router.post("/admin/:id/recheck"'), /containsSensitiveFinancialNumber\(reason\)/);
  assert.match(section(history, "function parseEntry", "router.use("), /containsSensitiveFinancialData\(/);
  assert.match(section(history, "function serializeEntry", "function parseEntry"), /redactSensitiveFinancialData\(/);
  assert.match(audit, /reason: redactSensitiveFinancialData\(reason/);
  assert.match(audit, /metadata: redactSensitiveFinancialData\(metadata/);
  assert.match(section(routes, 'router.get("/:id"', 'router.post("/", requireSuperAdmin'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(compliance, 'router.get("/admin/:id"', 'router.post("/admin/:id/action"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(compliance, 'router.get("/portal"', 'router.post("/portal/agreement-accept"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(compliance, 'router.get("/admin/payouts/quarterly-preview"', 'router.post("/admin/payouts/quarterly-run"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(compliance, 'router.post("/admin/payouts/quarterly-run"', 'router.post("/admin/payouts/draft"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(routes, 'router.get("/payouts/preview"', 'router.post("/payouts"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(compliance, 'router.get("/admin/payouts"', 'router.get("/admin/email-templates"'), /res\.json\(redactSensitiveFinancialData/);
  assert.match(section(routes, 'router.get("/reports/download"', 'export default router'), /sendCsv\(res,.*redactSensitiveFinancialData\(csv\)/);
});