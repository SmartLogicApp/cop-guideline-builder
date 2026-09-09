import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkStartupProbeContract,
  startupProbeFailures,
} from "./check-startup-probe-contract.mjs";

const rootDirectory = new URL("..", import.meta.url).pathname;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const fixtures = {
  apiApp: await read("artifacts/api-server/src/app.ts"),
  apiManifest: await read("artifacts/api-server/.replit-artifact/artifact.toml"),
  apiPackage: await read("artifacts/api-server/package.json"),
  mobileServer: await read("artifacts/mobile/server/serve.js"),
  mobileManifest: await read("artifacts/mobile/.replit-artifact/artifact.toml"),
  mobilePackage: await read("artifacts/mobile/package.json"),
};

test("accepts the checked-in startup probe contract", async () => {
  assert.deepEqual(await checkStartupProbeContract(rootDirectory), []);
});

test("rejects probe path drift and authenticated API registration", () => {
  const failures = startupProbeFailures({
    ...fixtures,
    apiManifest: fixtures.apiManifest.replace("/api/healthz", "/api/status"),
    mobileManifest: fixtures.mobileManifest.replace(
      "/mobile/readyz",
      "/readyz",
    ),
  }).join("\n");
  assert.match(failures, /API startup probe .* must match a GET endpoint/);
  assert.match(failures, /mobile startup probe must be \/mobile\/readyz/);

  const reorderedApi = fixtures.apiApp.replace(
    /app\.get\("\/api\/healthz"[\s\S]*?\n\}\);\n/u,
    "",
  ) + '\napp.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));\n';
  assert.match(
    startupProbeFailures({ ...fixtures, apiApp: reorderedApi }).join("\n"),
    /before Clerk and authenticated API routing/,
  );
});

test("rejects production builds that skip the contract", () => {
  const apiPackage = JSON.parse(fixtures.apiPackage);
  delete apiPackage.scripts.prebuild;
  assert.match(
    startupProbeFailures({
      ...fixtures,
      apiPackage: JSON.stringify(apiPackage),
    }).join("\n"),
    /API production build must run/,
  );
});

async function mobileReadiness(withManifests) {
  const staticRoot = await mkdtemp(join(tmpdir(), "mobile-readiness-"));
  try {
    if (withManifests) {
      for (const platform of ["ios", "android"]) {
        await mkdir(join(staticRoot, platform), { recursive: true });
        await writeFile(join(staticRoot, platform, "manifest.json"), "{}");
      }
    }
    process.env.MOBILE_STATIC_ROOT = staticRoot;
    process.env.BASE_PATH = "/mobile/";
    const require = createRequire(import.meta.url);
    const modulePath = require.resolve("../artifacts/mobile/server/serve.js");
    delete require.cache[modulePath];
    const { createServer } = require(modulePath);
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/mobile/readyz`);
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    delete process.env.MOBILE_STATIC_ROOT;
    delete process.env.BASE_PATH;
    await rm(staticRoot, { recursive: true, force: true });
  }
}

test("mobile probe reports not ready without required manifests", async () => {
  assert.deepEqual(await mobileReadiness(false), {
    status: 503,
    body: { status: "not_ready" },
  });
});

test("mobile probe reports ready with both required manifests", async () => {
  assert.deepEqual(await mobileReadiness(true), {
    status: 200,
    body: { status: "ok" },
  });
});