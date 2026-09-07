import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  changedPathsFromGit,
  formatCanvasPathForDisplay,
  parseEnvironmentChangedPaths,
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

test("Git paths with whitespace, quotes, and newlines are parsed exactly", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-unusual-"));
  const unusualPaths = [
    "docs/ spaced name .md",
    'docs/"quoted".md',
    "docs/neighbor\npackage.json",
  ];

  try {
    initializeRepository(repository);

    for (const path of unusualPaths) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), "unrelated\n");
    }

    commitAll(repository, "add unusual paths");

    assert.deepEqual(changedPathsFromGit(repository), unusualPaths);
    assert.equal(
      requiresCanvasRelease(changedPathsFromGit(repository)),
      false,
      "a newline inside an unrelated path must not create a protected path",
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("unusual neighboring paths cannot hide a protected Canvas change", () => {
  const repository = mkdtempSync(join(tmpdir(), "canvas-release-protected-"));
  const changedFiles = [
    "artifacts/mockup-sandbox/src/file with spaces.tsx",
    'docs/"neighbor\nfile".md',
  ];

  try {
    initializeRepository(repository);

    for (const path of changedFiles) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), "changed\n");
    }

    commitAll(repository, "add protected and unusual paths");

    assert.deepEqual(changedPathsFromGit(repository), changedFiles);
    assert.equal(requiresCanvasRelease(changedPathsFromGit(repository)), true);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("ordinary protected paths remain easy to read in release logs", () => {
  assert.equal(
    formatCanvasPathForDisplay(
      "artifacts/mockup-sandbox/src/file with spaces.tsx",
    ),
    "artifacts/mockup-sandbox/src/file with spaces.tsx",
  );
});

test("quotes and control characters are escaped in displayed paths", () => {
  for (const [path, displayedPath] of [
    [
      'artifacts/mockup-sandbox/src/"quoted".tsx',
      '"artifacts/mockup-sandbox/src/\\"quoted\\".tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/line\nbreak.tsx",
      '"artifacts/mockup-sandbox/src/line\\nbreak.tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/tab\tand\u0001control.tsx",
      '"artifacts/mockup-sandbox/src/tab\\tand\\u0001control.tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/del\u007fcontrol.tsx",
      '"artifacts/mockup-sandbox/src/del\\u007fcontrol.tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/next-line\u0085control.tsx",
      '"artifacts/mockup-sandbox/src/next-line\\u0085control.tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/csi\u009bcontrol.tsx",
      '"artifacts/mockup-sandbox/src/csi\\u009bcontrol.tsx"',
    ],
    [
      "artifacts/mockup-sandbox/src/line\u2028separator.tsx",
      '"artifacts/mockup-sandbox/src/line\\u2028separator.tsx"',
    ],
  ]) {
    assert.equal(formatCanvasPathForDisplay(path), displayedPath);
    assert.equal(
      displayedPath.split(/\r?\n/u).length,
      1,
      "displayed paths must stay on one log line",
    );
    assert.doesNotMatch(
      displayedPath,
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u,
      "displayed paths must not contain raw control characters",
    );
  }
});

test("JSON override preserves unusual Git paths exactly", () => {
  const paths = [
    "docs/file with spaces.md",
    'docs/"quoted".md',
    "docs/embedded\nnewline.md",
    "docs/tab\tand\u0001control.md",
    "docs/del\u007fcontrol.md",
  ];

  assert.deepEqual(
    parseEnvironmentChangedPaths(`  ${JSON.stringify(paths)}`),
    paths,
  );
});

test("ordinary single-path newline override remains compatible", () => {
  assert.deepEqual(
    parseEnvironmentChangedPaths(
      "  artifacts/mockup-sandbox/src/App.tsx  \n",
    ),
    ["artifacts/mockup-sandbox/src/App.tsx"],
  );
});

test("ambiguous multiline override gives JSON migration guidance", () => {
  assert.throws(
    () => parseEnvironmentChangedPaths("README.md\npackage.json"),
    /Multiline CANVAS_RELEASE_CHANGED_PATHS is ambiguous.*Use a JSON array/s,
  );
});

test("invalid JSON override fails clearly", () => {
  assert.throws(
    () => parseEnvironmentChangedPaths('["README.md",]'),
    /must be a valid JSON array of path strings/,
  );
  assert.throws(
    () => parseEnvironmentChangedPaths('["README.md",42]'),
    /must be a JSON array of Git path strings without NUL bytes/,
  );
  assert.throws(
    () => parseEnvironmentChangedPaths('["bad\\u0000path"]'),
    /must be a JSON array of Git path strings without NUL bytes/,
  );
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

test("merge commits expose both paths when a protected file is renamed out", () => {
  const repository = mkdtempSync(
    join(tmpdir(), "canvas-release-merge-rename-"),
  );
  const protectedPath = "artifacts/mockup-sandbox/src/Feature.tsx";
  const unprotectedPath = "artifacts/marketing-site/src/Feature.tsx";

  try {
    initializeRepository(repository);
    mkdirSync(dirname(join(repository, protectedPath)), { recursive: true });
    writeFileSync(join(repository, protectedPath), "export const Feature = true;\n");
    commitAll(repository, "add protected file");
    const mainBranch = execFileSync(
      "git",
      ["branch", "--show-current"],
      { cwd: repository, encoding: "utf8" },
    ).trim();

    execFileSync("git", ["checkout", "--quiet", "-b", "rename-canvas"], {
      cwd: repository,
    });
    mkdirSync(dirname(join(repository, unprotectedPath)), { recursive: true });
    execFileSync("git", ["mv", protectedPath, unprotectedPath], {
      cwd: repository,
    });
    commitAll(repository, "move file out of protected path");

    execFileSync("git", ["checkout", "--quiet", mainBranch], {
      cwd: repository,
    });
    writeFileSync(join(repository, "docs.md"), "main branch change\n");
    commitAll(repository, "change docs");
    execFileSync(
      "git",
      ["merge", "--quiet", "--no-ff", "rename-canvas", "-m", "merge rename"],
      { cwd: repository },
    );

    const changedPaths = changedPathsFromGit(repository);
    assert.deepEqual(
      changedPaths,
      [protectedPath, unprotectedPath, "docs.md"].sort(),
    );
    assert.equal(requiresCanvasRelease(changedPaths), true);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
