import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  WEBHOOK_TOLERANCE_SECONDS,
  extractEmail,
  verifyClerkWebhook,
} from "./clerk-webhook.ts";

/**
 * These tests exist because a signature verifier that is WRONG usually still
 * looks right: it returns true for the happy path, and nobody notices it also
 * returns true for a forged request until mail is going out from this domain
 * on someone else's behalf.
 *
 * So most of what follows is negative cases.
 */

const SECRET = "whsec_" + Buffer.from("a-test-signing-key-32-bytes-long").toString("base64");

function sign(payload: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
}

function headersFor(payload: string, now: Date, overrides: Record<string, string> = {}) {
  const id = "msg_2abc";
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    id: overrides.id ?? id,
    timestamp: overrides.timestamp ?? timestamp,
    signature: overrides.signature ?? `v1,${sign(payload, id, timestamp)}`,
  };
}

const NOW = new Date("2026-09-22T20:00:00.000Z");
const PAYLOAD = JSON.stringify({ type: "email.created", data: { subject: "hi" } });

// ─── The happy path ──────────────────────────────────────────────────────────

test("a correctly signed webhook verifies", () => {
  const result = verifyClerkWebhook(PAYLOAD, headersFor(PAYLOAD, NOW), SECRET, NOW);
  assert.equal(result.ok, true);
});

test("a Buffer payload verifies identically to the string", () => {
  // The route hands this a Buffer from express.raw(). If Buffer handling were
  // broken, every real request would fail while the tests passed.
  const headers = headersFor(PAYLOAD, NOW);
  assert.equal(verifyClerkWebhook(Buffer.from(PAYLOAD, "utf8"), headers, SECRET, NOW).ok, true);
});

// ─── Forgery ─────────────────────────────────────────────────────────────────

test("a tampered body is rejected", () => {
  // The whole point: someone intercepts a real webhook, changes the recipient
  // to their own address to harvest a login code, and replays it.
  const headers = headersFor(PAYLOAD, NOW);
  const tampered = JSON.stringify({ type: "email.created", data: { subject: "hi!" } });
  const result = verifyClerkWebhook(tampered, headers, SECRET, NOW);
  assert.equal(result.ok, false);
});

test("a signature made with the wrong secret is rejected", () => {
  const otherSecret = "whsec_" + Buffer.from("a-different-key-of-32-bytes!!!!!").toString("base64");
  const id = "msg_2abc";
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const result = verifyClerkWebhook(
    PAYLOAD,
    { id, timestamp, signature: `v1,${sign(PAYLOAD, id, timestamp, otherSecret)}` },
    SECRET,
    NOW,
  );
  assert.equal(result.ok, false);
});

test("an unsigned request is rejected", () => {
  for (const missing of ["id", "timestamp", "signature"] as const) {
    const headers: Record<string, string | undefined> = { ...headersFor(PAYLOAD, NOW) };
    headers[missing] = undefined;
    const result = verifyClerkWebhook(PAYLOAD, headers as any, SECRET, NOW);
    assert.equal(result.ok, false, `missing ${missing} must be rejected`);
  }
});

test("an empty or missing signing secret never verifies", () => {
  // Otherwise an unconfigured deployment would accept everything — the failure
  // mode where the endpoint is live and wide open before anyone notices.
  const result = verifyClerkWebhook(PAYLOAD, headersFor(PAYLOAD, NOW), "", NOW);
  assert.equal(result.ok, false);
});

test("the id and timestamp are part of what is signed", () => {
  // If the verifier hashed only the body, an attacker could reuse one captured
  // signature under any id/timestamp they liked.
  const headers = headersFor(PAYLOAD, NOW);
  const swappedId = { ...headers, id: "msg_different" };
  assert.equal(verifyClerkWebhook(PAYLOAD, swappedId, SECRET, NOW).ok, false);
});

// ─── Replay ──────────────────────────────────────────────────────────────────

