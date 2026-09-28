import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { invitationDeliveryOutcome } = await import("./affiliate-invitation-delivery.ts");

const at = new Date("2026-09-28T12:00:00Z");

test("provider failure revokes the private link, records safe diagnostics and explains why to admin", () => {
  const privateDetail = "hector@example.com #token=private re_secret";
  const outcome = invitationDeliveryOutcome({
    sent: false, transport: "api_key", status: 403, error: privateDetail,
  }, at);
  assert.equal(outcome.sent, false);
  assert.deepEqual(outcome.update, {
    revokedAt: at,
    deliveryStatus: "failed",
    deliveryFailureCategory: "sender_permission",
    deliveryTransport: "api_key",
    deliveryHttpStatus: 403,
  });
  if (!outcome.sent) {
    assert.equal(outcome.response.category, "sender_permission");
    assert.match(outcome.response.error, /sender or account/);
  }
  assert.doesNotMatch(JSON.stringify(outcome), /hector|token|re_secret/);
});

test("successful provider acceptance stores a safe receipt but makes no inbox-delivery claim", () => {
  const id = "49a3999c-0ce1-4ea6-a6d7-e02d5bc0181c";
  const outcome = invitationDeliveryOutcome({ sent: true, transport: "connector", id }, at);
  assert.equal(outcome.sent, true);
  assert.deepEqual(outcome.update, {
    sentAt: at,
    deliveryStatus: "accepted",
    providerMessageId: id,
    deliveryTransport: "connector",
  });
  assert.equal(invitationDeliveryOutcome({ sent: true, transport: "api_key", id: "private@example.com" }, at)
    .update.providerMessageId, null);
});

test("route writes both outcomes and returns safe failure details without reading the raw error", () => {
  const route = readFileSync(new URL("../routes/affiliate-agreements.ts", import.meta.url), "utf8");
  const branch = route.slice(route.indexOf("const outcome = invitationDeliveryOutcome("), route.indexOf("const invitationFields"));
  assert.match(branch, /db\.update\(affiliateAgreementInvitations\)\.set\(outcome\.update\)/);
  assert.match(branch, /if \(!outcome\.sent\)/);
  assert.match(branch, /res\.status\(502\)\.json\(outcome\.response\)/);
  assert.match(branch, /deliveryStatus: "accepted"/);
  assert.doesNotMatch(branch, /result\.error|recipientEmail|tokenSha256/);
});

test("delivery audit columns have an additive migration and leave old outcomes unknown", () => {
  const schema = readFileSync(new URL("../../../../lib/db/src/schema/affiliate-agreements.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../../lib/db/migrations/0009_affiliate_agreement_invitation_delivery.sql", import.meta.url), "utf8");
  for (const column of ["delivery_status", "delivery_failure_category", "provider_message_id", "delivery_transport", "delivery_http_status"]) {
    assert.match(schema, new RegExp(`"${column}"`));
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} `));
  }
  assert.doesNotMatch(migration, /UPDATE affiliate_agreement_invitations|DEFAULT 'accepted'/);
});