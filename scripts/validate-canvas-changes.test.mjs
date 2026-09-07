import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  changedPathsFromGit,
  requiresCanvasRelease,
} from "./validate-canvas-changes.mjs";

test("requires the gate for billing access files", () => {
  assert.equal(
    requiresCanvasRelease([
      "artifacts/api-server/src/middlewares/requireActiveSubscription.ts",
    ]),
    true,
  );
  assert.equal(
    requiresCanvasRelease(["artifacts/api-server/src/routes/billing.ts"]),
    true,
  );
});

test("requires the gate for Canvas and workspace dependency files", () => {
  for (const path of [
    "artifacts/mockup-sandbox/src/App.tsx",
    "artifacts/mockup-sandbox/package.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "artifacts/cms-compliance-consultant-training/package.json",
  ]) {
    assert.equal(requiresCanvasRelease([path]), true, path);
  }
});

test("does not require the gate for unrelated documentation or artifacts", () => {
  for (const path of [
    "README.md",
    "docs/release-process.md",
    "artifacts/marketing-site/src/App.tsx",
    "artifacts/mobile/app/index.tsx",
    "artifacts/api-server/src/routes/health.ts",
  ]) {
    assert.equal(requiresCanvasRelease([path]), false, path);
  }
});

test("matches path prefixes on directory boundaries", () => {
  assert.equal(
    requiresCanvasRelease(["artifacts/mockup-sandbox-copy/src/App.tsx"]),
    false,
  );
});

test("deleted files in every protected category still require the gate", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-paths-"));
  const deletedProtectedPaths = [
    ".replit",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "artifacts/mockup-sandbox/src/deleted-component.tsx",
    "artifacts/cms-compliance-consultant-training/package.json",
    "artifacts/api-server/src/middlewares/requireActiveSubscription.ts",
    "artifacts/api-server/src/routes/billing.ts",
  ];

  try {
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    execFileSync("git", ["config", "user.email", "canvas-test@example.invalid"], {
      cwd: repository,
    });
    execFileSync("git", ["config", "user.name", "Canvas path test"], {
      cwd: repository,
    });

    for (const path of deletedProtectedPaths) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), "protected\n");
    }

    execFileSync("git", ["add", "."], { cwd: repository });
    execFileSync("git", ["commit", "--quiet", "-m", "add protected files"], {
      cwd: repository,
    });

    for (const path of deletedProtectedPaths) {
      rmSync(join(repository, path));
    }

    execFileSync("git", ["add", "--all"], { cwd: repository });
    execFileSync("git", ["commit", "--quiet", "-m", "delete protected files"], {
      cwd: repository,
    });

    const changedPaths = changedPathsFromGit(repository);
    assert.deepEqual(changedPaths.sort(), deletedProtectedPaths.sort());
    for (const path of changedPaths) {
      assert.equal(requiresCanvasRelease([path]), true, path);
    }
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});