test("an old but correctly signed request is rejected", () => {
  // A captured request stays cryptographically valid forever. Without a time
  // window it can be replayed to resend the same mail indefinitely.
  const past = new Date(NOW.getTime() - (WEBHOOK_TOLERANCE_SECONDS + 60) * 1000);
  const headers = headersFor(PAYLOAD, past);
  const result = verifyClerkWebhook(PAYLOAD, headers, SECRET, NOW);
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /tolerance/i);
});

test("a request from slightly in the future is accepted", () => {
  // Clock skew between servers is normal; only a large drift is suspicious.
  const future = new Date(NOW.getTime() + 60 * 1000);
  assert.equal(verifyClerkWebhook(PAYLOAD, headersFor(PAYLOAD, future), SECRET, NOW).ok, true);
});

test("a non-numeric timestamp is rejected rather than treated as zero", () => {
  const headers = headersFor(PAYLOAD, NOW, { timestamp: "not-a-number" });
  assert.equal(verifyClerkWebhook(PAYLOAD, headers, SECRET, NOW).ok, false);
});

// ─── Key rotation ────────────────────────────────────────────────────────────

test("verification succeeds when the valid signature is among several", () => {
  // Svix sends multiple signatures during key rotation. A verifier that only
  // checked the first would start rejecting real webhooks the moment Clerk
  // rotated a key — an outage that looks like a Clerk problem.
  const id = "msg_2abc";
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const valid = sign(PAYLOAD, id, timestamp);
  const headers = { id, timestamp, signature: `v1,AAAAinvalidAAAA v1,${valid}` };
  assert.equal(verifyClerkWebhook(PAYLOAD, headers, SECRET, NOW).ok, true);
});

test("an unknown signature version alone does not verify", () => {
  const id = "msg_2abc";
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const headers = { id, timestamp, signature: `v2,${sign(PAYLOAD, id, timestamp)}` };
  assert.equal(verifyClerkWebhook(PAYLOAD, headers, SECRET, NOW).ok, false);
});

test("malformed signature entries do not crash the verifier", () => {
  const id = "msg_2abc";
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  for (const signature of ["", "garbage", "v1", "v1,", ",,,", "v1,!!!not-base64!!!"]) {
    const result = verifyClerkWebhook(PAYLOAD, { id, timestamp, signature }, SECRET, NOW);
    assert.equal(result.ok, false, `"${signature}" must be rejected, not throw`);
  }
});

// ─── Extracting the message ──────────────────────────────────────────────────

test("a verification-code email is extracted", () => {
  const extracted = extractEmail({
    type: "email.created",
    data: {
      to_email_address: "hector@example.com",
      subject: "123456 is your verification code",
      body: "<p>123456</p>",
      body_plain: "123456",
      id: "eml_123",
      slug: "verification_code",
    },
  });
  assert.equal(extracted?.to, "hector@example.com");
  assert.equal(extracted?.subject, "123456 is your verification code");
  assert.equal(extracted?.html, "<p>123456</p>");
  assert.equal(extracted?.text, "123456");
  assert.equal(extracted?.clerkEmailId, "eml_123");
});

test("events that are not emails are ignored, not errors", () => {
  // Clerk delivers every subscribed event type to the same endpoint. Throwing
  // on user.created would fill the logs with failures for events handled
  // correctly by doing nothing.
  assert.equal(extractEmail({ type: "user.created", data: {} }), null);
  assert.equal(extractEmail({} as any), null);
});

test("an email missing a recipient, subject or body is refused", () => {
  // Better a loud refusal than delivering a blank message that was carrying
  // someone's login code.
  const base = {
    to_email_address: "a@b.com",
    subject: "s",
    body: "<p>b</p>",
  };
  for (const field of ["to_email_address", "subject", "body"] as const) {
    const data: Record<string, unknown> = { ...base };
    delete data[field];
    assert.equal(
      extractEmail({ type: "email.created", data }),
      null,
      `missing ${field} must not produce a sendable email`,
    );
  }
  assert.equal(
    extractEmail({ type: "email.created", data: { ...base, to_email_address: "   " } }),
    null,
    "a whitespace-only recipient is not a recipient",
  );
});

