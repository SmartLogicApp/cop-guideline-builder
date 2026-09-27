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
  test("a Clerk user stays signed in after refresh and loses access after sign-out", async ({
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
      await page.route("**/api/accounts/me", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            clerkUserId: user.id,
            isActive: true,
            isSuperAdmin: false,
            isAdminUser: false,
          }),
        });
      });
      await page.goto(routeUrl(baseURL!, "/sign-in"));
      await clerk.signIn({ page, emailAddress });
      await page.goto(routeUrl(baseURL!, "/app"));

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

      await page.getByRole("button", { name: "Sign Out" }).click();

      await expect(page).toHaveURL(new RegExp(`${basePath}/?$`));
      await expect(
        page.getByRole("heading", {
          name: /^Navigate healthcare compliance with absolute confidence\.$/,
        }),
      ).toBeVisible();

      await page.goto(routeUrl(baseURL!, "/app"));
      await expect(page).toHaveURL(
        new RegExp(`${basePath}/sign-in(?:\\?.*)?$`),
      );
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(
        new RegExp(`${basePath}/sign-in(?:\\?.*)?$`),
      );
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: workspaceHeading, exact: true }),
      ).toHaveCount(0);
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

  test("the trailing-slash app URL keeps workspace protection", async ({
    page,
    baseURL,
  }) => {
    const basePath = escapedBasePath(baseURL!);

    await page.goto(routeUrl(baseURL!, "/app/"));

    await expect(page).toHaveURL(new RegExp(`${basePath}/sign-in(?:\\?.*)?$`));
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });
});

test.describe("built marketing site public routing", () => {
  test("client navigation and browser history switch public and auth shells", async ({
    page,
    baseURL,
  }) => {
    const landingHeading = page.getByRole("heading", {
      name: /^Navigate healthcare compliance with absolute confidence\.$/,
    });

    await page.goto(routeUrl(baseURL!, "/"));
    await expect(landingHeading).toBeVisible();

    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, new URL(routeUrl(baseURL!, "/sign-in")).pathname);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await page.goBack();
    await expect(landingHeading).toBeVisible();

    await page.goForward();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, new URL(routeUrl(baseURL!, "/privacy")).pathname);
    await expect(
      page.getByRole("heading", { name: "Privacy Policy", exact: true }),
    ).toBeVisible();
  });

  test("prefixed public pages and assets stay within the site prefix", async ({
    page,
    baseURL,
  }) => {
    const siteBaseURL = new URL(baseURL!);
    const prefix = siteBaseURL.pathname.replace(/\/$/, "");
    const escapedPrefix = escapedBasePath(baseURL!);
    test.skip(!prefix, "Root-mounted build has no nested prefix to enforce");

    const escapedRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === siteBaseURL.origin &&
        !url.pathname.startsWith(`${prefix}/`)
      ) {
        escapedRequests.push(`${request.resourceType()}: ${url.pathname}`);
      }
    });

    for (const [path, heading] of [
      ["/", /^Navigate healthcare compliance with absolute confidence\.$/],
      ["/terms", /terms of service/i],
      ["/privacy", /^Privacy Policy$/],
    ] as const) {
      const response = await page.goto(routeUrl(baseURL!, path));
      expect(response?.status(), `${path} should load`).toBe(200);
      await expect(
        page.getByRole("heading", { name: heading }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: notFoundHeading }),
      ).toHaveCount(0);

      const pageLinks = await page.locator("a[href]").evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).href),
      );
      for (const linkUrl of pageLinks) {
        const url = new URL(linkUrl);
        if (url.origin === siteBaseURL.origin) {
          expect(url.pathname, `${path} link escaped the site prefix`).toMatch(
            new RegExp(`^${escapedPrefix}(?:/|$)`),
          );
        }
      }
    }

    const documentAssets = await page
      .locator('script[src], link[rel="stylesheet"]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          tagName: element.tagName,
          url:
            (element as HTMLScriptElement).src ||
            (element as HTMLLinkElement).href,
        })),
      );
    const sameOriginAssets = documentAssets.filter(
      ({ url }) => new URL(url).origin === siteBaseURL.origin,
    );
    expect(
      sameOriginAssets.some(({ tagName }) => tagName === "SCRIPT"),
      "the document should load a same-origin JavaScript bundle",
    ).toBeTruthy();
    expect(
      sameOriginAssets.some(({ tagName }) => tagName === "LINK"),
      "the document should load a same-origin stylesheet",
    ).toBeTruthy();
    for (const { url: assetUrl } of sameOriginAssets) {
      expect(new URL(assetUrl).pathname).toMatch(
        new RegExp(`^${escapedPrefix}/`),
      );
      const response = await page.request.get(assetUrl);
      expect(response.ok(), assetUrl).toBeTruthy();
    }

    for (const assetPath of ["/logo.svg", "/favicon.svg", "/og-image.png"]) {
      const assetUrl = routeUrl(baseURL!, assetPath);
      const response = await page.request.get(assetUrl);
      expect(response.ok(), assetUrl).toBeTruthy();
    }

    expect(escapedRequests).toEqual([]);
  });
});
