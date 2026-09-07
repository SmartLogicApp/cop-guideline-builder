import { expect, test } from "@playwright/test";

const previewPath = "/preview/cop-guideline-builder/CoPGuidelineBuilder";
const historyKey = "cms_gap_analysis_history_cache:anonymous";
const sessionKey = "cms_ephemeral_policy_session";

const actionPlan = [
  {
    priority: "High",
    body: "CMS",
    code: "§482.42",
    requirement: "Document infection prevention oversight",
    responsibleRole: "Infection Preventionist",
    suggestedDeadline: "30 days",
    actionSteps: "1. Draft the oversight section. 2. Obtain committee approval.",
  },
  {
    priority: "Medium",
    body: "CMS",
    code: "§482.13",
    requirement: "Record patient rights training",
    responsibleRole: "Education Director",
    suggestedDeadline: "60 days",
    actionSteps: "1. Update training materials. 2. Record attendance.",
  },
];

const scans = [
  {
    id: "scan-infection-control",
    institution: "hospital",
    institutionLabel: "Hospital",
    topic: "Infection Prevention & Control",
    score: 55,
    timestamp: "2026-09-06T10:00:00.000Z",
    result: {
      score: 55,
      summary: "Infection-control scan used by the browser regression test.",
      met: [],
      weak: [],
      missing: [{ body: "CMS", code: "§482.42", title: "Infection control", finding: "Missing", recommendation: "Add it" }],
    },
    actionPlan,
  },
  {
    id: "scan-patient-rights",
    institution: "hospital",
    institutionLabel: "Hospital",
    topic: "Patient Rights",
    score: 65,
    timestamp: "2026-09-07T10:00:00.000Z",
    result: {
      score: 65,
      summary: "Patient-rights scan used by the browser regression test.",
      met: [],
      weak: [],
      missing: [{ body: "CMS", code: "§482.13", title: "Patient rights", finding: "Missing", recommendation: "Add it" }],
    },
    actionPlan,
  },
];

test("remediation completion persists on its scan and stays isolated from other scans", async ({ page }) => {
  await page.route("**/api/accounts/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/gap-history", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.addInitScript(
    ({ entries, gapHistoryKey, gapSessionKey }) => {
      localStorage.setItem("cop-suite-onboarded", "1");
      sessionStorage.setItem("cms_active_workspace_tab", "gap");
      sessionStorage.setItem(gapHistoryKey, JSON.stringify(entries));
      sessionStorage.setItem(
        gapSessionKey,
        JSON.stringify({
          institution: "hospital",
          unit: "Emergency Department",
          topic: entries[0].topic,
          customTopic: "",
          policyText: "",
          result: entries[0].result,
          resultMeta: { institution: "hospital", topic: entries[0].topic },
          actionPlan: entries[0].actionPlan,
          actionPlans: Object.fromEntries(entries.map((entry) => [entry.id, entry.actionPlan])),
          loadedEntryId: entries[0].id,
          history: entries,
          expiresAt: Date.now() + 30 * 60 * 1000,
        }),
      );
    },
    { entries: scans, gapHistoryKey: historyKey, gapSessionKey: sessionKey },
  );

  await page.goto(previewPath);

  const progress = page.getByRole("progressbar", { name: "Remediation progress" });
  await expect(page.getByText("0 of 2 actions completed")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("button", { name: "Mark Complete" }).first().click();
  await expect(page.getByText("1 of 2 actions completed")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress.locator("div")).toHaveAttribute("style", /width: 50%/);

  await page.reload();
  await expect(page.getByText("1 of 2 actions completed")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("button", { name: "✓ Complete" })).toHaveCount(1);

  await page.getByRole("button", { name: /Session Results/ }).click();
  await page.getByText("Patient Rights", { exact: true }).click();

  await expect(page.getByText("0 of 2 actions completed")).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "✓ Complete" })).toHaveCount(0);
});