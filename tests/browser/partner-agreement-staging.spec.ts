import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { prepareAffiliateAgreementV4 } from "../../artifacts/api-server/src/lib/affiliate-agreement-v4.ts";

const source = readFileSync(
  resolve(process.cwd(), "artifacts/api-server/src/legal/affiliate-partner-agreement-v4-source.txt"),
  "utf8",
);
const body = prepareAffiliateAgreementV4(source);
const checksum = createHash("sha256").update(body).digest("hex");

test.beforeAll(async () => { await clerkSetup(); });

test("Partner Agreement stages the canonical draft without review or publication", async ({ page, baseURL }) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required for the development-only browser check");

  // This user is created solely for the browser check. It is never granted
  // production admin privileges and is removed even if an assertion fails.
  const clerkClient = createClerkClient({ secretKey });
  const emailAddress = `agreement-staging-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await clerkClient.users.createUser({
    emailAddress: [emailAddress], firstName: "Synthetic", lastName: "Staging",
    skipPasswordRequirement: true, skipLegalChecks: true,
  });
  let authorized = true;
  let draftRequests = 0;
  const publicationRequests: string[] = [];
  try {
    await page.route("**/api/accounts/me", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          clerkUserId: user.id, isActive: true, isSuperAdmin: authorized, isAdminUser: authorized,
        }),
      }),
    );
    // No request in this test can reach the live agreement API. Only GET
    // current and GET v4-draft are served; every write is trapped.
    await page.route("**/api/affiliates/agreements/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        publicationRequests.push(`${request.method()} ${path}`);
        return route.fulfill({ status: 405, body: "{}" });
      }
      if (path.endsWith("/current")) {
        return route.fulfill({
          status: authorized ? 200 : 403, contentType: "application/json",
          body: JSON.stringify(authorized ? { version: null, published: false } : { error: "Super-admin access required" }),
        });
      }
      if (path.endsWith("/v4-draft")) {
        draftRequests++;
        return route.fulfill({
          status: authorized ? 200 : 403, contentType: "application/json",
          body: JSON.stringify(authorized ? { version: "4.0", body, contentSha256: checksum } : { error: "Super-admin access required" }),
        });
      }
      return route.fulfill({ status: 404, body: "{}" });
    });

    const url = (path: string) => new URL(path, baseURL!.replace(/\/?$/, "/")).toString();
    await page.goto(url("sign-in"));
    await clerk.signIn({ page, emailAddress });
    await page.goto(url("admin/affiliate-compliance"));
    await page.getByTestId("button-agreement-tab").click();
    await expect(page.getByTestId("input-agreement-version")).toHaveValue("4.0");
    await expect(page.getByTestId("input-agreement-body")).toHaveValue(body);
    await expect(page.getByText(`Prepared Version 4.0 text checksum (SHA-256): ${checksum}`, { exact: false })).toBeVisible();
    await expect(page.getByTestId("checkbox-review-agreement")).not.toBeChecked();
    await expect(page.getByTestId("button-publish-agreement")).toBeDisabled();
    expect(draftRequests).toBe(1);
    expect(publicationRequests).toEqual([]);

    // A browser session that the API does not authorize must not even request
    // the prepared text; the route-level guard is separately tested in Node.
    authorized = false;
    await page.reload();
    await page.getByTestId("button-agreement-tab").click();
    await expect(page.getByText("Super-admin access is required to manage the Partner Agreement.")).toBeVisible();
    expect(draftRequests).toBe(1);
    expect(publicationRequests).toEqual([]);
  } finally {
    await clerkClient.users.deleteUser(user.id);
  }
});