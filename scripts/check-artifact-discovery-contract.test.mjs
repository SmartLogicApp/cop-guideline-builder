import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const unsafeDiscovery = `
  import { readdir } from "node:fs/promises";
  import { resolve } from "node:path";

  async function discover(root) {
    return readdir(resolve(root, "artifacts"));
  }
`;

test("rejects unsafe validators in every supported script format", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "artifact-discovery-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));

  const extensions = ["mjs", "js", "cjs", "ts", "mts"];
  await Promise.all(
    extensions.map((extension) =>
      writeFile(
        join(root, "scripts", `check-fixture-${extension}.${extension}`),
        extension === "cjs"
          ? `
              const { readdir: listDirectory } = require("node:fs/promises");
              const path = require("node:path");

              async function discover(root) {
                return listDirectory(path.resolve(root, "artifacts"));
              }
            `
          : unsafeDiscovery,
      ),
    ),
  );

  assert.deepEqual(
    await checkArtifactDiscoveryContract(root),
    extensions
      .map(
        (extension) =>
          `scripts/check-fixture-${extension}.${extension}:6 lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
      )
      .sort(),
  );
});

test("does not scan test files or the contract guard in supported formats", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "artifact-discovery-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));

  const extensions = ["mjs", "js", "cjs", "ts", "mts"];
  await Promise.all([
    ...extensions.map((extension) =>
      writeFile(
        join(root, "scripts", `check-fixture.test.${extension}`),
        unsafeDiscovery,
      ),
    ),
    ...extensions.map((extension) =>
      writeFile(
        join(
          root,
          "scripts",
          `check-artifact-discovery-contract.${extension}`,
        ),
        unsafeDiscovery,
      ),
    ),
  ]);

  assert.deepEqual(await checkArtifactDiscoveryContract(root), []);
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

test("rejects artifact discovery through default filesystem imports", () => {
  const fixtures = [
    {
      path: "scripts/check-default-fs.mjs",
      source: `
        import fs from "node:fs";
        import { resolve } from "node:path";

        function discover(root) {
          return fs.readdirSync(resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-default-fs-promises.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          return fs.readdir(resolve(root, "artifacts"));
        }
      `,
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(artifactDiscoveryFailures(fixture.path, fixture.source), [
      `${fixture.path}:6 lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
    ]);
  }
});

test("rejects artifact discovery through TypeScript import-equals bindings", () => {
  const fixtures = [
    {
      path: "scripts/check-import-equals-fs.ts",
      source: `
        import fs = require("node:fs");
        import path = require("node:path");

        function discover(root: string) {
          return fs.readdirSync(path.resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-import-equals-fs-promises.ts",
      source: `
        import fs = require("node:fs/promises");
        import path = require("node:path");

        async function discover(root: string) {
          return fs.readdir(path.resolve(root, "artifacts"));
        }
      `,
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(artifactDiscoveryFailures(fixture.path, fixture.source), [
      `${fixture.path}:6 lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
    ]);
  }
});

test("accepts equivalent actionable artifact discovery handling", () => {
  const source = `
    import fs = require("node:fs/promises");
    import path = require("node:path");

    async function discover(root: string) {
      const directory = path.resolve(root, "artifacts");
      try {
        return await fs.readdir(directory);
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
