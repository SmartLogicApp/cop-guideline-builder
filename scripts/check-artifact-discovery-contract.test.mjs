import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  artifactDiscoveryFailures,
  checkArtifactDiscoveryContract,
} from "./check-artifact-discovery-contract.mjs";

const rootDirectory = new URL("..", import.meta.url).pathname;

test("accepts checked-in validation scripts", async () => {
  assert.deepEqual(await checkArtifactDiscoveryContract(rootDirectory), []);
});

test("rejects raw artifact discovery in an imported shared utility", async (t) => {
  const repository = await mkdtemp(
    join(tmpdir(), "artifact-discovery-contract-"),
  );
  t.after(() => rm(repository, { recursive: true, force: true }));
  await mkdir(join(repository, "scripts"), { recursive: true });
  await writeFile(
    join(repository, "scripts/check-fixture.mjs"),
    'import { discoverArtifacts } from "./shared-discovery.mjs";\nvoid discoverArtifacts;\n',
  );
  await writeFile(
    join(repository, "scripts/shared-discovery.mjs"),
    `
      import { readdir } from "node:fs/promises";
      import { resolve } from "node:path";

      export async function discoverArtifacts(root) {
        const artifactsDirectory = resolve(root, "artifacts");
        try {
          return await readdir(artifactsDirectory);
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      }
    `,
  );

  assert.deepEqual(await checkArtifactDiscoveryContract(repository), [
    "scripts/shared-discovery.mjs:8 lists the top-level artifacts directory without an approved discovery helper or actionable error handling",
  ]);
});

test("rejects raw non-ENOENT artifact directory failures", () => {
  const source = `
    import { readdir as listDirectory } from "node:fs/promises";
    import { join } from "node:path";

    async function discover(root) {
      const artifactsDirectory = join(root, "artifacts");
      try {
        return await listDirectory(artifactsDirectory, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [
      "scripts/check-fixture.mjs:8 lists the top-level artifacts directory without an approved discovery helper or actionable error handling",
    ],
  );
});

test("accepts equivalent actionable artifact discovery handling", () => {
  const source = `
    import { readdir } from "node:fs/promises";
    import { resolve } from "node:path";

    async function discover(root) {
      const directory = resolve(root, "artifacts");
      try {
        return await readdir(directory);
      } catch (error) {
        throw new Error(
          \`Artifact directory could not be listed: \${error.message}. Check access permissions.\`,
          { cause: error },
        );
      }
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [],
  );
});
