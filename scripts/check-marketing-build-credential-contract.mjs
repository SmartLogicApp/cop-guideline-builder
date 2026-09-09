import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const protectedBuild = "pnpm --filter @workspace/marketing-site run build";
const credentialCheck = "test:clerk-credentials";
const browserTestBypass = "CLERK_AUTH_BROWSER_TEST";
const marketingReference =
  /(?:@workspace\/marketing-site|artifacts\/marketing-site)/u;
const protectedBuildArray =
  /^build\s*=\s*\[\s*["']pnpm["']\s*,\s*["']--filter["']\s*,\s*["']@workspace\/marketing-site["']\s*,\s*["']run["']\s*,\s*["']build["']\s*\]\s*$/u;
const protectedBuildCommand =
  /(?:^|&&|\|\||;|\n)\s*pnpm\s+--filter\s+@workspace\/marketing-site\s+run\s+build(?=$|[\s;&|])/u;
const executableCredentialCheck =
  /(?:^|&&|\|\||;|\n)\s*pnpm\s+(?:--filter\s+@workspace\/marketing-site\s+)?run\s+test:clerk-credentials(?=$|[\s;&|])/u;
const directViteBuild = /\bvite\b[^\r\n;&|]*\bbuild(?=$|[\s;&|])/u;

function normalizeShellContinuations(command) {
  return command.replace(/\\\r?\n\s*/gu, " ");
}

export const releaseBuildLocations = [
  "package.json",
  "artifacts/marketing-site/package.json",
  "artifacts/marketing-site/.replit-artifact/artifact.toml",
  "playwright.config.ts",
  ".github/workflows",
];

function directMarketingViteBuild(text) {
  return directViteBuild.test(normalizeShellContinuations(text));
}

function credentialCheckGatesBuildAt(command, buildIndex) {
  const credentialMatches = [
    ...command
      .slice(0, buildIndex)
      .matchAll(new RegExp(executableCredentialCheck.source, "gu")),
  ];
  const credentialMatch = credentialMatches.at(-1);
  if (!credentialMatch || credentialMatch[0].trimStart().startsWith("||")) {
    return false;
  }

  const gate = command
    .slice(credentialMatch.index + credentialMatch[0].length, buildIndex)
    .replace(/&&\s*\r?\n/gu, "&& ")
    .replace(/\\\r?\n/gu, " ");
  return gate.trimStart().startsWith("&&") && !/(?:\|\||;|\r?\n)/u.test(gate);
}

function allDirectViteBuildsCredentialGated(command) {
  command = normalizeShellContinuations(command);
  const builds = [
    ...command.matchAll(new RegExp(directViteBuild.source, "gu")),
  ];
  return (
    builds.length > 0 &&
    builds.every((build) => credentialCheckGatesBuildAt(command, build.index))
  );
}

function hasFailurePropagatingCredentialCheck(command) {
  command = normalizeShellContinuations(command);
  const credentialMatch = executableCredentialCheck.exec(command);
  if (!credentialMatch || credentialMatch[0].trimStart().startsWith("||")) {
    return false;
  }

  const suffix = command
    .slice(credentialMatch.index + credentialMatch[0].length)
    .replace(/&&\s*\r?\n/gu, "&& ")
    .replace(/\\\r?\n/gu, " ")
    .replaceAll("&&", "");
  return !/[;&|]|\r?\n/u.test(suffix);
}

function isSafeMarketingBuildCommand(command) {
  command = normalizeShellContinuations(command);
  if (directMarketingViteBuild(command)) {
    return allDirectViteBuildsCredentialGated(command);
  }
  return protectedBuildCommand.test(command);
}

function stripShellComment(command) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === quote && command[index - 1] !== "\\") quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (
      character === "#" &&
      (index === 0 || /\s/u.test(command[index - 1]))
    ) {
      return command.slice(0, index);
    }
  }
  return command;
}

