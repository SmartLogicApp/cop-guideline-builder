import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const notFoundHeading = "404 Page Not Found";
const workspaceHeading = "CMS Compliance Suite";

test.beforeAll(async () => {
  await clerkSetup();
});

function routeUrl(baseURL: string, path: string): string {
  return new URL(
    path.replace(/^\//, ""),
    `${baseURL.replace(/\/?$/, "/")}`,
  ).toString();
}

function escapedBasePath(baseURL: string): string {
  return new URL(baseURL).pathname
    .replace(/\/$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectClerkAuthFlow(page: Page, baseURL: string, path: string) {
  await page.goto(routeUrl(baseURL, path));

  await expect(
    page.getByRole("heading", { name: notFoundHeading }),
  ).toHaveCount(0);
  await expect(page.locator(".cl-rootBox")).toBeVisible();
}

test.describe("built marketing site auth routing", () => {
  test("a Clerk user reaches the workspace and stays signed in after refresh", async ({
    page,
    baseURL,
  }) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "CLERK_SECRET_KEY is required for the authenticated browser check",
      );
    }

    const clerkClient = createClerkClient({ secretKey });
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const emailAddress = `auth-routing-${uniqueId}@example.com`;
    const user = await clerkClient.users.createUser({
      emailAddress: [emailAddress],
      firstName: "Browser",
      lastName: "Check",
      skipPasswordRequirement: true,
      skipLegalChecks: true,
    });
    const basePath = escapedBasePath(baseURL!);

    try {
      await page.goto(routeUrl(baseURL!, "/"));
      await clerk.signIn({ page, emailAddress });

      await expect(page).toHaveURL(new RegExp(`${basePath}/app$`));
      await expect(
        page.getByRole("heading", { name: workspaceHeading, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign Out" }),
      ).toBeVisible();

      await page.reload();

      await expect(page).toHaveURL(new RegExp(`${basePath}/app$`));
      await expect(
        page.getByRole("heading", { name: workspaceHeading, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign Out" }),
      ).toBeVisible();
    } finally {
      await clerkClient.users.deleteUser(user.id);
    }
  });

  test("signed-out visitors can open Clerk sign-in routes", async ({
    page,
    baseURL,
  }) => {
    const basePath = escapedBasePath(baseURL!);

    await expectClerkAuthFlow(page, baseURL!, "/sign-in");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await expectClerkAuthFlow(page, baseURL!, "/sign-in/factor-one");
    await expect(page).toHaveURL(
      new RegExp(`${basePath}/sign-in(?:/factor-one)?(?:\\?.*)?$`),
    );
  });

  test("signed-out visitors can open Clerk sign-up routes", async ({
    page,
    baseURL,
  }) => {
    const basePath = escapedBasePath(baseURL!);

    await expectClerkAuthFlow(page, baseURL!, "/sign-up");
    await expect(
      page.getByRole("heading", { name: "Start your free trial" }),
    ).toBeVisible();

    await expectClerkAuthFlow(page, baseURL!, "/sign-up/sso-callback");
    await expect(page).toHaveURL(
      new RegExp(`${basePath}/(?:sign-up/sso-callback|sign-in)(?:\\?.*)?$`),
    );
  });

  test("signed-out visitors to the app are redirected to sign-in", async ({
    page,
    baseURL,
  }) => {
    const basePath = escapedBasePath(baseURL!);

    await page.goto(routeUrl(baseURL!, "/app"));

    await expect(page).toHaveURL(new RegExp(`${basePath}/sign-in(?:\\?.*)?$`));
    await expect(page.locator(".cl-rootBox")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });
});
