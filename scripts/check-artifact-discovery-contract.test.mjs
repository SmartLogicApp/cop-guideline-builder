import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactDiscoveryFailures,
  checkArtifactDiscoveryContract,
} from "./check-artifact-discovery-contract.mjs";

const rootDirectory = new URL("..", import.meta.url).pathname;

test("accepts checked-in validation scripts", async () => {
  assert.deepEqual(await checkArtifactDiscoveryContract(rootDirectory), []);
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
