import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("./sitemap.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.ts", import.meta.url), "utf8");
const sitemapSource = await readFile(
  new URL("../../../marketing-site/public/sitemap.xml", import.meta.url),
  "utf8",
);
const artifactSource = await readFile(
  new URL("../../.replit-artifact/artifact.toml", import.meta.url),
  "utf8",
);

test("API sitemap payload stays identical to the marketing sitemap", () => {
  const match = routeSource.match(/export const SITEMAP_XML = `([\s\S]*?)`;/);
  assert.ok(match, "Expected the API sitemap XML constant");
  assert.equal(match[1].trim(), sitemapSource.trim());
});

test("sitemap route declares XML content type and is mounted before Clerk", () => {
  assert.match(routeSource, /\.set\("Content-Type", "application\/xml; charset=utf-8"\)/);
  const mountIndex = appSource.indexOf('app.get("/sitemap.xml", sitemapHandler)');
  const clerkIndex = appSource.indexOf("clerkMiddleware(");
  assert.ok(mountIndex >= 0, "Expected the public sitemap route to be mounted");
  assert.ok(clerkIndex > mountIndex, "Expected sitemap route to precede Clerk authentication");
});

test("API service receives the root sitemap request through the shared proxy", () => {
  const paths = artifactSource.match(/paths\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";
  assert.match(paths, /"\/api"/);
  assert.match(paths, /"\/sitemap\.xml"/);
});