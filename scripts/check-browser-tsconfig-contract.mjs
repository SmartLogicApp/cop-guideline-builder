import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const REQUIRED_DOM_LIBRARIES = ["lib.dom.d.ts", "lib.dom.iterable.d.ts"];
const BROWSER_ARTIFACT_KINDS = new Set(["design", "slides", "video", "web"]);
const NON_BROWSER_ARTIFACT_KINDS = new Set(["api", "mobile"]);
const ARTIFACT_KINDS = new Set([
  ...BROWSER_ARTIFACT_KINDS,
  ...NON_BROWSER_ARTIFACT_KINDS,
]);

function parseRootAssignment(manifest, key, valuePattern) {
  const declaration = new RegExp(`^\\s*${key}\\s*=`, "u");
  const assignment = new RegExp(
    `^\\s*${key}\\s*=\\s*${valuePattern}\\s*(?:#.*)?$`,
    "u",
  );
  const declarations = [];
  let inTable = false;
  for (const line of manifest.split(/\r?\n/u)) {
    if (/^\s*\[\[?.+\]?\]\s*(?:#.*)?$/u.test(line)) {
      inTable = true;
    }
    if (!inTable && declaration.test(line)) {
      declarations.push(line);
    }
  }

  if (declarations.length > 1) {
    throw new Error(`defines ${key} more than once`);
  }
  if (declarations.length === 0) {
    return undefined;
  }

  const match = declarations[0].match(assignment);
  if (!match) {
    throw new Error(`has malformed ${key} metadata`);
  }
  return match[1];
}

export function artifactRunsInBrowser(manifest) {
  const kind = parseRootAssignment(manifest, "kind", '"([^"]+)"');
  if (kind === undefined) {
    throw new Error('is missing required kind metadata (for example, kind = "web")');
  }
  if (!ARTIFACT_KINDS.has(kind)) {
    throw new Error(
      `uses unknown artifact kind "${kind}" (expected one of: ${[...ARTIFACT_KINDS].join(", ")})`,
    );
  }

  const runtimeValue = parseRootAssignment(
    manifest,
    "browserRuntime",
    "(true|false)",
  );
  const expectedBrowserRuntime = BROWSER_ARTIFACT_KINDS.has(kind);
  if (
    runtimeValue !== undefined &&
    (runtimeValue === "true") !== expectedBrowserRuntime
  ) {
    throw new Error(
      `has contradictory runtime metadata: kind "${kind}" requires browserRuntime = ${expectedBrowserRuntime}`,
    );
  }

  return expectedBrowserRuntime;
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

export async function findBrowserArtifactDirectories(rootDirectory) {
  const artifactsDirectory = join(rootDirectory, "artifacts");
  const entries = await readdir(artifactsDirectory, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const directory = join(artifactsDirectory, entry.name);
        const manifestPath = join(
          directory,
          ".replit-artifact",
          "artifact.toml",
        );
        let manifest;
        try {
          manifest = await readFile(manifestPath, "utf8");
        } catch (error) {
          if (error?.code === "ENOENT") {
            return {};
          }
          throw error;
        }

        try {
          if (artifactRunsInBrowser(manifest)) {
            return { directory };
          }
          return {};
        } catch (error) {
          const relativeManifestPath = manifestPath
            .slice(resolve(rootDirectory).length + 1)
            .replaceAll("\\", "/");
          return {
            failure: `${relativeManifestPath} ${error.message}. Repair the root-level artifact runtime metadata in this manifest.`,
          };
        }
      }),
  );

  const failures = results.flatMap(({ failure }) => failure ?? []);
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => new Error(failure)),
      "Invalid artifact manifests",
    );
  }

  return results
    .flatMap(({ directory }) => directory ?? [])
    .sort();
}

export function effectiveLibraryNames(tsconfigPath) {
  const diagnostics = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsed) {
    return {
      failures: diagnostics.map(formatDiagnostic),
      libraries: [],
    };
  }

  diagnostics.push(...parsed.errors);
  return {
    failures: diagnostics.map(formatDiagnostic),
    libraries: (parsed.options.lib ?? []).map((library) =>
      library.toLowerCase(),
    ),
  };
}

export async function checkBrowserTsconfigContract(rootDirectory) {
  const failures = [];
  let artifactDirectories;
  try {
    artifactDirectories = await findBrowserArtifactDirectories(rootDirectory);
  } catch (error) {
    if (error instanceof AggregateError) {
      return error.errors.map((manifestError) => manifestError.message);
    }
    return [error.message];
  }

  for (const artifactDirectory of artifactDirectories) {
    const relativeDirectory = artifactDirectory
      .slice(resolve(rootDirectory).length + 1)
      .replaceAll("\\", "/");
    const tsconfigPath = join(artifactDirectory, "tsconfig.json");

    try {
      await readFile(tsconfigPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        failures.push(`${relativeDirectory} is missing tsconfig.json`);
        continue;
      }
      throw error;
    }

    const result = effectiveLibraryNames(tsconfigPath);
    for (const diagnostic of result.failures) {
      failures.push(`${relativeDirectory}/tsconfig.json: ${diagnostic}`);
    }

    const missingLibraries = REQUIRED_DOM_LIBRARIES.filter(
      (library) => !result.libraries.includes(library),
    );
    if (missingLibraries.length) {
      failures.push(
        `${relativeDirectory}/tsconfig.json effective compilerOptions.lib is missing ${missingLibraries.join(
          ", ",
        )}`,
      );
    }
  }

  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const failures = await checkBrowserTsconfigContract(root);
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Browser TypeScript DOM library contract passed.");
  }
}