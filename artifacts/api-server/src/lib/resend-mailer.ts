/**
 * Sending mail through Resend.
 *
 * WHY NOT LET CLERK SEND IT: Clerk's built-in delivery uses SendGrid's shared
 * IP pool. Measured on 2026-09-22, a verification code sent that way from
 * cmscomplianceguardian.com arrived at an @samlut.com address within seconds
 * and never arrived at @outlook.com at all — not the inbox, not the junk
 * folder. SPF, DKIM and DMARC all pass, so this is not an authentication
 * failure; Microsoft weights domain age and sending-IP reputation heavily and
 * silently drops the combination of a young domain on a shared pool.
 *
 * Since a large share of healthcare administrators use outlook.com and
 * hotmail.com addresses, that made signup impossible for a meaningful part of
 * the market, invisibly — those users see a code that never comes and leave.
 *
 * Resend is already configured in this application for trial notices, and is
 * reached through the same Replit connector proxy, so this adds no new
 * credential and no new dependency.
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult =
  | { sent: true; id?: string }
  | { sent: false; status?: number; error: string };

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
      error:
        "CLERK_EMAIL_FROM is not set to a verified sending address. " +
        "Set it to an address on a domain verified in Resend.",
    };
  }

  try {
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        ...(email.text ? { text: email.text } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { sent: false, status: response.status, error: detail || `Resend returned ${response.status}` };
    }

    const body = await response.json().catch(() => ({})) as { id?: string };
    return { sent: true, id: body?.id };
  } catch (error: any) {
    return { sent: false, error: error?.message ?? "Resend request failed" };
  }
}
