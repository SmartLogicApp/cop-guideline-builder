import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function startupPath(manifest) {
  const match = manifest.match(
    /\[services\.production\.health\.startup\]\s*[\r\n]+\s*path\s*=\s*["']([^"']+)["']/u,
  );
  return match?.[1];
}

function packagePrebuild(packageText) {
  return String(JSON.parse(packageText).scripts?.prebuild ?? "");
}

function packageBuild(packageText) {
  return String(JSON.parse(packageText).scripts?.build ?? "");
}

export function startupProbeFailures({
  apiApp,
  apiManifest,
  apiPackage,
  mobileServer,
  mobileManifest,
  mobilePackage,
}) {
  const failures = [];
  const apiPath = startupPath(apiManifest);
  const mobilePath = startupPath(mobileManifest);
  const apiRoute = apiPath
    ? `app.get(${JSON.stringify(apiPath)}`
    : "";
  const apiRouteIndex = apiApp.indexOf(apiRoute);
  const clerkIndex = apiApp.indexOf("clerkMiddleware(");
  const authenticatedRouterIndex = apiApp.indexOf('app.use("/api", router)');

  if (!apiPath) {
    failures.push("API deployment must declare a production startup probe path");
  } else if (apiRouteIndex < 0) {
    failures.push(`API startup probe ${apiPath} must match a GET endpoint`);
  } else if (
    clerkIndex < 0 ||
    authenticatedRouterIndex < 0 ||
    apiRouteIndex > clerkIndex ||
    apiRouteIndex > authenticatedRouterIndex
  ) {
    failures.push(
      "API startup probe must remain registered before Clerk and authenticated API routing",
    );
  }

  const basePath = mobileManifest.match(
    /^\s*BASE_PATH\s*=\s*["']([^"']+)["']/mu,
  )?.[1];
  const expectedMobilePath = `${(basePath ?? "").replace(/\/+$/u, "")}/readyz`;
  if (!mobilePath) {
    failures.push("mobile deployment must declare a production startup probe path");
  } else if (mobilePath !== expectedMobilePath) {
    failures.push(
      `mobile startup probe must be ${expectedMobilePath} to match BASE_PATH and /readyz`,
    );
  }
  if (!mobileServer.includes("if (pathname === '/readyz')")) {
    failures.push("mobile startup probe must match an unauthenticated /readyz endpoint");
  }
  for (const platform of ["ios", "android"]) {
    if (
      !mobileServer.includes(
        `path.join(STATIC_ROOT, '${platform}', 'manifest.json')`,
      )
    ) {
      failures.push(`mobile readiness must require the ${platform} manifest`);
    }
  }
  if (
    !mobileServer.includes("const statusCode = buildIsReady ? 200 : 503") ||
    !mobileServer.includes("status: buildIsReady ? 'ok' : 'not_ready'")
  ) {
    failures.push("mobile readiness must expose distinct ready and not-ready responses");
  }

  const requiredCommand = "pnpm --dir ../.. run test:startup-probe-contract";
  const requiredApiPrebuild =
    `${requiredCommand} && pnpm run test:startup-schema-safety`;
  if (packagePrebuild(apiPackage) !== requiredApiPrebuild) {
    failures.push(
      "API production build must run the startup probe contract and startup schema safety first",
    );
  }
  if (
    packageBuild(apiPackage) !==
    "node ./build.mjs && pnpm --dir ../.. run test:api-readiness-smoke"
  ) {
    failures.push("API production build must smoke test the compiled readiness endpoint");
  }
  if (packagePrebuild(mobilePackage) !== requiredCommand) {
    failures.push("mobile production build must run the startup probe contract first");
  }
  return failures;
}

export async function checkStartupProbeContract(rootDirectory) {
  const read = (path) => readFile(resolve(rootDirectory, path), "utf8");
  const [
    apiApp,
    apiManifest,
    apiPackage,
    mobileServer,
    mobileManifest,
    mobilePackage,
  ] = await Promise.all([
    read("artifacts/api-server/src/app.ts"),
    read("artifacts/api-server/.replit-artifact/artifact.toml"),
    read("artifacts/api-server/package.json"),
    read("artifacts/mobile/server/serve.js"),
    read("artifacts/mobile/.replit-artifact/artifact.toml"),
    read("artifacts/mobile/package.json"),
  ]);
  return startupProbeFailures({
    apiApp,
    apiManifest,
    apiPackage,
    mobileServer,
    mobileManifest,
    mobilePackage,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const failures = await checkStartupProbeContract(root);
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Startup probe contract passed.");
  }
}