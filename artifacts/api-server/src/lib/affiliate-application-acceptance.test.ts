import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationAcceptanceEvidence } from "./affiliate-application-acceptance.ts";

test("application acceptance records the signer, current document, instant and request evidence without an invitation", () => {
  const acceptedAt = new Date("2026-09-27T12:00:00.000Z");
  const evidence = applicationAcceptanceEvidence({
    affiliateId: "affiliate-id", identityEpoch: 0, version: "4.0",
    contentSha256: "a".repeat(64), companyName: "Example LLC",
    contactName: "Example Contact", email: "applicant@example.com",
    acceptedAt, ipAddress: "203.0.113.2", userAgent: "x".repeat(600),
  });
  assert.deepEqual(evidence, {
    affiliateId: "affiliate-id", invitationId: null,
    agreementVersion: "4.0", contentSha256: "a".repeat(64),
    signerName: "Example Contact", legalBusinessName: "Example LLC",
    signerEmail: "applicant@example.com", identityEpoch: 0,
    acceptedAt, ipAddress: "203.0.113.2", userAgent: "x".repeat(500),
  });
});

test("application and acceptance are one transaction, while old invitations still accept without changes", () => {
  const routes = readFileSync(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const agreements = readFileSync(new URL("../routes/affiliate-agreements.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../../../../lib/db/src/schema/affiliate-agreements.ts", import.meta.url), "utf8");
  const application = routes.slice(routes.indexOf('router.post("/apply"'), routes.indexOf('router.get("/",'));
  assert.match(application, /body\.agreed !== true/);
  assert.match(application, /agreementVersion !== currentVersion/);
  assert.match(application, /agreement\.contentSha256 !== agreementSha256/);
  assert.match(application, /db\.transaction\(async \(tx\) => \{[\s\S]*tx\.insert\(affiliates\)[\s\S]*tx\.insert\(affiliateAgreementAcceptances\)/);
  assert.match(schema, /invitationId: uuid\("invitation_id"\)\.references/);
  assert.match(agreements, /router\.post\("\/:affiliateId\/invite", requireSuperAdmin/);
  assert.match(agreements, /router\.post\("\/accept", publicLimit/);
});