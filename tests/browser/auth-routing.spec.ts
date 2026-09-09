import { expect, test, type Page } from "@playwright/test";

const notFoundHeading = "404 Page Not Found";

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
