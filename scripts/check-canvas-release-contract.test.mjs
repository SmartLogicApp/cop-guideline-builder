import assert from "node:assert/strict";
import {
  link,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkCanvasReleaseContract,
  readCheckedInWorkflowConfigs,
  supportedWorkflowLocations,
  workflowFileIdentity,
} from "./check-canvas-release-contract.mjs";
import {
  parseEnvironmentChangedPaths,
  protectedCanvasPaths,
  requiresCanvasRelease,
} from "./validate-canvas-changes.mjs";

const [replitConfig, packageJsonText, changedPathGuardText, documentationText] =
  await Promise.all([
    readFile(new URL("../.replit", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("./validate-canvas-changes.mjs", import.meta.url), "utf8"),
    readFile(
      new URL("../docs/canvas-release-gate.md", import.meta.url),
      "utf8",
    ),
  ]);

function failures({
  replit = replitConfig,
  command,
  guardedCommand,
  guard = changedPathGuardText,
  documentation = documentationText,
  executablePaths = protectedCanvasPaths,
  workflowConfigs = [{ path: ".replit", text: replit }],
  workflowLocations = supportedWorkflowLocations,
} = {}) {
  const packageJson = JSON.parse(packageJsonText);
  if (command !== undefined) {
    packageJson.scripts["validate:canvas"] = command;
  }
  if (guardedCommand !== undefined) {
    packageJson.scripts["validate:canvas:changed"] = guardedCommand;
  }
  return checkCanvasReleaseContract(
    replit,
    JSON.stringify(packageJson),
    guard,
    documentation,
    executablePaths,
    workflowConfigs,
    workflowLocations,
  );
}

test("accepts the protected Canvas release configuration", () => {
  assert.deepEqual(failures(), []);
});

test("rejects duplicate supported workflow paths and identifies the conflict", () => {
  const duplicatePath = ".github/workflows";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: duplicatePath,
      fixturePath: ".github/workflows/another-canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `duplicate supported workflow path entries "${duplicatePath}" and "${duplicatePath}" normalize to "${duplicatePath}"`,
    ),
  );
});

test("rejects trailing-slash workflow path aliases and names both declarations", () => {
  const originalPath = ".github/workflows";
  const aliasPath = ".github/workflows/";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: aliasPath,
      fixturePath: ".github/workflows/another-canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `duplicate supported workflow path entries "${originalPath}" and "${aliasPath}" normalize to "${originalPath}"`,
    ),
  );
});

test("rejects dot-segment workflow path aliases and names both declarations", () => {
  const originalPath = ".circleci";
  const aliasPath = "./.circleci";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: aliasPath,
      fixturePath: "./.circleci/another-config.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `duplicate supported workflow path entries "\\.circleci" and "\\./\\.circleci" normalize to "\\.circleci"`,
    ),
  );
});

test("rejects a unique leading-dot workflow path and shows its canonical replacement", () => {
  const declaredPath = "./.woodpecker";
  const canonicalPath = ".woodpecker";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: declaredPath,
      fixturePath: ".woodpecker/canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "path" uses non-canonical workflow path "\\./\\.woodpecker"; use "\\.woodpecker" instead`,
    ),
  );
});

test("rejects a unique backslash workflow path and shows its canonical replacement", () => {
  const declaredPath = ".woodpecker\\pipelines";
  const canonicalPath = ".woodpecker/pipelines";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: declaredPath,
      fixturePath: ".woodpecker/pipelines/canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "path" uses non-canonical workflow path "\\.woodpecker\\\\\\\\pipelines"; use "\\.woodpecker/pipelines" instead`,
    ),
  );
});

test("rejects a unique backslash fixture path and shows its canonical replacement", () => {
  const declaredFixturePath = ".teamcity\\pipelines\\canvas.yml";
  const canonicalFixturePath = ".teamcity/pipelines/canvas.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: ".teamcity",
      fixturePath: declaredFixturePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "fixturePath" uses non-canonical workflow path "\\.teamcity\\\\\\\\pipelines\\\\\\\\canvas\\.yml"; use "\\.teamcity/pipelines/canvas\\.yml" instead`,
    ),
  );
});

test("rejects a unique repeated-separator workflow path and shows its canonical replacement", () => {
  const declaredPath = ".woodpecker//pipelines";
  const canonicalPath = ".woodpecker/pipelines";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: declaredPath,
      fixturePath: ".woodpecker/pipelines/canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "path" uses non-canonical workflow path "\\.woodpecker//pipelines"; use "\\.woodpecker/pipelines" instead`,
    ),
  );
});

