import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

test.beforeAll(async () => { await clerkSetup(); });

test("Applications keeps pending rows through optional failures and limits review actions to super-admins", async ({ page, baseURL }) => {
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY required for browser auth check");
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const emailAddress = `applications-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await client.users.createUser({
    emailAddress: [emailAddress], skipPasswordRequirement: true, skipLegalChecks: true,
  });
  const routeUrl = (path: string) => new URL(path, baseURL!.replace(/\/?$/, "/")).toString();
  const pending = {
    id: "synthetic-pending", companyName: "Example Vendor", contactName: "Example Contact",
    email: "example@example.org", status: "pending", referralPlan: "Refer clinics",
    agreementAcceptance: null,
  };
  let superAdmin = false;
  let listFails = false;
  let statsFails = false;
  let agreementFailureStatus = 403;
  let accepted = false;
  let writes = 0;
  try {
    await page.route("**/api/accounts/me", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ clerkUserId: user.id, isActive: true, isAdminUser: true, isSuperAdmin: superAdmin }),
    }));
    await page.route("**/api/admin/**", (route) => route.fulfill({
      contentType: "application/json", body: "[]",
    }));
    await page.route("**/api/affiliates**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") {
        writes++;
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"Super-admin access required"}' });
      }
      if (path.endsWith("/agreements/current"))
        return route.fulfill({ status: agreementFailureStatus || 200, contentType: "application/json",
          body: JSON.stringify(agreementFailureStatus ? { error: "Agreement unavailable" } : { version: "reviewed", published: true }) });
      if (path.endsWith("/stats"))
        return route.fulfill({ status: statsFails ? 503 : 200, contentType: "application/json",
          body: JSON.stringify(statsFails ? { error: "Unavailable" } : { activationEnabled: true }) });
      if (path.endsWith("/affiliates"))
        return route.fulfill({ status: listFails ? 503 : 200, contentType: "application/json",
          body: JSON.stringify(listFails ? { error: "Unavailable" } : [
            { ...pending, agreementAcceptance: accepted
              ? { version: "reviewed", acceptedAt: "2026-09-01T12:00:00Z", signerName: "Example Contact" } : null },
            { ...pending, id: "active", status: "active", companyName: "Not Pending" },
          ]) });
      return route.fulfill({ status: 404, body: "{}" });
    });
    await page.goto(routeUrl("sign-in"));
    await clerk.signIn({ page, emailAddress });
    await page.goto(routeUrl("app"));
    await page.getByRole("button", { name: "⚙ Admin" }).click();
    await page.getByRole("tab", { name: "Applications" }).click();
    const applications = page.getByRole("region", { name: "Vendor and affiliate applications" });
    await expect(applications.getByText("Example Vendor")).toBeVisible();
    await expect(applications.getByText("Not Pending")).toHaveCount(0);
    await expect(applications.getByText(/status is restricted to the owner/)).toBeVisible();
    await expect(applications.getByRole("button", { name: /Publish|Approve|Disapprove|Send agreement invitation/ })).toHaveCount(0);

    statsFails = true;
    agreementFailureStatus = 503;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByText("Example Vendor")).toBeVisible();
    await expect(applications.getByText(/Reviewed agreement status could not be loaded/)).toBeVisible();
    listFails = true;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByRole("alert")).toContainText("Could not load applications");
    await expect(applications.getByText("No applications awaiting review.")).toHaveCount(0);
    listFails = false;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByText("Example Vendor")).toBeVisible();
    await expect(applications.getByRole("alert")).toHaveCount(0);

    superAdmin = true;
    statsFails = false;
    agreementFailureStatus = 0;
    await page.reload();
    await page.getByRole("button", { name: "⚙ Admin" }).click();
    await page.getByRole("tab", { name: "Applications" }).click();
    await expect(applications.getByRole("button", { name: "Send agreement invitation" })).toBeEnabled();
    await expect(applications.getByRole("button", { name: "Disapprove application" })).toBeVisible();
    await expect(applications.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    accepted = true;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
    statsFails = true;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByText(/Approval availability could not be confirmed/)).toBeVisible();
    await expect(applications.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    statsFails = false;
    agreementFailureStatus = 503;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByText(/Reviewed agreement status could not be loaded/)).toBeVisible();
    await expect(applications.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(applications.getByRole("button", { name: "Send agreement invitation" })).toHaveCount(0);
    agreementFailureStatus = 403;
    await applications.getByRole("button", { name: /Refresh applications/ }).click();
    await expect(applications.getByText(/Super-admin permission was denied/)).toBeVisible();
    expect(writes).toBe(0);
  } finally {
    await client.users.deleteUser(user.id);
  }
});

test("Disapprove survives a transient access 401 after the reason dialog", async ({ page, baseURL }) => {
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY required for browser auth check");
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const emailAddress = `review-flow-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await client.users.createUser({
    emailAddress: [emailAddress], skipPasswordRequirement: true, skipLegalChecks: true,
  });
  const routeUrl = (path: string) => new URL(path, baseURL!.replace(/\/?$/, "/")).toString();
  let failNextAccess = false;
  let transient401s = 0;
  let rejected = false;
  let rejectionRequests = 0;
  try {
    await page.route("**/api/accounts/me", (route) => {
      if (failNextAccess) {
        failNextAccess = false;
        transient401s += 1;
        return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Unauthorized"}' });
      }
      return route.fulfill({ contentType: "application/json",
        body: JSON.stringify({ clerkUserId: user.id, isActive: true, isAdminUser: true, isSuperAdmin: true }) });
    });
    await page.route("**/api/admin/**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
    await page.route("**/api/affiliates**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/synthetic-pending/reject") && route.request().method() === "POST") {
        rejectionRequests += 1;
        const reason = JSON.parse(route.request().postData() || "{}").reason;
        if (typeof reason !== "string" || reason.length < 5 || !route.request().headers()["authorization"]) {
          return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Unauthorized"}' });
        }
        rejected = true;
        return route.fulfill({ contentType: "application/json",
          body: '{"id":"synthetic-pending","status":"rejected"}' });
      }
      if (route.request().method() !== "GET")
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"Unexpected write"}' });
      if (path.endsWith("/stats"))
        return route.fulfill({ contentType: "application/json", body: '{"activationEnabled":false}' });
      if (path.endsWith("/agreements/current"))
        return route.fulfill({ contentType: "application/json", body: '{"version":"reviewed","published":true}' });
      if (path.endsWith("/affiliates"))
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(rejected ? [] : [{
          id: "synthetic-pending", companyName: "Disposable Test Applicant",
          contactName: "Example Contact", email: "test@example.org",
          status: "pending", agreementAcceptance: null,
        }]) });
      return route.fulfill({ status: 404, body: "{}" });
    });
    await page.goto(routeUrl("sign-in"));
    await clerk.signIn({ page, emailAddress });
    await page.goto(routeUrl("app"));
    await page.getByRole("button", { name: "⚙ Admin" }).click();
    await page.getByRole("tab", { name: "Applications" }).click();
    const applications = page.getByRole("region", { name: "Vendor and affiliate applications" });
    await expect(applications.getByText("Disposable Test Applicant")).toBeVisible();

    failNextAccess = true;
    page.once("dialog", (dialog) => dialog.accept("Applicant did not meet review criteria"));
    await applications.getByRole("button", { name: "Disapprove application" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect.poll(() => transient401s).toBe(1);
    await expect(applications.locator("article").filter({ hasText: "Disposable Test Applicant" })).toHaveCount(0);
    await expect(applications.getByText("No applications awaiting review.")).toBeVisible();
    await expect(applications.getByText("Disposable Test Applicant's application was declined.")).toBeVisible();
    await expect(page.getByRole("button", { name: "⚙ Admin" })).toBeVisible();
    await expect(page.getByText("We couldn't verify your access")).toHaveCount(0);
    expect(rejectionRequests).toBe(1);
  } finally {
    await client.users.deleteUser(user.id);
  }
});