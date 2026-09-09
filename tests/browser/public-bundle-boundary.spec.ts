import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page, type Request } from "@playwright/test";
import bundleBoundaryEntries from "../../artifacts/marketing-site/scripts/bundle-boundary-entries.cjs";

const { findPublicBundleBoundaryEntries } = bundleBoundaryEntries;

type ManifestChunk = {
  file: string;
  src?: string;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
};

type ViteManifest = Record<string, ManifestChunk>;

function routeUrl(baseURL: string, route: string): string {
  return new URL(
    route.replace(/^\//, ""),
    `${baseURL.replace(/\/?$/, "/")}`,
  ).toString();
}

function collectFiles(
  manifest: ViteManifest,
  startKey: string,
  includeDynamicImports: boolean,
): Set<string> {
  const visited = new Set<string>();
  const files = new Set<string>();

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
      files.add(file);
    }
    for (const importedKey of chunk.imports ?? []) visit(importedKey);
    if (includeDynamicImports) {
      for (const importedKey of chunk.dynamicImports ?? []) visit(importedKey);
    }
  }

  visit(startKey);
  return files;
}

async function privateBuildFiles(baseURL: string) {
  const buildDirectory = new URL(baseURL).pathname.includes("/auth-test/")
    ? "dist/auth-test"
    : "dist/public";
  const metadataDirectory = path.resolve(
    "artifacts/marketing-site",
    buildDirectory,
    ".vite",
  );
  const manifest = JSON.parse(
    await readFile(path.join(metadataDirectory, "manifest.json"), "utf8"),
  ) as ViteManifest;
  const authBoundary = JSON.parse(
    await readFile(
      path.join(metadataDirectory, "auth-boundary-manifest.json"),
      "utf8",
    ),
  ) as { clerkChunks: string[] };

  const {
    publicEntry,
    workspaceEntry,
    authEntry,
  } = findPublicBundleBoundaryEntries(manifest);

  const publicFiles = collectFiles(manifest, publicEntry[0], false);
  const authFiles = collectFiles(manifest, authEntry[0], false);
  for (const clerkFile of authBoundary.clerkChunks) authFiles.add(clerkFile);
  const workspaceFiles = collectFiles(manifest, workspaceEntry[0], true);
  for (const publicFile of publicFiles) {
    authFiles.delete(publicFile);
    workspaceFiles.delete(publicFile);
  }

  return {
    authFiles,
    forbiddenFiles: new Set([...authFiles, ...workspaceFiles]),
  };
}

function captureSameOriginRequests(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin === origin) requests.push(request);
  });
  return requests;
}

function requestedBuildFiles(requests: Request[], baseURL: string) {
  const prefix = new URL(baseURL).pathname.replace(/\/$/, "");
  return new Set(
    requests.map((request) => {
      const pathname = new URL(request.url()).pathname;
      return pathname
        .slice(prefix.length)
        .replace(/^\/+/, "");
    }),
  );
}

test.describe("production browser bundle boundary", () => {
  test("public routes never request auth or private workspace files", async ({
    page,
    baseURL,
  }) => {
    const { forbiddenFiles } = await privateBuildFiles(baseURL!);
    const requests = captureSameOriginRequests(page, baseURL!);

    for (const [route, heading] of [
      ["/", /^Navigate healthcare compliance with absolute confidence\.$/],
      ["/terms", /terms of service/i],
      ["/privacy", /^Privacy Policy$/],
    ] as const) {
      const response = await page.goto(routeUrl(baseURL!, route));
      expect(response?.status(), `${route} should load from production preview`).toBe(
        200,
      );
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    const requestedFiles = requestedBuildFiles(requests, baseURL!);
    const forbiddenRequests = [...forbiddenFiles].filter((file) =>
      requestedFiles.has(file),
    );
    expect(
      forbiddenRequests,
      `public routes requested private build files:\n${forbiddenRequests.join("\n")}`,
    ).toEqual([]);
  });

  for (const route of ["/sign-in", "/app"]) {
    test(`${route} requests the authentication boundary`, async ({
      page,
      baseURL,
    }) => {
      const { authFiles } = await privateBuildFiles(baseURL!);
      const requests = captureSameOriginRequests(page, baseURL!);

      await page.goto(routeUrl(baseURL!, route));
      await expect
        .poll(
          () => {
            const requestedFiles = requestedBuildFiles(requests, baseURL!);
            return [...authFiles].some((file) => requestedFiles.has(file));
          },
          {
            message: `${route} did not request any generated authentication file`,
          },
        )
        .toBeTruthy();
    });
  }
});