test("rejects a unique repeated-separator fixture path and shows its canonical replacement", () => {
  const declaredFixturePath = ".teamcity//pipelines/canvas.yml";
  const canonicalFixturePath = ".teamcity/pipelines/canvas.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: ".teamcity",
      fixturePath: declaredFixturePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "fixturePath" uses non-canonical workflow path "\\.teamcity//pipelines/canvas\\.yml"; use "\\.teamcity/pipelines/canvas\\.yml" instead`,
    ),
  );
});

test("rejects a unique trailing-slash fixture path and shows its canonical replacement", () => {
  const declaredFixturePath = ".teamcity/canvas.yml/";
  const canonicalFixturePath = ".teamcity/canvas.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: ".teamcity",
      fixturePath: declaredFixturePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "fixturePath" uses non-canonical workflow path "\\.teamcity/canvas\\.yml/"; use "\\.teamcity/canvas\\.yml" instead`,
    ),
  );
});

test("rejects a unique embedded-dot fixture path and shows its canonical replacement", () => {
  const declaredFixturePath = ".teamcity/./pipelines/canvas.yml";
  const canonicalFixturePath = ".teamcity/pipelines/canvas.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: ".teamcity",
      fixturePath: declaredFixturePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `supported workflow location entry 8 field "fixturePath" uses non-canonical workflow path "\\.teamcity/\\./pipelines/canvas\\.yml"; use "\\.teamcity/pipelines/canvas\\.yml" instead`,
    ),
  );
});

test("rejects duplicate representative fixture paths and identifies the conflict", () => {
  const duplicateFixturePath = ".circleci/nested/config.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: ".teamcity",
      fixturePath: duplicateFixturePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `duplicate supported workflow fixturePath entries "${duplicateFixturePath}" and "${duplicateFixturePath}" normalize to "${duplicateFixturePath}"`,
    ),
  );
});

test("rejects nested workflow directories and identifies both conflicting locations", () => {
  const parentPath = ".github";
  const nestedPath = ".github/workflows";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "directory",
      path: parentPath,
      fixturePath: ".github/actions/canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `overlapping supported workflow locations: directory "${nestedPath}" is already covered by directory "${parentPath}"`,
    ),
  );
});

test("rejects workflow files covered by a declared directory and identifies both locations", () => {
  const directoryPath = ".github/workflows";
  const filePath = ".github/workflows/canvas.yml";
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "file",
      path: filePath,
      fixturePath: filePath,
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    new RegExp(
      `overlapping supported workflow locations: file "${filePath}" is already covered by directory "${directoryPath}"`,
    ),
  );
});

test("rejects unsupported workflow location types and identifies the entry and field", () => {
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "glob",
      path: ".woodpecker",
      fixturePath: ".woodpecker/canvas.yml",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    /supported workflow location entry 8 field "type" must be "file" or "directory"; received "glob"/,
  );
});

test("rejects file fixtures that do not equal their discovery path", () => {
  const locations = [
    ...supportedWorkflowLocations,
    {
      type: "file",
      path: "Jenkinsfile.release",
      fixturePath: "ci/Jenkinsfile.release",
    },
  ];

  assert.match(
    failures({ workflowLocations: locations }).join("\n"),
    /supported workflow location entry 8 has conflicting fields: file fixturePath "ci\/Jenkinsfile\.release" must equal path "Jenkinsfile\.release"/,
  );
});

test("rejects directory fixtures that are not nested under their discovery path", () => {
  const mismatchedLocations = [
    {
      type: "directory",
      path: ".woodpecker",
      fixturePath: ".woodpecker-ci/canvas.yml",
    },
    {
      type: "directory",
      path: ".woodpecker",
      fixturePath: ".woodpecker/../outside/canvas.yml",
    },
  ];

  for (const location of mismatchedLocations) {
    assert.match(
      failures({
        workflowLocations: [...supportedWorkflowLocations, location],
      }).join("\n"),
      /supported workflow location entry 8 has conflicting fields: directory fixturePath .* must be nested under path "\.woodpecker"/,
    );
  }
});

