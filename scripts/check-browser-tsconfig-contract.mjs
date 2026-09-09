import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { artifactRunsInBrowser } from "./artifact-kind-runtime.mjs";

const REQUIRED_DOM_LIBRARIES = ["lib.dom.d.ts", "lib.dom.iterable.d.ts"];

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
        const relativeManifestPath = manifestPath
          .slice(resolve(rootDirectory).length + 1)
          .replaceAll("\\", "/");
        let manifest;
        try {
          manifest = await readFile(manifestPath, "utf8");
        } catch (error) {
          if (error?.code === "ENOENT") {
            return {};
          }
          return {
            failure: `${relativeManifestPath} could not be read: ${error.message}. Check file access for this manifest.`,
          };
        }

        try {
          if (artifactRunsInBrowser(manifest)) {
            return { directory };
          }
          return {};
        } catch (error) {
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
