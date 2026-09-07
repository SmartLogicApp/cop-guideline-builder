import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const protectedCanvasPaths = [
  ".replit",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "artifacts/mockup-sandbox/",
  "artifacts/cms-compliance-consultant-training/package.json",
  "artifacts/api-server/src/middlewares/requireActiveSubscription.ts",
  "artifacts/api-server/src/routes/billing.ts",
  "scripts/validate-canvas-changes.mjs",
  "scripts/validate-canvas-changes.test.mjs",
];

export function requiresCanvasRelease(changedPaths) {
  return changedPaths.some((changedPath) =>
    protectedCanvasPaths.some((protectedPath) =>
      protectedPath.endsWith("/")
        ? changedPath.startsWith(protectedPath)
        : changedPath === protectedPath,
    ),
  );
}

function parseChangedPaths(value) {
  return value
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

export function changedPathsFromGit(cwd = process.cwd()) {
  return parseChangedPaths(
    execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );
}

export function getChangedPaths() {
  if (process.env.CANVAS_RELEASE_CHANGED_PATHS !== undefined) {
    return parseChangedPaths(process.env.CANVAS_RELEASE_CHANGED_PATHS);
  }

  return changedPathsFromGit();
}

function main() {
  let changedPaths;

  try {
    changedPaths = getChangedPaths();
  } catch {
    console.warn(
      "Canvas release guard could not determine changed paths; running the full validation.",
    );
    changedPaths = null;
  }

  if (changedPaths !== null && !requiresCanvasRelease(changedPaths)) {
    console.log("Canvas release validation skipped: no protected paths changed.");
    return;
  }

  if (changedPaths !== null) {
    console.log(
      `Canvas release validation required by: ${changedPaths
        .filter((path) => requiresCanvasRelease([path]))
        .join(", ")}`,
    );
  }

  const result = spawnSync("pnpm", ["run", "validate:canvas"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}