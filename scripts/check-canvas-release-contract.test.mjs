import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkCanvasReleaseContract,
  readCheckedInWorkflowConfigs,
  supportedWorkflowLocations,
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
    new RegExp(`duplicate supported workflow path entry "${duplicatePath}"`),
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
      `duplicate supported workflow fixturePath entry "${duplicateFixturePath}"`,
    ),
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
