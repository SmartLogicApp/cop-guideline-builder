/**
 * The warning goes out 15 days before access is deactivated.
 *
 * The window is two days wide so a scheduler that misses a run still catches
 * the account on its next pass; accounts.trial_warning_email_sent_at is
 * claimed before sending, so a wider window never means a second email.
 */
export const TRIAL_WARNING_DAYS = 15;

export const TRIAL_WARNING_SUBJECT =
  `Your CMS CoP Compliance Suite trial ends in ${TRIAL_WARNING_DAYS} days`;
export const TRIAL_WARNING_SUPPORT_EMAIL = "CMSComplianceGuardianHelp@Outlook.com";

export function trialWarningWindow(now: Date): { start: Date; end: Date } {
  const dayMs = 24 * 60 * 60 * 1_000;
  return {
    start: new Date(now.getTime() + (TRIAL_WARNING_DAYS - 1) * dayMs),
    end: new Date(now.getTime() + (TRIAL_WARNING_DAYS + 1) * dayMs),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function trialWarningEmailHtml(input: {
  facilityName: string;
  trialEndsAt: Date;
  billingUrl: string;
}): string {
  const facilityName = escapeHtml(input.facilityName);
  const billingUrl = escapeHtml(input.billingUrl);
  const trialEndDate = input.trialEndsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1A2B4A;">
      <div style="background: #0B3D8E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 20px;">Your trial ends in ${TRIAL_WARNING_DAYS} days</h1>
      </div>
      <div style="background: #fff; padding: 28px 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 15px; line-height: 1.6;">Hello,</p>
        <p style="font-size: 15px; line-height: 1.6;">
          This is a friendly reminder that the CMS CoP Compliance Suite trial for
          <strong>${facilityName}</strong> ends on ${trialEndDate}.
        </p>
        <p style="font-size: 15px; line-height: 1.6;">
          Add a payment method now to keep uninterrupted access to your compliance tools.
        </p>
        <a href="${billingUrl}" style="display: inline-block; padding: 11px 20px; background: #0B3D8E; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 700;">Manage billing</a>
        <p style="font-size: 13px; color: #64748B; margin: 24px 0 0; line-height: 1.6;">
          Questions? Contact us at
          <a href="mailto:${TRIAL_WARNING_SUPPORT_EMAIL}" style="color: #0B3D8E;">${TRIAL_WARNING_SUPPORT_EMAIL}</a>.
        </p>
      </div>
    </div>
  `;
}