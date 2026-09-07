import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { protectedCanvasPaths } from "./validate-canvas-changes.mjs";

const expectedCommand =
  "pnpm install --frozen-lockfile && pnpm --filter @workspace/mockup-sandbox run typecheck && PORT=4173 BASE_PATH=/__mockup NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build";

function workflow(config, name) {
  return config
    .split(/(?=\[\[workflows\.workflow\]\])/)
    .find((section) =>
      new RegExp(`^name\\s*=\\s*\"${name}\"\\s*$`, "m").test(section),
    );
}

const protectedPathsBlock =
  /<!-- canvas-protected-paths:start -->\s*```text\s*\n([\s\S]*?)\n```\s*<!-- canvas-protected-paths:end -->/;

const changedPathsVariable = "CANVAS_RELEASE_CHANGED_PATHS";
export const supportedWorkflowLocations = [
  { type: "file", path: ".replit", fixturePath: ".replit" },
  {
    type: "file",
    path: ".gitlab-ci.yml",
    fixturePath: ".gitlab-ci.yml",
  },
  {
    type: "file",
    path: "bitbucket-pipelines.yml",
    fixturePath: "bitbucket-pipelines.yml",
  },
  { type: "file", path: "Jenkinsfile", fixturePath: "Jenkinsfile" },
  {
    type: "directory",
    path: ".github/workflows",
    fixturePath: ".github/workflows/nested/canvas.yml",
  },
  {
    type: "directory",
    path: ".circleci",
    fixturePath: ".circleci/nested/config.yml",
  },
  {
    type: "directory",
    path: ".buildkite",
    fixturePath: ".buildkite/nested/pipeline.yml",
  },
];

export function workflowLocationShapeFailures(
  locations = supportedWorkflowLocations,
) {
  const failures = [];
  for (const [index, location] of locations.entries()) {
    const entry = `supported workflow location entry ${index + 1}`;
    if (!location || typeof location !== "object" || Array.isArray(location)) {
      failures.push(`${entry} must be an object`);
      continue;
    }

    if (location.type !== "file" && location.type !== "directory") {
      failures.push(
        `${entry} field "type" must be "file" or "directory"; received ${JSON.stringify(location.type)}`,
      );
    }
    for (const field of ["path", "fixturePath"]) {
      if (typeof location[field] !== "string" || location[field].trim() === "") {
        failures.push(
          `${entry} field "${field}" must be a non-empty string; received ${JSON.stringify(location[field])}`,
        );
      }
    }
  }
  return failures;
}

export function duplicateWorkflowLocationFailures(
  locations = supportedWorkflowLocations,
) {
  const failures = [];
  for (const key of ["path", "fixturePath"]) {
    const seen = new Set();
    for (const location of locations) {
      const value = location?.[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      if (seen.has(value)) {
        failures.push(
          `duplicate supported workflow ${key} entry "${value}"`,
        );
      } else {
        seen.add(value);
      }
    }
  }
  return failures;
}

function isJsonArrayProducer(line) {
  const assignment = line.match(
    /CANVAS_RELEASE_CHANGED_PATHS\s*(?::|=)\s*(.*)$/,
  );
  if (!assignment) {
    return false;
  }

  let value = assignment[1].trim().replace(/[;,]\s*$/, "");
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.every((path) => typeof path === "string");
    } catch {
      return false;
    }
  }

  return false;
}

export function unsafeChangedPathProducers(workflowConfigs) {
  const unsafe = [];
  for (const { path, text } of workflowConfigs) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const trimmedLine = line.trimStart();
      if (
        line.includes(changedPathsVariable) &&
        !trimmedLine.startsWith("#") &&
        !trimmedLine.startsWith("//") &&
        !isJsonArrayProducer(line)
      ) {
        unsafe.push(`${path}:${index + 1}`);
      }
    }
  }
  return unsafe;
}