test("rejects missing and empty workflow location paths with clear entry and field names", () => {
  const malformedLocations = [
    { type: "file", fixturePath: "missing-path.yml" },
    { type: "file", path: "empty-fixture.yml", fixturePath: "" },
    { type: "directory", path: "   ", fixturePath: "blank-path/config.yml" },
    { type: "directory", path: "missing-fixture", fixturePath: undefined },
  ];

  const result = failures({ workflowLocations: malformedLocations }).join("\n");

  assert.match(
    result,
    /supported workflow location entry 1 field "path" must be a non-empty string; received undefined/,
  );
  assert.match(
    result,
    /supported workflow location entry 2 field "fixturePath" must be a non-empty string; received ""/,
  );
  assert.match(
    result,
    /supported workflow location entry 3 field "path" must be a non-empty string; received "   "/,
  );
  assert.match(
    result,
    /supported workflow location entry 4 field "fixturePath" must be a non-empty string; received undefined/,
  );
});

test("rejects absolute workflow paths and identifies the malformed entry and field", () => {
  const locations = [
    { type: "file", path: "/etc/workflow.yml", fixturePath: "/etc/workflow.yml" },
    {
      type: "directory",
      path: ".github/workflows",
      fixturePath: "C:\\workflows\\canvas.yml",
    },
  ];

  const result = failures({ workflowLocations: locations }).join("\n");

  assert.match(
    result,
    /supported workflow location entry 1 field "path" must be relative to the repository; received "\/etc\/workflow\.yml"/,
  );
  assert.match(
    result,
    /supported workflow location entry 1 field "fixturePath" must be relative to the repository; received "\/etc\/workflow\.yml"/,
  );
  assert.match(
    result,
    /supported workflow location entry 2 field "fixturePath" must be relative to the repository; received "C:\\\\workflows\\\\canvas\.yml"/,
  );
});

test("rejects parent traversal that escapes the repository and identifies the field", () => {
  const locations = [
    {
      type: "directory",
      path: "ci/../../outside",
      fixturePath: "ci/workflow.yml",
    },
    {
      type: "directory",
      path: ".github/workflows",
      fixturePath: ".github\\workflows\\..\\..\\..\\outside.yml",
    },
    {
      type: "directory",
      path: "C:..\\..\\outside",
      fixturePath: "C:../../outside/workflow.yml",
    },
  ];

  const result = failures({ workflowLocations: locations }).join("\n");

  assert.match(
    result,
    /supported workflow location entry 1 field "path" must not escape the repository with parent traversal; received "ci\/\.\.\/\.\.\/outside"/,
  );
  assert.match(
    result,
    /supported workflow location entry 2 field "fixturePath" must not escape the repository with parent traversal; received "\.github\\\\workflows\\\\\.\.\\\\\.\.\\\\\.\.\\\\outside\.yml"/,
  );
  assert.match(
    result,
    /supported workflow location entry 3 field "path" must be relative to the repository; received "C:\.\.\\\\\.\.\\\\outside"/,
  );
  assert.match(
    result,
    /supported workflow location entry 3 field "fixturePath" must be relative to the repository; received "C:\.\.\/\.\.\/outside\/workflow\.yml"/,
  );
});

test("accepts workflow producers that assign JSON arrays of paths", () => {
  const workflowConfigs = [
    {
      path: ".gitlab-ci.yml",
      text: 'CANVAS_RELEASE_CHANGED_PATHS=["README.md","path with spaces"]',
    },
  ];
  assert.deepEqual(failures({ workflowConfigs }), []);
});

test("discovers and rejects unsafe Buildkite changed-path producers", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  await mkdir(join(rootDirectory, ".buildkite"), { recursive: true });
  await writeFile(
    join(rootDirectory, ".buildkite", "pipeline.yml"),
    [
      "steps:",
      '  - command: "pnpm run validate:canvas:changed"',
      "    env:",
      '      CANVAS_RELEASE_CHANGED_PATHS: "$BUILDKITE_CHANGED_FILES"',
    ].join("\n"),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);
  const result = failures({ workflowConfigs }).join("\n");

  assert.match(result, /\.buildkite\/pipeline\.yml:4/);
  assert.match(result, /must be a provable JSON array of path strings/);
});

