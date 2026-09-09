import { expect, test, type Page } from "@playwright/test";

const notFoundHeading = "404 Page Not Found";

async function expectClerkAuthFlow(
  page: Page,
  path: string,
) {
  await page.goto(path);

  await expect(page.getByRole("heading", { name: notFoundHeading })).toHaveCount(0);
  await expect(page.locator(".cl-rootBox")).toBeVisible();
}

test.describe("built marketing site auth routing", () => {
  test("signed-out visitors can open Clerk sign-in routes", async ({ page }) => {
    await expectClerkAuthFlow(page, "/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await expectClerkAuthFlow(page, "/sign-in/factor-one");
    await expect(page).toHaveURL(/\/sign-in(?:\/factor-one)?(?:\?.*)?$/);
  });

  test("signed-out visitors can open Clerk sign-up routes", async ({ page }) => {
    await expectClerkAuthFlow(page, "/sign-up");
    await expect(
      page.getByRole("heading", { name: "Start your free trial" }),
    ).toBeVisible();

    await expectClerkAuthFlow(page, "/sign-up/sso-callback");
    await expect(page).toHaveURL(
      /\/(?:sign-up\/sso-callback|sign-in)(?:\?.*)?$/,
    );
  });

  test("signed-out visitors to the app are redirected to sign-in", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
    await expect(page.locator(".cl-rootBox")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});