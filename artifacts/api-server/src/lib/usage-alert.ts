/**
 * Internal cost monitoring — never customer-facing.
 *
 * Under current pricing, AI token cost is included in the $299 subscription
 * fee, so nothing here caps, throttles or bills a customer. Its only job is to
 * tell the operator when an account's month-to-date cost is approaching a share
 * of the revenue that account produces, so the decision to introduce metered
 * pricing can be made from real numbers instead of a guess.
 *
 * One digest email covering every account over the threshold, so the schedule
 * can run as often as you like without needing per-account sent-state.
 */

export const PLAN_PRICE_USD = 299;

/**
 * Fraction of the plan price at which an account is worth looking at.
 * 0.25 means "this account has consumed a quarter of its revenue in AI cost".
 * Override with USAGE_ALERT_THRESHOLD_FRACTION.
 */
export const DEFAULT_ALERT_FRACTION = 0.25;

export function getAlertFraction(
  configuredValue = process.env.USAGE_ALERT_THRESHOLD_FRACTION,
): number {
  const parsed = Number.parseFloat(configuredValue?.trim() ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) {
    return DEFAULT_ALERT_FRACTION;
  }
  return parsed;
}

export function getAlertThresholdUsd(): number {
  return PLAN_PRICE_USD * getAlertFraction();
}

/** Where the digest goes. Operator-facing, so it defaults to the main mailbox. */
export function getUsageAlertRecipient(): string {
  return process.env.USAGE_ALERT_EMAIL?.trim()
    || "CMSComplianceGuardian@Outlook.com";
}

export type UsageAlertRow = {
  facilityName: string;
  ccn: string | null;
  rawCostUsd: number;
  requestCount: number;
};

export const USAGE_ALERT_SUBJECT = "CMS Compliance Suite — AI cost review";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function usageAlertEmailHtml(input: {
  rows: UsageAlertRow[];
  thresholdUsd: number;
  monthLabel: string;
  totalAccounts: number;
}): string {
  const { rows, thresholdUsd, monthLabel, totalAccounts } = input;

  const tableRows = rows
    .map((row) => {
      const share = PLAN_PRICE_USD > 0
        ? Math.round((row.rawCostUsd / PLAN_PRICE_USD) * 100)
        : 0;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;">${escapeHtml(row.facilityName)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${escapeHtml(row.ccn ?? "—")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">${money(row.rawCostUsd)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">${share}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">${row.requestCount}</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:680px;margin:0 auto;color:#1A2B4A;">
      <div style="background:#0B3D8E;padding:20px 28px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:18px;">AI cost review — ${escapeHtml(monthLabel)}</h1>
      </div>
      <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
          ${rows.length} of ${totalAccounts} account${totalAccounts === 1 ? "" : "s"}
          ${rows.length === 1 ? "has" : "have"} passed ${money(thresholdUsd)} in raw AI cost this month
          (${Math.round(getAlertFraction() * 100)}% of the ${money(PLAN_PRICE_USD)} plan price).
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr style="text-align:left;">
              <th style="padding:8px 12px;border-bottom:2px solid #1A2B4A;">Facility</th>
              <th style="padding:8px 12px;border-bottom:2px solid #1A2B4A;">CCN</th>
              <th style="padding:8px 12px;border-bottom:2px solid #1A2B4A;text-align:right;">Raw cost</th>
              <th style="padding:8px 12px;border-bottom:2px solid #1A2B4A;text-align:right;">Of plan</th>
              <th style="padding:8px 12px;border-bottom:2px solid #1A2B4A;text-align:right;">Requests</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="font-size:13px;color:#64748B;margin:20px 0 0;line-height:1.6;">
          Raw cost is what the AI provider charges, before your markup. No customer has been
          throttled, charged or notified — this is an internal review only.
        </p>
      </div>
    </div>
  `;
}
