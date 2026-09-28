import assert from "node:assert/strict";
import test from "node:test";
import {
  TRIAL_WARNING_SUBJECT,
  trialWarningEmailHtml,
  trialWarningWindow,
} from "./trial-warning-email.ts";

test("trial warning window brackets five days from now", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  const window = trialWarningWindow(now);

  assert.equal(window.start.toISOString(), "2026-09-11T12:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-09-13T12:00:00.000Z");
});

test("trial warning email contains billing link, support address, and safe facility text", () => {
  const html = trialWarningEmailHtml({
    facilityName: `Hospital <North> & "Partners"`,
    trialEndsAt: new Date("2026-09-10T12:00:00.000Z"),
    billingUrl: "https://example.com/billing",
  });

  assert.equal(TRIAL_WARNING_SUBJECT, "Your CMS CoP Compliance Suite trial ends in 5 days");
  assert.match(html, /\$299 per month starting on day 31/);
  assert.match(html, /https:\/\/example\.com\/billing/);
  assert.match(html, /CMSComplianceGuardianHelp@Outlook\.com/);
  assert.match(html, /Hospital &lt;North&gt; &amp; &quot;Partners&quot;/);
  assert.doesNotMatch(html, /Hospital <North>/);
});