test("discovers and accepts safe Buildkite JSON-array producers", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  await mkdir(join(rootDirectory, ".buildkite", "pipelines"), {
    recursive: true,
  });
  await writeFile(
    join(rootDirectory, ".buildkite", "pipelines", "canvas.yml"),
    [
      "steps:",
      '  - command: "pnpm run validate:canvas:changed"',
      "    env:",
      '      CANVAS_RELEASE_CHANGED_PATHS: \'["README.md","path with spaces"]\'',
    ].join("\n"),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(
    workflowConfigs.map(({ path }) => path),
    [".buildkite/pipelines/canvas.yml"],
  );
  assert.deepEqual(failures({ workflowConfigs }), []);
});

test("rejects workflow symlinks that resolve outside the repository and identifies the location", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  const externalDirectory = await mkdtemp(
    join(tmpdir(), "canvas-contract-external-"),
  );
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  t.after(() => rm(externalDirectory, { recursive: true, force: true }));

  const externalWorkflow = join(externalDirectory, "canvas.yml");
  await writeFile(externalWorkflow, "CANVAS_RELEASE_CHANGED_PATHS: unsafe");
  await symlink(externalWorkflow, join(rootDirectory, ".gitlab-ci.yml"));

  await assert.rejects(
    readCheckedInWorkflowConfigs(rootDirectory),
    /supported workflow location "\.gitlab-ci\.yml" resolves outside the repository/,
  );
});

test("accepts workflow symlinks that resolve inside the repository", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, "ci"), { recursive: true });
  await writeFile(
    join(rootDirectory, "ci", "canvas.yml"),
    'CANVAS_RELEASE_CHANGED_PATHS=["README.md"]',
  );
  await symlink("ci/canvas.yml", join(rootDirectory, ".gitlab-ci.yml"));

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".gitlab-ci.yml",
      text: 'CANVAS_RELEASE_CHANGED_PATHS=["README.md"]',
    },
  ]);
  assert.deepEqual(failures({ workflowConfigs }), []);
});

test("scans converging file aliases once and keeps the first checked-in location for diagnostics", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, "ci"), { recursive: true });
  await writeFile(
    join(rootDirectory, "ci", "canvas.yml"),
    "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
  );
  await symlink("ci/canvas.yml", join(rootDirectory, ".gitlab-ci.yml"));
  await symlink("ci/canvas.yml", join(rootDirectory, "bitbucket-pipelines.yml"));

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".gitlab-ci.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  const result = failures({ workflowConfigs }).join("\n");
  assert.match(result, /\.gitlab-ci\.yml:1/);
  assert.doesNotMatch(result, /bitbucket-pipelines\.yml/);
});

test("scans hard-linked workflows across supported locations once and keeps the first checked-in location for diagnostics", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, ".github", "workflows"), { recursive: true });
  await mkdir(join(rootDirectory, ".circleci"), { recursive: true });
  const firstPath = join(rootDirectory, ".gitlab-ci.yml");
  await writeFile(firstPath, "CANVAS_RELEASE_CHANGED_PATHS: unsafe");
  await link(
    firstPath,
    join(rootDirectory, ".github", "workflows", "canvas.yml"),
  );
  await link(firstPath, join(rootDirectory, ".circleci", "config.yml"));

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".gitlab-ci.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  const result = failures({ workflowConfigs }).join("\n");
  assert.match(result, /\.gitlab-ci\.yml:1/);
  assert.doesNotMatch(result, /\.github\/workflows\/canvas\.yml/);
  assert.doesNotMatch(result, /\.circleci\/config\.yml/);
});

