import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  ARTIFACT_KINDS,
  artifactRunsInBrowser,
} from "./artifact-kind-runtime.mjs";
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
      "artifacts/browser/src/index.ts":
        "document.body.dataset.ready = 'true';\n",
      "artifacts/browser/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base.json",
      }),
    },
    async (root) => {
      const failures = await checkBrowserTsconfigContract(root);
      assert.equal(failures.length, 1);
      assert.match(
        failures[0],
        /missing lib\.dom\.d\.ts, lib\.dom\.iterable\.d\.ts/,
      );
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
        'kind = "web"\nbrowserRuntime = true\n',
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

test("classifies every supported artifact kind from the shared registry", () => {
  const classifications = Object.entries(ARTIFACT_KINDS).map(
    ([kind, { browserRuntime }]) => [
      kind,
      artifactRunsInBrowser(`kind = "${kind}"\n`),
      browserRuntime,
    ],
  );

  assert.ok(
    classifications.some(([, actual]) => actual),
    "registry must include a browser artifact kind",
  );
  assert.ok(
    classifications.some(([, actual]) => !actual),
    "registry must include a non-browser artifact kind",
  );
  for (const [kind, actual, expected] of classifications) {
    assert.equal(
      actual,
      expected,
      `runtime classification drifted for ${kind}`,
    );
  }
});

test("enforces registry classifications for explicit runtime metadata", () => {
  for (const [kind, { browserRuntime }] of Object.entries(ARTIFACT_KINDS)) {
    assert.equal(
      artifactRunsInBrowser(
        `kind = "${kind}"\nbrowserRuntime = ${browserRuntime}\n`,
      ),
      browserRuntime,
    );
    assert.throws(
      () =>
        artifactRunsInBrowser(
          `kind = "${kind}"\nbrowserRuntime = ${!browserRuntime}\n`,
        ),
      /contradictory runtime metadata/,
    );
  }
});

test("rejects missing and malformed runtime classification", async () => {
  for (const [manifest, expected] of [
    ['name = "browser"\n', /missing required kind metadata/],
    ['[metadata]\nkind = "web"\n', /missing required kind metadata/],
    ["kind = web\n", /malformed kind metadata/],
    [
      'kind = "web"\nbrowserRuntime = "true"\n',
      /malformed browserRuntime metadata/,
    ],
    ['kind = "web"\nkind = "api"\n', /defines kind more than once/],
  ]) {
    await withFixture(
      {
        "artifacts/browser/.replit-artifact/artifact.toml": manifest,
      },
      async (root) => {
        const failures = await checkBrowserTsconfigContract(root);
        assert.equal(failures.length, 1);
        assert.match(
          failures[0],
          /artifacts\/browser\/\.replit-artifact\/artifact\.toml/,
        );
        assert.match(failures[0], expected);
        assert.match(
          failures[0],
          /Repair the root-level artifact runtime metadata in this manifest\.$/,
        );
      },
    );
  }
});

test("reports every malformed manifest deterministically with repair guidance", async () => {
  await withFixture(
    {
      "artifacts/zeta/.replit-artifact/artifact.toml": "kind = web\n",
      "artifacts/alpha/.replit-artifact/artifact.toml":
        'kind = "web"\nbrowserRuntime = false\n',
      "artifacts/valid/.replit-artifact/artifact.toml": 'kind = "api"\n',
    },
    async (root) => {
      assert.deepEqual(await checkBrowserTsconfigContract(root), [
        'artifacts/alpha/.replit-artifact/artifact.toml has contradictory runtime metadata: kind "web" requires browserRuntime = true. Repair the root-level artifact runtime metadata in this manifest.',
        "artifacts/zeta/.replit-artifact/artifact.toml has malformed kind metadata. Repair the root-level artifact runtime metadata in this manifest.",
      ]);
    },
  );
});

test("rejects unknown artifact kinds", async () => {
  await withFixture(
    {
      "artifacts/browser/.replit-artifact/artifact.toml":
        'kind = "website"\nbrowserRuntime = true\n',
    },
    async (root) => {
      assert.deepEqual(await checkBrowserTsconfigContract(root), [
        'artifacts/browser/.replit-artifact/artifact.toml uses unknown artifact kind "website" (expected one of: api, design, design-system, mobile, slides, video, web). Repair the root-level artifact runtime metadata in this manifest.',
      ]);
    },
  );
});

test("rejects artifact kinds inherited from the registry prototype", async () => {
  for (const kind of ["__proto__", "constructor", "toString"]) {
    const manifest = `kind = "${kind}"\n`;
    assert.throws(() => artifactRunsInBrowser(manifest), {
      message: new RegExp(`uses unknown artifact kind "${kind}"`, "u"),
    });

    await withFixture(
      {
        "artifacts/browser/.replit-artifact/artifact.toml": manifest,
      },
      async (root) => {
        const failures = await checkBrowserTsconfigContract(root);
        assert.equal(failures.length, 1);
        assert.match(failures[0], /uses unknown artifact kind/u);
        assert.match(failures[0], new RegExp(`"${kind}"`, "u"));
      },
    );
  }
});

test("rejects runtime metadata that contradicts the artifact kind", async () => {
  for (const manifest of [
    'kind = "web"\nbrowserRuntime = false\n',
    'kind = "api"\nbrowserRuntime = true\n',
  ]) {
    await withFixture(
      {
        "artifacts/artifact/.replit-artifact/artifact.toml": manifest,
      },
      async (root) => {
        assert.match(
          (await checkBrowserTsconfigContract(root))[0],
          /contradictory runtime metadata/,
        );
      },
    );
  }
});
