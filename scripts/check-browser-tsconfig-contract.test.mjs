import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  checkBrowserTsconfigContract,
  findBrowserArtifactDirectories,
} from "./check-browser-tsconfig-contract.mjs";

const rootDirectory = new URL("..", import.meta.url).pathname;

async function withFixture(files, assertion) {
  const root = await mkdtemp(join(tmpdir(), "browser-tsconfig-contract-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const destination = join(root, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, contents);
    }
    await assertion(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts every checked-in browser artifact", async () => {
  assert.deepEqual(await checkBrowserTsconfigContract(rootDirectory), []);
  assert.deepEqual(
    (await findBrowserArtifactDirectories(rootDirectory)).map((directory) =>
      relative(rootDirectory, directory).replaceAll("\\", "/"),
    ),
    [
      "artifacts/cms-compliance-consultant-training",
      "artifacts/cms-compliance-tutorial-video",
      "artifacts/marketing-site",
      "artifacts/mockup-sandbox",
    ],
  );
});


test("rejects a non-Vite browser artifact with server-only libraries", async () => {
  await withFixture(
    {
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: { lib: ["ES2022"] },
      }),
      "artifacts/browser/.replit-artifact/artifact.toml": 'kind = "web"\n',
      "artifacts/browser/webpack.config.js": "export default {};\n",
      "artifacts/browser/src/index.ts": "document.body.dataset.ready = 'true';\n",
      "artifacts/browser/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base.json",
      }),
    },
    async (root) => {
      const failures = await checkBrowserTsconfigContract(root);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /missing lib\.dom\.d\.ts, lib\.dom\.iterable\.d\.ts/);
    },
  );
});

test("uses the effective inherited library configuration", async () => {
  await withFixture(
    {
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
      }),
      "artifacts/browser/.replit-artifact/artifact.toml": 'kind = "slides"\n',
      "artifacts/browser/vite.config.mts": "export default {};\n",
      "artifacts/browser/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base.json",
      }),
    },
    async (root) => {
      assert.deepEqual(await checkBrowserTsconfigContract(root), []);
    },
  );
});

test("rejects an explicitly marked browser artifact without a tsconfig", async () => {
  await withFixture(
    {
      "artifacts/new-browser/.replit-artifact/artifact.toml":
        'kind = "custom"\nbrowserRuntime = true\n',
    },
    async (root) => {
      assert.deepEqual(await checkBrowserTsconfigContract(root), [
        "artifacts/new-browser is missing tsconfig.json",
      ]);
    },
  );
});

test("excludes API and mobile-native artifacts", async () => {
  await withFixture(
    {
      "artifacts/api/.replit-artifact/artifact.toml": 'kind = "api"\n',
      "artifacts/api/vite.config.ts": "export default {};\n",
      "artifacts/mobile/.replit-artifact/artifact.toml": 'kind = "mobile"\n',
      "artifacts/mobile/vite.config.ts": "export default {};\n",
    },
    async (root) => {
      assert.deepEqual(await findBrowserArtifactDirectories(root), []);
      assert.deepEqual(await checkBrowserTsconfigContract(root), []);
    },
  );
});