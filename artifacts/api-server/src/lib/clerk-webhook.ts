import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLERK WEBHOOK SIGNATURE VERIFICATION (Svix)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS: Clerk can be told to stop sending its own emails and instead
 * fire an `email.created` webhook carrying the subject, body and recipient, so
 * the application sends the message itself. That is how verification codes get
 * routed through Resend instead of SendGrid's shared pool.
 *
 * It also creates an endpoint that makes this application send email on request.
 * UNVERIFIED, THAT IS AN OPEN RELAY: anyone who finds the URL could post a
 * payload and have mail delivered from cmscomplianceguardian.com, signed with
 * the domain's own DKIM key. The reputation damage would undo exactly the
 * deliverability problem this feature is meant to fix, and it would be the
 * domain's own signature vouching for the spam.
 *
 * So every request is verified before anything is read out of the body.
 *
 * Clerk signs webhooks with Svix. The scheme:
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64( HMAC-SHA256( base64decode(secret), signed content ) )
 * The `svix-signature` header carries a space-separated list of
 * `v1,<signature>` entries — plural because Svix supports key rotation, so a
 * verifier must accept a match against ANY of them.
 *
 * Implemented here rather than pulling in the `svix` package because this
 * workspace pins dependencies deliberately and the whole algorithm is four
 * lines of node:crypto. No new supply chain for an HMAC.
 */

/** Svix rejects timestamps outside five minutes to bound replay attacks. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

export type VerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify a Svix-signed webhook.
 *
 * `payload` MUST be the raw bytes as received. Verifying a re-serialized object
 * silently fails forever: JSON.stringify does not reproduce byte-for-byte what
 * the sender signed (key order, unicode escaping, whitespace), so the HMAC
 * never matches. That is why the route mounts express.raw() ahead of the JSON
 * body parser, the same way the Stripe webhook does.
 */
export function verifyClerkWebhook(
  payload: Buffer | string,
  headers: SvixHeaders,
  secret: string,
  now: Date = new Date(),
): VerificationResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "Missing svix-id, svix-timestamp or svix-signature header." };
  }
  if (!secret) {
    return { ok: false, reason: "CLERK_WEBHOOK_SIGNING_SECRET is not configured." };
  }

  // Replay window. Without this, a signature captured once stays valid forever
  // and a recorded request can be replayed to send the same mail repeatedly.
  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "svix-timestamp is not a unix timestamp." };
  }
  const driftSeconds = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (driftSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: `Timestamp outside tolerance (${driftSeconds}s).` };
  }

  // Secrets arrive as `whsec_<base64>`; the bytes after the prefix are the key.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${
    typeof payload === "string" ? payload : payload.toString("utf8")
  }`;
  const expected = createHmac("sha256", key).update(signedContent).digest();

  // The header may carry several versioned signatures during key rotation.
  // Accept a match against any v1 entry; ignore versions we do not implement
  // rather than treating them as failures.
  const presented = signature.split(" ");
  for (const entry of presented) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    // Length-check before timingSafeEqual, which throws on a length mismatch.
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "No presented signature matched." };
}

// ─── The email payload Clerk sends ───────────────────────────────────────────

/**
 * The fields of a Clerk `email.created` event this application uses.
 *
 * Typed loosely on purpose: Clerk adds fields over time, and a strict shape
 * would reject a payload that merely gained a property. What matters is that
 * the four values actually used are present and are strings.
 */
export type ClerkEmailEvent = {
  type?: string;
  data?: {
    to_email_address?: string;
    from_email_name?: string;
    subject?: string;
    body?: string;
    body_plain?: string;
    email_address_id?: string;
    id?: string;
    slug?: string;
  };
};

export type ExtractedEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Clerk's own id for this message — used to make sending idempotent. */
  clerkEmailId?: string;
  /** e.g. "verification_code", "invitation". Useful in logs. */
  slug?: string;
};

/**
 * Pull the sendable message out of an `email.created` event, or explain why
 * there isn't one.
 *
 * Returns null rather than throwing for events that are simply not emails —
 * Clerk delivers many event types to the same endpoint, and a handler that
 * threw on every `user.created` would fill the logs with failures for events
 * that were handled correctly by ignoring them.
 */
export function extractEmail(event: ClerkEmailEvent): ExtractedEmail | null {
  if (event?.type !== "email.created") return null;
  const data = event.data ?? {};

  const to = typeof data.to_email_address === "string" ? data.to_email_address.trim() : "";
  const subject = typeof data.subject === "string" ? data.subject.trim() : "";
  const html = typeof data.body === "string" ? data.body : "";

  // A message missing any of these cannot be sent. Better to reject it loudly
  // here than to deliver a blank email carrying a login code.
  if (!to || !subject || !html) return null;

  return {
    to,
    subject,
    html,
    text: typeof data.body_plain === "string" ? data.body_plain : undefined,
    clerkEmailId: typeof data.id === "string" ? data.id : undefined,
    slug: typeof data.slug === "string" ? data.slug : undefined,
  };
}