function parseYamlCommandScalar(value) {
  const scalar = stripShellComment(value).trim();
  if (scalar.length >= 2 && scalar.startsWith("'") && scalar.endsWith("'")) {
    return scalar.slice(1, -1).replaceAll("''", "'");
  }
  if (scalar.length >= 2 && scalar.startsWith('"') && scalar.endsWith('"')) {
    try {
      return JSON.parse(scalar);
    } catch {
      return scalar.slice(1, -1);
    }
  }
  return scalar;
}

function hasActiveBrowserTestBypass(text) {
  return text
    .split(/\r?\n/u)
    .some((line) => stripShellComment(line).includes(browserTestBypass));
}

function hasMarketingWorkingDirectory(text) {
  return text.split(/\r?\n/u).some((line) => {
    const activeLine = stripShellComment(line);
    return /(?:^\s*(?:-\s*)?|[{,]\s*)(?:working-directory|"working-directory"|'working-directory')\s*:\s*["']?\.?\/?artifacts\/marketing-site(?:\/|["']?(?:\s*[,}]|\s*$))/u.test(
      activeLine,
    );
  });
}

function activeProductionBuildDeclarations(text) {
  const declarations = [];
  let inProductionSection = false;
  for (const line of text.split(/\r?\n/u)) {
    const activeLine = stripShellComment(line).trim();
    if (!activeLine) continue;

    const section = activeLine.match(/^\[\[?([^\]]+)\]\]?$/u);
    if (section) {
      inProductionSection = section[1] === "services.production";
    } else if (inProductionSection && /^build\s*=/u.test(activeLine)) {
      declarations.push(activeLine);
    }
  }
  return declarations;
}

export function executableWorkflowCommands(text) {
  const lines = text.split(/\r?\n/u);
  const commands = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^(\s*)(?:-\s*)?(?:run|"run"|'run')\s*:\s*(.*?)\s*$/u,
    );
    if (!match) continue;

    const scalarHeader = stripShellComment(match[2]).trim();
    if (/^[>|][-+]?$/u.test(scalarHeader)) {
      const indentation = match[1].length;
      const block = [];
      for (index += 1; index < lines.length; index += 1) {
        const line = lines[index];
        const lineIndentation = line.match(/^\s*/u)[0].length;
        if (line.trim() && lineIndentation <= indentation) {
          index -= 1;
          break;
        }
        block.push(stripShellComment(line.trim()));
      }
      commands.push(block.join(scalarHeader.startsWith(">") ? " " : "\n"));
    } else {
      commands.push(parseYamlCommandScalar(match[2]));
    }
  }

  for (const match of text.matchAll(
    /(?:^|[,{]\s*)(?:run|"run"|'run')\s*:\s*(?:"((?:\\.|[^"])*)"|'((?:''|[^'])*)'|([^,}\r\n]+))/gmu,
  )) {
    commands.push(
      stripShellComment(
        match[1] ?? match[2]?.replaceAll("''", "'") ?? match[3],
      ),
    );
  }
  return commands;
}