test("requires the runtime to expose stable bigint device and inode identities", () => {
  assert.equal(
    workflowFileIdentity({ dev: 12n, ino: 34n }, ".gitlab-ci.yml"),
    "12:34",
  );

  for (const file of [
    { dev: 12, ino: 34 },
    { dev: 12n, ino: 34 },
    { dev: -1n, ino: 34n },
    { dev: 12n, ino: 0n },
  ]) {
    assert.throws(
      () => workflowFileIdentity(file, ".gitlab-ci.yml"),
      /cannot determine stable file identity for "\.gitlab-ci\.yml".*non-negative bigint stat\.dev and positive bigint stat\.ino/,
    );
  }
});

test("deduplicates mixed symlink and hard-link aliases in deterministic supported-location order", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, "ci"), { recursive: true });
  await mkdir(join(rootDirectory, ".github", "workflows"), { recursive: true });
  const sourcePath = join(rootDirectory, "ci", "canvas.yml");
  await writeFile(sourcePath, "CANVAS_RELEASE_CHANGED_PATHS: unsafe");
  await symlink("ci/canvas.yml", join(rootDirectory, ".gitlab-ci.yml"));
  await link(
    sourcePath,
    join(rootDirectory, ".github", "workflows", "canvas.yml"),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".gitlab-ci.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  const result = failures({ workflowConfigs }).join("\n");
  assert.match(result, /\.gitlab-ci\.yml:1/);
  assert.doesNotMatch(result, /\.github\/workflows\/canvas\.yml/);
});

test("scans converging directory aliases once and keeps the first sorted checked-in location for diagnostics", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, ".github", "workflows"), { recursive: true });
  await mkdir(join(rootDirectory, "ci", "shared"), { recursive: true });
  await writeFile(
    join(rootDirectory, "ci", "shared", "canvas.yml"),
    "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
  );
  await symlink(
    "../../ci/shared",
    join(rootDirectory, ".github", "workflows", "z-alias"),
  );
  await symlink(
    "../../ci/shared",
    join(rootDirectory, ".github", "workflows", "a-alias"),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".github/workflows/a-alias/canvas.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  const result = failures({ workflowConfigs }).join("\n");
  assert.match(result, /\.github\/workflows\/a-alias\/canvas\.yml:1/);
  assert.doesNotMatch(result, /\.github\/workflows\/z-alias\/canvas\.yml/);
});

test("walks shared workflow directory trees once across top-level aliases and keeps the first checked-in alias for nested diagnostics", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, "ci", "shared", "nested"), {
    recursive: true,
  });
  await writeFile(
    join(rootDirectory, "ci", "shared", "nested", "canvas.yml"),
    "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
  );
  await symlink("ci/shared", join(rootDirectory, ".circleci"));
  await mkdir(join(rootDirectory, ".github"), { recursive: true });
  await symlink("../ci/shared", join(rootDirectory, ".github", "workflows"));

  const directoryReads = new Map();
  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory, {
    readDirectory: async (directory, options) => {
      directoryReads.set(directory, (directoryReads.get(directory) ?? 0) + 1);
      return readdir(directory, options);
    },
  });

  assert.deepEqual(workflowConfigs, [
    {
      path: ".github/workflows/nested/canvas.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  assert.deepEqual([...directoryReads.values()], [1, 1]);
  const result = failures({ workflowConfigs }).join("\n");
  assert.match(result, /\.github\/workflows\/nested\/canvas\.yml:1/);
  assert.doesNotMatch(result, /\.circleci\/nested\/canvas\.yml/);
});

test("discovers nested workflow symlinks that resolve inside the repository", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, ".github", "workflows", "nested"), {
    recursive: true,
  });
  await mkdir(join(rootDirectory, "ci"), { recursive: true });
  await writeFile(
    join(rootDirectory, "ci", "canvas.yml"),
    "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
  );
  await symlink(
    "../../../ci/canvas.yml",
    join(rootDirectory, ".github", "workflows", "nested", "canvas.yml"),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);

  assert.deepEqual(workflowConfigs, [
    {
      path: ".github/workflows/nested/canvas.yml",
      text: "CANVAS_RELEASE_CHANGED_PATHS: unsafe",
    },
  ]);
  assert.match(
    failures({ workflowConfigs }).join("\n"),
    /\.github\/workflows\/nested\/canvas\.yml:1/,
  );
});

