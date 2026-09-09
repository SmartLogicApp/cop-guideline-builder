# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-routing.spec.ts >> built marketing site auth routing >> signed-out visitors can open Clerk sign-up routes
- Location: tests/browser/auth-routing.spec.ts:24:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/sign-up(?:\/sso-callback)?(?:\?.*)?$/
Received string:  "http://127.0.0.1:4174/sign-in"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://127.0.0.1:4174/sign-in"

```

```yaml
- link "Cop Guideline Builder":
  - /url: http://127.0.0.1:4174/
  - img "Cop Guideline Builder"
- heading "Welcome back" [level=1]
- paragraph: Sign in to access your compliance workspace
- text: Email address
- textbox "Email address":
  - /placeholder: Enter your email address
- button "Continue":
  - text: Continue
  - img
- paragraph: or
- button "Sign in with Google Continue with Google": Continue with Google
- text: Don’t have an account?
- link "Sign up":
  - /url: http://127.0.0.1:4174/sign-up
- paragraph: Development mode
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | 
  3  | const notFoundHeading = "404 Page Not Found";
  4  | 
  5  | async function expectClerkAuthFlow(
  6  |   page: Page,
  7  |   path: string,
  8  | ) {
  9  |   await page.goto(path);
  10 | 
  11 |   await expect(page.getByRole("heading", { name: notFoundHeading })).toHaveCount(0);
  12 |   await expect(page.locator(".cl-rootBox")).toBeVisible();
  13 | }
  14 | 
  15 | test.describe("built marketing site auth routing", () => {
  16 |   test("signed-out visitors can open Clerk sign-in routes", async ({ page }) => {
  17 |     await expectClerkAuthFlow(page, "/sign-in");
  18 |     await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  19 | 
  20 |     await expectClerkAuthFlow(page, "/sign-in/factor-one");
  21 |     await expect(page).toHaveURL(/\/sign-in(?:\/factor-one)?(?:\?.*)?$/);
  22 |   });
  23 | 
  24 |   test("signed-out visitors can open Clerk sign-up routes", async ({ page }) => {
  25 |     await expectClerkAuthFlow(page, "/sign-up");
  26 |     await expect(
  27 |       page.getByRole("heading", { name: "Start your free trial" }),
  28 |     ).toBeVisible();
  29 | 
  30 |     await expectClerkAuthFlow(page, "/sign-up/sso-callback");
> 31 |     await expect(page).toHaveURL(
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  32 |       /\/sign-up(?:\/sso-callback)?(?:\?.*)?$/,
  33 |     );
  34 |   });
  35 | 
  36 |   test("signed-out visitors to the app are redirected to sign-in", async ({
  37 |     page,
  38 |   }) => {
  39 |     await page.goto("/app");
  40 | 
  41 |     await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  42 |     await expect(page.locator(".cl-rootBox")).toBeVisible();
  43 |     await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  44 |   });
  45 | });
```