export function marketingBuildCredentialFailures({
  rootPackage,
  marketingPackage,
  artifactManifest,
  playwright,
  workflows = [],
}) {
  const failures = [];
  const rootScripts = JSON.parse(rootPackage).scripts ?? {};
  const marketingScripts = JSON.parse(marketingPackage).scripts ?? {};
  const marketingPrebuild = String(marketingScripts.prebuild ?? "");

  if (!hasFailurePropagatingCredentialCheck(marketingPrebuild)) {
    failures.push(
      `artifacts/marketing-site package prebuild must run ${credentialCheck}`,
    );
  }
  const marketingBuild = String(marketingScripts.build ?? "");
  if (!directMarketingViteBuild(marketingBuild)) {
    failures.push(
      "artifacts/marketing-site build must remain the Vite production build",
    );
  }
  if (
    !String(rootScripts.build ?? "").includes("pnpm -r --if-present run build")
  ) {
    failures.push(
      "workspace build must use recursive package build scripts so marketing-site prebuild cannot be skipped",
    );
  }

  for (const [name, commandValue] of Object.entries(rootScripts)) {
    const command = String(commandValue);
    if (command.includes(browserTestBypass)) {
      failures.push(
        `workspace package script ${JSON.stringify(name)} uses the browser-only ${browserTestBypass} bypass`,
      );
    }
    if (
      marketingReference.test(command) &&
      directMarketingViteBuild(command) &&
      !isSafeMarketingBuildCommand(command)
    ) {
      failures.push(
        `workspace package script ${JSON.stringify(name)} directly builds the marketing site without running ${credentialCheck} first`,
      );
    }
  }

  for (const [name, commandValue] of Object.entries(marketingScripts)) {
    const command = String(commandValue);
    if (command.includes(browserTestBypass)) {
      failures.push(
        `marketing-site package script ${JSON.stringify(name)} uses the browser-only ${browserTestBypass} bypass`,
      );
    }
    if (
      name !== "build" &&
      directMarketingViteBuild(command) &&
      !allDirectViteBuildsCredentialGated(command)
    ) {
      failures.push(
        `marketing-site package script ${JSON.stringify(name)} directly invokes Vite without running ${credentialCheck} first`,
      );
    }
  }

  const productionBuilds = activeProductionBuildDeclarations(artifactManifest);
  if (
    productionBuilds.length !== 1 ||
    !protectedBuildArray.test(productionBuilds[0])
  ) {
    failures.push(
      "marketing-site production deployment must run the protected package build",
    );
  }
  if (hasActiveBrowserTestBypass(artifactManifest)) {
    failures.push(
      `marketing-site production deployment uses the browser-only ${browserTestBypass} bypass`,
    );
  }

  const playwrightCommands =
    playwright.match(
      /["']pnpm\s+--filter\s+@workspace\/marketing-site\s+run\s+build\b/gu,
    ) ?? [];
  const browserFlags =
    playwright.match(/CLERK_AUTH_BROWSER_TEST:\s*["']true["']/gu) ?? [];
  if (playwrightCommands.length !== 2 || browserFlags.length !== 2) {
    failures.push(
      "Playwright must contain exactly two marketing fixture builds and both must explicitly set CLERK_AUTH_BROWSER_TEST to true",
    );
  }
  for (const { path, text } of workflows) {
    const marketingWorkingDirectory = hasMarketingWorkingDirectory(text);
    for (const command of executableWorkflowCommands(text)) {
      if (
        (marketingReference.test(command) || marketingWorkingDirectory) &&
        directMarketingViteBuild(command) &&
        !isSafeMarketingBuildCommand(command)
      ) {
        failures.push(
          `${path} directly builds the marketing site without running ${credentialCheck} first`,
        );
      }
    }
    if (hasActiveBrowserTestBypass(text)) {
      failures.push(
        `${path} declares ${browserTestBypass} outside the sole documented Playwright fixture exception`,
      );
    }
  }

  return failures;
}

async function workflowFiles(directory) {
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
    if (entry.isDirectory()) files.push(...(await workflowFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function checkMarketingBuildCredentialContract(rootDirectory) {
  const resolvedRootDirectory = resolve(rootDirectory);
  const read = (path) => readFile(resolve(rootDirectory, path), "utf8");
  const workflowPaths = await workflowFiles(
    resolve(rootDirectory, ".github/workflows"),
  );
  const [
    rootPackage,
    marketingPackage,
    artifactManifest,
    playwright,
    workflows,
  ] = await Promise.all([
    read("package.json"),
    read("artifacts/marketing-site/package.json"),
    read("artifacts/marketing-site/.replit-artifact/artifact.toml"),
    read("playwright.config.ts"),
    Promise.all(
      workflowPaths.map(async (path) => ({
        path: path
          .slice(resolvedRootDirectory.length + 1)
          .replaceAll("\\", "/"),
        text: await readFile(path, "utf8"),
      })),
    ),
  ]);
  return marketingBuildCredentialFailures({
    rootPackage,
    marketingPackage,
    artifactManifest,
    playwright,
    workflows,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await checkMarketingBuildCredentialContract(
    resolve(fileURLToPath(new URL("..", import.meta.url))),
  );
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Marketing build credential contract passed.");
  }
}