test("rejects nested workflow symlinks that resolve outside the repository without reading them", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  const externalDirectory = await mkdtemp(
    join(tmpdir(), "canvas-contract-external-"),
  );
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  t.after(() => rm(externalDirectory, { recursive: true, force: true }));

  await mkdir(join(rootDirectory, ".buildkite", "nested"), {
    recursive: true,
  });
  const externalWorkflow = join(externalDirectory, "canvas.yml");
  await writeFile(externalWorkflow, "CANVAS_RELEASE_CHANGED_PATHS: unsafe");
  await symlink(
    externalWorkflow,
    join(rootDirectory, ".buildkite", "nested", "canvas.yml"),
  );

  await assert.rejects(
    readCheckedInWorkflowConfigs(rootDirectory),
    /supported workflow location "\.buildkite\/nested\/canvas\.yml" resolves outside the repository/,
  );
});

test("discovers unsafe producers in every supported workflow location only", async (t) => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "canvas-contract-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));

  const supportedLocations = supportedWorkflowLocations.map(
    ({ fixturePath }) => fixturePath,
  );
  const excludedLocations = [
    "src/workflow.js",
    "docs/workflow.md",
    ".github/canvas.yml",
    "circleci/config.yml",
    "buildkite/pipeline.yml",
  ];
  const allLocations = [...supportedLocations, ...excludedLocations];

  await Promise.all(
    allLocations.map(async (path) => {
      await mkdir(join(rootDirectory, ...path.split("/").slice(0, -1)), {
        recursive: true,
      });
      await writeFile(
        join(rootDirectory, path),
        `CANVAS_RELEASE_CHANGED_PATHS: unsafe-${path}`,
      );
    }),
  );

  const workflowConfigs = await readCheckedInWorkflowConfigs(rootDirectory);
  const discoveredPaths = workflowConfigs.map(({ path }) => path).sort();
  const result = failures({ workflowConfigs }).join("\n");

  assert.deepEqual(discoveredPaths, supportedLocations.toSorted());
  for (const path of supportedLocations) {
    assert.match(
      result,
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:1`),
    );
  }
  for (const path of excludedLocations) {
    assert.doesNotMatch(
      result,
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(result, /must be a provable JSON array of path strings/);
});

test("rejects newline-delimited workflow producers with actionable guidance", () => {
  const result = failures({
    workflowConfigs: [
      {
        path: ".github/workflows/canvas.yml",
        text: [
          "env:",
          "  CANVAS_RELEASE_CHANGED_PATHS: ${{ steps.changed.outputs.all_changed_files }}",
        ].join("\n"),
      },
    ],
  }).join("\n");

  assert.match(result, /\.github\/workflows\/canvas\.yml:2/);
  assert.match(result, /must be a provable JSON array of path strings/);
  assert.match(result, /do not use newline-delimited paths/);
  assert.match(result, /Assign a JSON array literal/);
});

test("rejects serializer names in comments or unrelated assignment fragments", () => {
  for (const marker of ["JSON.stringify(", "toJSON(", "jq --slurp"]) {
    const result = failures({
      workflowConfigs: [
        {
          path: ".github/workflows/canvas.yml",
          text: `CANVAS_RELEASE_CHANGED_PATHS="$(git diff --name-only)" # ${marker}`,
        },
      ],
    }).join("\n");

    assert.match(result, /must be a provable JSON array of path strings/);
  }
});

test("rejects dynamic serializers whose output type cannot be proven", () => {
  const unsafeValues = [
    "$(node -e 'console.log(JSON.stringify(paths.join(\"\\\\n\")))')",
    "$(printf '%s' \"$paths\" | jq --slurp --raw-input '.')",
    "${{ toJSON(steps.changed.outputs.all_changed_files) }}",
  ];

  for (const value of unsafeValues) {
    const result = failures({
      workflowConfigs: [
        {
          path: ".github/workflows/canvas.yml",
          text: `CANVAS_RELEASE_CHANGED_PATHS: ${value}`,
        },
      ],
    }).join("\n");

    assert.match(result, /unverified dynamic serializer/);
  }
});

test("rejects empty shell and YAML override assignments", () => {
  const emptyAssignments = [
    "export CANVAS_RELEASE_CHANGED_PATHS=",
    "CANVAS_RELEASE_CHANGED_PATHS:",
  ];

  for (const text of emptyAssignments) {
    const result = failures({
      workflowConfigs: [
        {
          path: ".github/workflows/canvas.yml",
          text,
        },
      ],
    }).join("\n");

    assert.match(result, /must be a provable JSON array of path strings/);
  }
});

