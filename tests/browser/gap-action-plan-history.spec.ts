import { expect, test, type Page } from "@playwright/test";

const previewPath = "/preview/cop-gap-history-fixture/GapHistoryFixture";
const ownerId = "gap-history-browser-test";
const historyKey = `cms_gap_analysis_history_cache:${ownerId}`;
const sessionKey = "cms_ephemeral_policy_session";
const plan = [{
  priority: "High",
  body: "CMS",
  code: "§482.42",
  requirement: "Document infection prevention oversight",
  responsibleRole: "Infection Preventionist",
  suggestedDeadline: "30 days",
  actionSteps: "1. Draft the oversight section. 2. Obtain committee approval.",
}];
const scanResult = {
  score: 55,
  summary: "The policy is missing infection prevention oversight.",
  met: [],
  weak: [],
  missing: [{
    body: "CMS",
    code: "§482.42",
    title: "Infection control",
    finding: "No oversight process is documented.",
    recommendation: "Document the oversight process.",
  }],
};

type Entry = {
  id: string;
  institution: string;
  institutionLabel: string;
  topic: string;
  score: number;
  timestamp: string;
  result: typeof scanResult;
  actionPlan?: typeof plan;
};

async function mockHistoryAndGeneration(page: Page) {
  const serverEntries: Entry[] = [];
  const posted: Entry[] = [];
  await page.route("**/api/accounts/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clerkUserId: ownerId, isActive: true }) }),
  );
  await page.route("**/api/gap-history", async (route) => {
    if (route.request().method() === "POST") {
      const entry = route.request().postDataJSON() as Entry;
      posted.push(entry);
      const index = serverEntries.findIndex((item) => item.id === entry.id);
      // Model the real API's current response: it stores only the scan result.
      const { actionPlan: _actionPlan, ...withoutPlan } = entry;
      if (index >= 0) serverEntries[index] = withoutPlan;
      else serverEntries.unshift(withoutPlan);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(withoutPlan) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(serverEntries) });
    }
  });
  await page.route("**/api/generate", async (route) => {
    const input = route.request().postDataJSON() as { systemPrompt: string };
    const text = input.systemPrompt.includes("remediation action plan")
      ? JSON.stringify({ actions: plan })
      : JSON.stringify(scanResult);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [{ type: "text", text }] }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("cop-suite-onboarded", "1");
    sessionStorage.setItem("cms_active_workspace_tab", "gap");
    sessionStorage.setItem("cms_ephemeral_policy_session_owner", "gap-history-browser-test");
  });
  return { serverEntries, posted };
}

test("generating a plan updates the saved scan, and reopening history restores it", async ({ page }) => {
  const { posted, serverEntries } = await mockHistoryAndGeneration(page);
  await page.goto(previewPath);
  await page.getByPlaceholder("Paste your existing policy document here…").fill("Policy for infection prevention oversight.");
  await page.getByRole("button", { name: /Scan for Compliance Gaps/ }).click();

  await expect(page.getByText(scanResult.summary)).toBeVisible();
  await expect.poll(() => posted.length).toBe(1);
  const id = posted[0].id;
  expect(posted[0].actionPlan).toBeUndefined();

  await page.getByRole("button", { name: /Generate Remediation Action Plan/ }).click();
  await expect(page.getByText(plan[0].requirement)).toBeVisible();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1].id).toBe(id);
  expect(posted[1].actionPlan).toEqual(plan);
  expect(serverEntries).toHaveLength(1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), historyKey))
    .toEqual([expect.objectContaining({ id, actionPlan: plan })]);

  // A clean reload discards the short-lived session copy and fetches the API again.
  // The cached entry must retain its plan even when the API omits that field.
  await page.evaluate((key) => sessionStorage.removeItem(key), sessionKey);
  await page.reload();
  await page.getByRole("button", { name: /Session Results \(1\)/ }).click();
  await page.getByText(posted[0].topic, { exact: true }).last().click();
  await expect(page.getByText(plan[0].requirement)).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), historyKey))
    .toEqual([expect.objectContaining({ id, actionPlan: plan })]);
});

test("a legacy scan without an action plan reopens without a stale plan", async ({ page }) => {
  await mockHistoryAndGeneration(page);
  await page.addInitScript(({ key, result }) => {
    localStorage.setItem(key, JSON.stringify([{
      id: "legacy-scan",
      institution: "hospital",
      institutionLabel: "Hospital",
      topic: "Infection Prevention & Control",
      score: result.score,
      timestamp: "2026-09-06T10:00:00.000Z",
      result,
    }]));
  }, { key: historyKey, result: scanResult });
  await page.goto(previewPath);
  await page.getByRole("button", { name: /Session Results \(1\)/ }).click();
  await page.getByText("Infection Prevention & Control", { exact: true }).last().click();
  await expect(page.getByText(scanResult.summary)).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Remediation Action Plan/ })).toBeVisible();
  await expect(page.getByText(plan[0].requirement)).toHaveCount(0);
});