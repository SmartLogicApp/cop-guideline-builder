/**
 * Sending mail through Resend.
 *
 * WHY NOT LET CLERK SEND IT: Clerk's built-in delivery uses SendGrid's shared
 * IP pool. Measured on 2026-09-22, a verification code sent that way from
 * cmscomplianceguardian.com arrived at an @samlut.com address within seconds
 * and never arrived at @outlook.com at all -- not the inbox, not the junk
 * folder. SPF, DKIM and DMARC all pass, so this is not an authentication
 * failure; Microsoft weights domain age and sending-IP reputation heavily and
 * silently drops the combination of a young domain on a shared pool.
 *
 * Since a large share of healthcare administrators use outlook.com and
 * hotmail.com addresses, that made signup impossible for a meaningful part of
 * the market, invisibly -- those users see a code that never comes and leave.
 *
 * --------------------------------------------------------------------
 * WHY TWO TRANSPORTS
 *
 * This module can reach Resend two ways, and prefers the direct one.
 *
 *   1. RESEND_API_KEY  -> HTTPS straight to api.resend.com.
 *   2. Replit connector -> the same call brokered by Replit's proxy.
 *
 * The connector was the original path, and on 2026-09-22 it failed in both
 * environments at once while Replit's own panel still reported it "Active":
 *
 *   production  401  "No connection found for replid: ... with connector: resend"
 *   workspace   400  {"name":"validation_error","message":"API key is invalid"}
 *
 * Two different failures from one brokered credential nobody can inspect. A
 * login code is the first thing every customer needs and the one piece of the
 * product that cannot degrade gracefully, so it should not depend on a
 * credential this application cannot see, test, or rotate. An API key in
 * Secrets is visible, verifiable from a shell, and rotated in one place.
 *
 * The connector stays as a fallback so nothing breaks for a deployment that
 * has no RESEND_API_KEY set yet -- but when both exist, the key wins.
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult =
  | { sent: true; id?: string; transport: Transport }
  | { sent: false; status?: number; error: string; transport: Transport | "none" };

export type Transport = "api_key" | "connector";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * The address mail is sent from.
 *
 * Must be on a domain verified in Resend, or Resend refuses it. Deliberately
 * NOT defaulted to onboarding@resend.dev the way the trial mailer does: that
 * shared test domain is restricted to the account owner's own address, so a
 * verification code sent to a customer would fail. Better to refuse loudly at
 * configuration time than to silently fail to deliver login codes.
 */
export function getAuthEmailFrom(): string | null {
  const configured = process.env.CLERK_EMAIL_FROM?.trim() || process.env.TRIAL_EMAIL_FROM?.trim();
  if (!configured) return null;
  if (/onboarding@resend\.dev/i.test(configured)) return null;
  return configured;
}

/**
 * The Resend API key, if one is configured.
 *
 * Trimmed because a key pasted into a secrets field routinely arrives with a
 * trailing newline, and `Bearer re_xxx\n` is rejected as malformed -- a failure
 * that reads like a wrong key and wastes an hour.
 */
export function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? key : null;
}

/** Which transport a send would use right now. Exported for diagnostics. */
export function selectedTransport(): Transport {
  return getResendApiKey() ? "api_key" : "connector";
}

/**
 * Send one message via Resend.
 *
 * Returns a result rather than throwing: the caller is a webhook handler, and
 * what it does about a failure (retry, log, 500) is its decision, not this
 * function's.
 */
export async function sendViaResend(email: OutboundEmail): Promise<SendResult> {
  const from = getAuthEmailFrom();
  if (!from) {
    return {
      sent: false,
      transport: "none",
      error:
        "CLERK_EMAIL_FROM is not set to a verified sending address. " +
        "Set it to an address on a domain verified in Resend.",
    };
  }

  const payload = JSON.stringify({
    from,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    ...(email.text ? { text: email.text } : {}),
  });

  const apiKey = getResendApiKey();
  const transport: Transport = apiKey ? "api_key" : "connector";

  try {
    const response = apiKey
      ? await fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: payload,
        })
      : await (async () => {
          const { ReplitConnectors } = await import("@replit/connectors-sdk");
          const connectors = new ReplitConnectors();
          return connectors.proxy("resend", "/emails", { method: "POST", body: payload });
        })();

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        sent: false,
        transport,
        status: response.status,
        // The transport is named in the error because the two paths fail in
        // completely different ways, and the first question when a send fails
        // is always which one was in use.
        error: `[${transport}] ${detail || `Resend returned ${response.status}`}`,
      };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, transport, id: body?.id };
  } catch (error: any) {
    return {
      sent: false,
      transport,
      error: `[${transport}] ${error?.message ?? "Resend request failed"}`,
    };
  }
}
