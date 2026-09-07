import { readFile } from "node:fs/promises";
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
) {
  const failures = [];
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
  const [
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
  ] =
    await Promise.all([
      readFile(new URL("../.replit", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("./validate-canvas-changes.mjs", import.meta.url), "utf8"),
      readFile(new URL("../docs/canvas-release-gate.md", import.meta.url), "utf8"),
    ]);
  const failures = checkCanvasReleaseContract(
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Canvas release contract failed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Canvas release contract passed.");
  }
}
