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

export function formatCanvasPathForDisplay(path) {
  if (!/["\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(path)) {
    return path;
  }

  return JSON.stringify(path).replace(
    /[\u007f-\u009f\u2028\u2029]/gu,
    (character) =>
      `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function parseEnvironmentChangedPaths(value) {
  if (value.trimStart().startsWith("[")) {
    let paths;
    try {
      paths = JSON.parse(value);
    } catch (error) {
      throw new Error(
        "CANVAS_RELEASE_CHANGED_PATHS must be a valid JSON array of path strings.",
        { cause: error },
      );
    }

    if (
      !Array.isArray(paths) ||
      paths.some((path) => typeof path !== "string" || path.includes("\0"))
    ) {
      throw new Error(
        "CANVAS_RELEASE_CHANGED_PATHS must be a JSON array of Git path strings without NUL bytes.",
      );
    }

    return paths;
  }

  const paths = value
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);

  if (paths.length > 1) {
    throw new Error(
      "Multiline CANVAS_RELEASE_CHANGED_PATHS is ambiguous for Git filenames containing newlines. " +
        'Use a JSON array instead, for example: ["README.md","artifacts/mockup-sandbox/src/App.tsx"].',
    );
  }

  return paths;
}

function parseNullDelimitedPaths(value) {
  return value.split("\0").filter((path) => path.length > 0);
}

export function changedPathsFromGit(cwd = process.cwd()) {
  const revision = execFileSync(
    "git",
    ["rev-list", "--parents", "-n", "1", "HEAD"],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  )
    .trim()
    .split(/\s+/);
  const [head, ...parents] = revision;

  if (!head) {
    throw new Error("Git did not return a HEAD revision.");
  }

  if (parents.length === 0) {
    return parseNullDelimitedPaths(
      execFileSync(
        "git",
        [
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--name-only",
          "-z",
          "-r",
          head,
        ],
        {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
        },
      ),
    );
  }

  const changedPaths = new Set();
  for (const parent of parents) {
    const parentChanges = parseNullDelimitedPaths(
      execFileSync(
        "git",
        ["diff", "--no-renames", "--name-only", "-z", parent, head],
        {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
        },
      ),
    );
    for (const path of parentChanges) {
      changedPaths.add(path);
    }
  }

  return [...changedPaths].sort();
}

export function getChangedPaths() {
  if (process.env.CANVAS_RELEASE_CHANGED_PATHS !== undefined) {
    return parseEnvironmentChangedPaths(
      process.env.CANVAS_RELEASE_CHANGED_PATHS,
    );
  }

  return changedPathsFromGit();
}

function main() {
  let changedPaths;

  try {
    changedPaths = getChangedPaths();
  } catch (error) {
    console.warn(
      "Canvas release guard could not determine changed paths; running the full validation.",
    );
    if (error instanceof Error) {
      console.warn(error.message);
    }
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
        .map(formatCanvasPathForDisplay)
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