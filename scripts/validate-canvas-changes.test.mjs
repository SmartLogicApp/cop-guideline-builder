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

function initializeRepository(repository) {
  execFileSync("git", ["init", "--quiet"], { cwd: repository });
  execFileSync("git", ["config", "user.email", "canvas-test@example.invalid"], {
    cwd: repository,
  });
  execFileSync("git", ["config", "user.name", "Canvas path test"], {
    cwd: repository,
  });
}

function commitAll(repository, message) {
  execFileSync("git", ["add", "--all"], { cwd: repository });
  execFileSync("git", ["commit", "--quiet", "-m", message], {
    cwd: repository,
  });
}

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
    initializeRepository(repository);

    for (const path of deletedProtectedPaths) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), "protected\n");
    }

    commitAll(repository, "add protected files");

    for (const path of deletedProtectedPaths) {
      rmSync(join(repository, path));
    }

    commitAll(repository, "delete protected files");

    const changedPaths = changedPathsFromGit(repository);
    assert.deepEqual(changedPaths.sort(), deletedProtectedPaths.sort());
    for (const path of changedPaths) {
      assert.equal(requiresCanvasRelease([path]), true, path);
    }
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("first commits report every path added by the root commit", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-root-"));

  try {
    initializeRepository(repository);
    mkdirSync(join(repository, "artifacts/mockup-sandbox/src"), {
      recursive: true,
    });
    writeFileSync(
      join(repository, "artifacts/mockup-sandbox/src/App.tsx"),
      "export default function App() {}\n",
    );
    writeFileSync(join(repository, "README.md"), "root commit\n");
    commitAll(repository, "initial commit");

    assert.deepEqual(changedPathsFromGit(repository), [
      "README.md",
      "artifacts/mockup-sandbox/src/App.tsx",
    ]);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("renaming a protected file to an unprotected path still requires the gate", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-rename-out-"));
  const protectedPath = "artifacts/mockup-sandbox/src/Feature.tsx";
  const unprotectedPath = "artifacts/marketing-site/src/Feature.tsx";

  try {
    initializeRepository(repository);
    mkdirSync(dirname(join(repository, protectedPath)), { recursive: true });
    writeFileSync(join(repository, protectedPath), "export const Feature = true;\n");
    commitAll(repository, "add protected file");

    mkdirSync(dirname(join(repository, unprotectedPath)), { recursive: true });
    execFileSync("git", ["mv", protectedPath, unprotectedPath], {
      cwd: repository,
    });
    commitAll(repository, "move file out of protected path");

    const changedPaths = changedPathsFromGit(repository);
    assert.deepEqual(changedPaths, [unprotectedPath, protectedPath].sort());
    assert.equal(requiresCanvasRelease(changedPaths), true);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("renaming an unprotected file to a protected path still requires the gate", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-rename-in-"));
  const unprotectedPath = "artifacts/marketing-site/src/Feature.tsx";
  const protectedPath = "artifacts/mockup-sandbox/src/Feature.tsx";

  try {
    initializeRepository(repository);
    mkdirSync(dirname(join(repository, unprotectedPath)), { recursive: true });
    writeFileSync(
      join(repository, unprotectedPath),
      "export const Feature = true;\n",
    );
    commitAll(repository, "add unprotected file");

    mkdirSync(dirname(join(repository, protectedPath)), { recursive: true });
    execFileSync("git", ["mv", unprotectedPath, protectedPath], {
      cwd: repository,
    });
    commitAll(repository, "move file into protected path");

    const changedPaths = changedPathsFromGit(repository);
    assert.deepEqual(changedPaths, [protectedPath, unprotectedPath].sort());
    assert.equal(requiresCanvasRelease(changedPaths), true);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("merge commits include changes relative to every parent", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-merge-"));

  try {
    initializeRepository(repository);
    writeFileSync(join(repository, "README.md"), "base\n");
    commitAll(repository, "base");
    const mainBranch = execFileSync(
      "git",
      ["branch", "--show-current"],
      { cwd: repository, encoding: "utf8" },
    ).trim();

    execFileSync("git", ["checkout", "--quiet", "-b", "canvas-change"], {
      cwd: repository,
    });
    mkdirSync(join(repository, "artifacts/mockup-sandbox/src"), {
      recursive: true,
    });
    writeFileSync(
      join(repository, "artifacts/mockup-sandbox/src/Feature.tsx"),
      "export const Feature = true;\n",
    );
    commitAll(repository, "change canvas");

    execFileSync("git", ["checkout", "--quiet", mainBranch], {
      cwd: repository,
    });
    writeFileSync(join(repository, "docs.md"), "main branch change\n");
    commitAll(repository, "change docs");
    execFileSync(
      "git",
      ["merge", "--quiet", "--no-ff", "canvas-change", "-m", "merge canvas"],
      { cwd: repository },
    );

    assert.deepEqual(changedPathsFromGit(repository), [
      "artifacts/mockup-sandbox/src/Feature.tsx",
      "docs.md",
    ]);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
