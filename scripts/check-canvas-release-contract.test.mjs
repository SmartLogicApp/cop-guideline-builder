import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkCanvasReleaseContract } from "./check-canvas-release-contract.mjs";
import {
  parseEnvironmentChangedPaths,
  protectedCanvasPaths,
  requiresCanvasRelease,
} from "./validate-canvas-changes.mjs";

const [
  replitConfig,
  packageJsonText,
  changedPathGuardText,
  documentationText,
] = await Promise.all([
  readFile(new URL("../.replit", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("./validate-canvas-changes.mjs", import.meta.url), "utf8"),
  readFile(new URL("../docs/canvas-release-gate.md", import.meta.url), "utf8"),
]);

function failures({
  replit = replitConfig,
  command,
  guardedCommand,
  guard = changedPathGuardText,
  documentation = documentationText,
  executablePaths = protectedCanvasPaths,
  workflowConfigs = [{ path: ".replit", text: replit }],
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
  );
}

test("accepts the protected Canvas release configuration", () => {
  assert.deepEqual(failures(), []);
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