// ─── The route wiring ────────────────────────────────────────────────────────
// Source-contract checks. The verifier being correct is worthless if the route
// forgets to call it, or parses the body before verifying it.

import { readFileSync } from "node:fs";
const appSource = readFileSync(new URL("../app.ts", import.meta.url), "utf8");

test("the Clerk webhook verifies the signature before doing anything else", () => {
  const route = appSource.slice(
    appSource.indexOf('app.post(\n  "/api/clerk/webhook"'),
    appSource.indexOf("// ── Body parsers"),
  );
  assert.ok(route.length > 0, "the Clerk webhook route must exist");

  const verifyAt = route.indexOf("verifyClerkWebhook(");
  const sendAt = route.indexOf("sendViaResend(");
  const parseAt = route.indexOf("JSON.parse(");
  assert.ok(verifyAt > 0, "must call verifyClerkWebhook");
  assert.ok(verifyAt < parseAt, "signature must be checked before the body is parsed");
  assert.ok(verifyAt < sendAt, "signature must be checked before any mail is sent");
  assert.match(route, /return res\.status\(401\)/, "a bad signature must be rejected");
});

test("the webhook reads raw bytes, not parsed JSON", () => {
  // Svix signs the exact bytes. Verifying a re-serialized object never matches,
  // so this would fail closed on every real request — and the only way to
  // "fix" that under pressure is to weaken the check.
  const route = appSource.slice(
    appSource.indexOf('app.post(\n  "/api/clerk/webhook"'),
    appSource.indexOf("// ── Body parsers"),
  );
  assert.match(route, /express\.raw\(\{ type: "application\/json" \}\)/);

  // And it must be mounted ahead of the JSON body parser, or express.json()
  // consumes the stream first.
  assert.ok(
    appSource.indexOf('"/api/clerk/webhook"') < appSource.indexOf("app.use(express.json("),
    "the webhook must be registered before express.json()",
  );
});

test("the webhook does not log the recipient address", () => {
  // These messages carry login codes. An address plus a timestamp in a log
  // aggregator is the pairing that should not be sitting there.
  const route = appSource.slice(
    appSource.indexOf('app.post(\n  "/api/clerk/webhook"'),
    appSource.indexOf("// ── Body parsers"),
  );
  const logLines = route.split("\n").filter((line) => /logger\.(info|warn|error)/.test(line));
  for (const line of logLines) {
    assert.doesNotMatch(line, /email\.to|to_email_address/, `log must not include recipient: ${line.trim()}`);
  }
});

test("a failed send asks Clerk to retry", () => {
  const route = appSource.slice(
    appSource.indexOf('app.post(\n  "/api/clerk/webhook"'),
    appSource.indexOf("// ── Body parsers"),
  );
  // Ordering, not proximity. Asserting the 500 sat within N characters of the
  // guard broke when one field was added to the log line, while the defence
  // itself was untouched -- a test that fails for the wrong reason teaches you
  // to ignore it.
  const guardAt = route.indexOf("if (!result.sent)");
  const retryAt = route.indexOf("res.status(500)");
  const successAt = route.indexOf("sent: true");
  assert.ok(guardAt > 0, "the send-failure guard must exist");
  assert.ok(retryAt > guardAt, "a failed send must answer 500 so Clerk retries");
  assert.ok(retryAt < successAt, "the 500 must sit inside the failure branch");
});

test("the send failure log names which transport was used", () => {
  // Resend is reachable two ways and they fail differently -- the connector
  // returned 401 in production and 400 in the workspace on the same day. A
  // failure log that omits the transport costs an hour of guessing.
  const guardAt = appSource.indexOf("if (!result.sent)");
  const retryAt = appSource.indexOf("res.status(500)");
  assert.ok(guardAt > 0 && retryAt > guardAt, "the send-failure branch must exist");
  assert.match(appSource.slice(guardAt, retryAt), /transport: result\.transport/);
});