test("rejects indirect shell producers that can hide a scalar path", () => {
  const scalar = '"artifacts/mockup-sandbox/src/App.tsx"';
  assert.equal(
    requiresCanvasRelease(parseEnvironmentChangedPaths(scalar)),
    false,
    "the scalar value demonstrates why an indirect producer can skip Canvas validation",
  );

  const result = failures({
    workflowConfigs: [
      {
        path: ".github/workflows/canvas.yml",
        text: [
          "read -r CANVAS_RELEASE_CHANGED_PATHS <<'EOF'",
          scalar,
          "EOF",
          "export CANVAS_RELEASE_CHANGED_PATHS",
        ].join("\n"),
      },
    ],
  }).join("\n");

  assert.match(result, /\.github\/workflows\/canvas\.yml:1/);
  assert.match(result, /\.github\/workflows\/canvas\.yml:4/);
  assert.match(result, /must be a provable JSON array of path strings/);
});

test("rejects drift between documented and executable protected paths", () => {
  const documentedDrift = documentationText.replace(
    "artifacts/mockup-sandbox/",
    "artifacts/mockup-sandbox",
  );
  assert.match(
    failures({ documentation: documentedDrift }).join("\n"),
    /documented protected paths do not match/,
  );

  assert.match(
    failures({
      executablePaths: [...protectedCanvasPaths, "docs/canvas-release-gate.md"],
    }).join("\n"),
    /documented protected paths do not match/,
  );
});

test("rejects a missing documented protected-path contract block", () => {
  assert.match(
    failures({
      documentation: documentationText.replace(
        "canvas-protected-paths:start",
        "canvas-protected-paths:disabled",
      ),
    }).join("\n"),
    /missing its protected-path contract block/,
  );
});

test("rejects Canvas workflow registration changes", () => {
  const changed = replitConfig.replace(
    'name = "canvas-release"',
    'name = "canvas-release-disabled"',
  );
  assert.match(
    failures({ replit: changed }).join("\n"),
    /workflow registration/,
  );
});

test("rejects removing frozen install, typecheck, or production build", () => {
  const command = JSON.parse(packageJsonText).scripts["validate:canvas"];
  const mutations = [
    ["pnpm install --frozen-lockfile && ", /frozen-lockfile install/],
    [
      "pnpm --filter @workspace/mockup-sandbox run typecheck && ",
      /Canvas typecheck/,
    ],
    [
      "NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build",
      /Canvas production build/,
    ],
  ];

  for (const [removed, message] of mutations) {
    assert.match(
      failures({ command: command.replace(removed, "") }).join("\n"),
      message,
    );
  }
});

test("rejects altered workflow args and swallowed failures", () => {
  const alteredWorkflow = replitConfig.replace(
    'args = "pnpm run validate:canvas:changed"',
    'args = "pnpm run build"',
  );
  assert.match(
    failures({ replit: alteredWorkflow }).join("\n"),
    /does not run "pnpm run validate:canvas:changed"/,
  );

  const removedCheckerInvocation = replitConfig.replace(
    'args = "pnpm run test:canvas-release-contract"',
    'args = "pnpm run check:canvas-release-contract-disabled"',
  );
  assert.match(
    failures({ replit: removedCheckerInvocation }).join("\n"),
    /independent "canvas-release-contract" validation/,
  );

  const command = JSON.parse(packageJsonText).scripts["validate:canvas"];
  for (const changed of [command.replace(" && ", "; "), `${command} || true`]) {
    assert.match(
      failures({ command: changed }).join("\n"),
      /canonical ordered && command/,
    );
  }

  assert.match(
    failures({ guardedCommand: "node scripts/disabled-guard.mjs" }).join("\n"),
    /does not run the path guard/,
  );
  assert.match(
    failures({
      guard: changedPathGuardText.replace(
        "process.exitCode = result.status ?? 1",
        "process.exitCode = 0",
      ),
    }).join("\n"),
    /propagate failures/,
  );
});