async function filesBelow(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function readCheckedInWorkflowConfigs(rootDirectory) {
  const candidates = [];
  for (const location of supportedWorkflowLocations) {
    const absolutePath = resolve(rootDirectory, location.path);
    if (location.type === "file") {
      candidates.push(absolutePath);
    } else {
      candidates.push(...(await filesBelow(absolutePath)));
    }
  }

  const configs = [];
  for (const path of candidates) {
    try {
      configs.push({
        path: relative(rootDirectory, path),
        text: await readFile(path, "utf8"),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return configs;
}

export function documentedProtectedCanvasPaths(documentationText) {
  const match = documentationText.match(protectedPathsBlock);
  if (!match) {
    return null;
  }

  return match[1]
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

export function checkCanvasReleaseContract(
  replitConfig,
  packageJsonText,
  changedPathGuardText,
  documentationText,
  executableProtectedPaths = protectedCanvasPaths,
  workflowConfigs = [],
  workflowLocations = supportedWorkflowLocations,
) {
  const failures = [
    ...workflowLocationShapeFailures(workflowLocations),
    ...duplicateWorkflowLocationFailures(workflowLocations),
  ];
  const unsafeProducers = unsafeChangedPathProducers(workflowConfigs);
  if (unsafeProducers.length > 0) {
    failures.push(
      `${changedPathsVariable} producer(s) at ${unsafeProducers.join(
        ", ",
      )} must be a provable JSON array of path strings; do not use newline-delimited paths or an unverified dynamic serializer. Assign a JSON array literal, or extend this contract with a tested array-producing form.`,
    );
  }
  const canvasWorkflow = workflow(replitConfig, "canvas-release");

  if (!canvasWorkflow) {
    failures.push(
      'missing the "canvas-release" workflow registration in .replit',
    );
  } else {
    if (!/^isValidation\s*=\s*true\s*$/m.test(canvasWorkflow)) {
      failures.push(
        'the "canvas-release" workflow is not registered as a validation',
      );
    }
    if (
      !/^args\s*=\s*"pnpm run validate:canvas:changed"\s*$/m.test(
        canvasWorkflow,
      )
    ) {
      failures.push(
        'the "canvas-release" validation does not run "pnpm run validate:canvas:changed"',
      );
    }
  }

  const contractWorkflow = workflow(replitConfig, "canvas-release-contract");
  if (
    !contractWorkflow ||
    !/^isValidation\s*=\s*true\s*$/m.test(contractWorkflow) ||
    !/^args\s*=\s*"pnpm run test:canvas-release-contract"\s*$/m.test(
      contractWorkflow,
    )
  ) {
    failures.push(
      'the independent "canvas-release-contract" validation is not registered correctly',
    );
  }

  const documentedPaths =
    typeof documentationText === "string"
      ? documentedProtectedCanvasPaths(documentationText)
      : null;
  if (!documentedPaths) {
    failures.push(
      "the Canvas release documentation is missing its protected-path contract block",
    );
  } else if (
    documentedPaths.length !== executableProtectedPaths.length ||
    documentedPaths.some((path, index) => path !== executableProtectedPaths[index])
  ) {
    failures.push(
      "the documented protected paths do not match the executable protected paths (a trailing slash means directory-prefix matching; paths without one match exactly)",
    );
  }

  const scripts = JSON.parse(packageJsonText).scripts;
  const guardedCommand = scripts?.["validate:canvas:changed"];
  if (guardedCommand !== "node scripts/validate-canvas-changes.mjs") {
    failures.push(
      'the "validate:canvas:changed" package command does not run the path guard',
    );
  }

  if (
    typeof changedPathGuardText !== "string" ||
    !/spawnSync\("pnpm", \["run", "validate:canvas"\]/.test(
      changedPathGuardText,
    ) ||
    !/process\.exitCode\s*=\s*result\.status\s*\?\?\s*1/.test(
      changedPathGuardText,
    )
  ) {
    failures.push(
      "the Canvas path guard does not run the canonical validation and propagate failures",
    );
  }

  const command = scripts?.["validate:canvas"];
  if (typeof command !== "string") {
    failures.push('missing the "validate:canvas" package command');
  } else if (command !== expectedCommand) {
    if (!command.includes("pnpm install --frozen-lockfile")) {
      failures.push('missing frozen-lockfile install from "validate:canvas"');
    }
    if (
      !command.includes("pnpm --filter @workspace/mockup-sandbox run typecheck")
    ) {
      failures.push('missing Canvas typecheck from "validate:canvas"');
    }
    if (
      !command.includes(
        "NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build",
      )
    ) {
      failures.push('missing Canvas production build from "validate:canvas"');
    }
    if (failures.length === 0) {
      failures.push(
        '"validate:canvas" must use the canonical ordered && command so every protection gates release',
      );
    }
  }

  return failures;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rootDirectory = resolve(new URL("..", import.meta.url).pathname);
  const workflowLocationFailures = workflowLocationShapeFailures();
  const [
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
    workflowConfigs,
  ] =
    await Promise.all([
      readFile(new URL("../.replit", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("./validate-canvas-changes.mjs", import.meta.url), "utf8"),
      readFile(new URL("../docs/canvas-release-gate.md", import.meta.url), "utf8"),
      workflowLocationFailures.length === 0
        ? readCheckedInWorkflowConfigs(rootDirectory)
        : Promise.resolve([]),
    ]);
  const failures = checkCanvasReleaseContract(
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
    protectedCanvasPaths,
    workflowConfigs,
  );
  failures.push(...workflowLocationFailures.filter(
    (failure) => !failures.includes(failure),
  ));

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Canvas release contract failed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Canvas release contract passed.");
  }
}
