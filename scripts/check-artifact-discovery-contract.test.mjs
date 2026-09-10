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

test("rejects artifact discovery through static filesystem element access", () => {
  const fixtures = [
    {
      path: "scripts/check-bracket-fs.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          return fs["readdir"](resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-bracket-fs-sync.cjs",
      source: `
        const fs = require("node:fs");
        const path = require("node:path");

        function discover(root) {
          return fs['readdirSync'](path.resolve(root, "artifacts"));
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

test("rejects artifact discovery through extracted filesystem methods", () => {
  const fixtures = [
    {
      path: "scripts/check-extracted-fs.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          const listDirectory = fs.readdir;
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-extracted-bracket-fs.cjs",
      source: `
        const fs = require("node:fs");
        const path = require("node:path");

        function discover(root) {
          const listDirectory = fs["readdirSync"];
          return listDirectory(path.resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-module-extracted-fs.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        const listDirectory = fs.readdir;
        async function discover(root) {
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-outer-extracted-fs.cjs",
      source: `
        const fs = require("node:fs");
        const path = require("node:path");

        function outer(root) {
          const listDirectory = fs.readdirSync;
          return function discover() {
            return listDirectory(path.resolve(root, "artifacts"));
          };
        }
      `,
    },
  ];

  for (const fixture of fixtures) {
    const expectedLine = fixture.path.includes("outer") ? 8 : 7;
    assert.deepEqual(artifactDiscoveryFailures(fixture.path, fixture.source), [
      `${fixture.path}:${expectedLine} lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
    ]);
  }
});

test("rejects artifact discovery through copied and assigned reader aliases", () => {
  const fixtures = [
    {
      path: "scripts/check-copied-reader.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          const first = fs.readdir;
          const second = first;
          const third = second;
          return third(resolve(root, "artifacts"));
        }
      `,
      line: 9,
    },
    {
      path: "scripts/check-assigned-reader.cjs",
      source: `
        const fs = require("node:fs");
        const path = require("node:path");

        function discover(root) {
          let listDirectory;
          listDirectory = fs.readdirSync;
          return listDirectory(path.resolve(root, "artifacts"));
        }
      `,
      line: 8,
    },
    {
      path: "scripts/check-assigned-copy.mjs",
      source: `
        import { readdir } from "node:fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          let first;
          first = readdir;
          let second;
          second = first;
          return second(resolve(root, "artifacts"));
        }
      `,
      line: 10,
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(artifactDiscoveryFailures(fixture.path, fixture.source), [
      `${fixture.path}:${fixture.line} lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
    ]);
  }
});

test("stops tracking copied reader aliases after unrelated reassignment", () => {
  const source = `
    import fs from "node:fs/promises";
    import { resolve } from "node:path";

    async function inspect(root, helper) {
      const first = fs.readdir;
      let second = first;
      second = helper;
      return second(resolve(root, "artifacts"));
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [],
  );
});

test("ignores reassigned and unrelated extracted filesystem methods", () => {
  const source = `
    import fs from "node:fs/promises";
    import { resolve } from "node:path";

    async function inspect(root, helper) {
      let listDirectory = fs.readdir;
      listDirectory = helper;
      await listDirectory(resolve(root, "artifacts"));

      const inspectDirectory = fs.stat;
      return inspectDirectory(resolve(root, "artifacts"));
    }

    function unrelated(root, listDirectory) {
      return listDirectory(resolve(root, "artifacts"));
    }

    function shadowedParameter(root) {
      const listDirectory = fs.readdir;
      return ((listDirectory) =>
        listDirectory(resolve(root, "artifacts")))(helper);
    }

    function shadowedBlock(root) {
      const listDirectory = fs.readdir;
      {
        const listDirectory = helper;
        return listDirectory(resolve(root, "artifacts"));
      }
    }

    function unrelatedOuter(root) {
      const inspectDirectory = fs.stat;
      return function inspect() {
        return inspectDirectory(resolve(root, "artifacts"));
      };
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [],
  );
});

test("respects lexical scope when extracted reader names are shadowed", () => {
  const unsafeCatchSource = `
    import fs from "node:fs/promises";
    import { resolve } from "node:path";

    const listDirectory = fs.readdir;
    async function inspect(root) {
      try {
        await Promise.resolve();
      } catch (listDirectory) {
        return listDirectory;
      }
      return listDirectory(resolve(root, "artifacts"));
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures(
      "scripts/check-catch-scope.mjs",
      unsafeCatchSource,
    ),
    [
      "scripts/check-catch-scope.mjs:12 lists the top-level artifacts directory without an approved discovery helper or actionable error handling",
    ],
  );

  const safeShadowSources = [
    `
      import fs from "node:fs/promises";
      import { resolve } from "node:path";

      const listDirectory = fs.readdir;
      function inspect(root, { listDirectory }) {
        return listDirectory(resolve(root, "artifacts"));
      }
    `,
    `
      import fs from "node:fs/promises";
      import { resolve } from "node:path";

      const listDirectory = fs.readdir;
      function inspect(root) {
        function listDirectory() {
          return [];
        }
        return listDirectory(resolve(root, "artifacts"));
      }
    `,
  ];

  for (const source of safeShadowSources) {
    assert.deepEqual(
      artifactDiscoveryFailures("scripts/check-shadow.mjs", source),
      [],
    );
  }
});

test("retains extracted reader tracking after conditional reassignment", () => {
  const fixtures = [
    {
      path: "scripts/check-branch-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper, replace) {
          let listDirectory = fs.readdir;
          if (replace) {
            listDirectory = helper;
          }
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 10,
    },
    {
      path: "scripts/check-short-circuit-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper, replace) {
          let listDirectory = fs.readdir;
          replace && (listDirectory = helper);
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 8,
    },
    {
      path: "scripts/check-nested-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper) {
          let listDirectory = fs.readdir;
          function replaceLater() {
            listDirectory = helper;
          }
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 10,
    },
    {
      path: "scripts/check-rhs-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root) {
          let listDirectory = fs.readdir;
          listDirectory = await listDirectory(resolve(root, "artifacts"));
          return listDirectory;
        }
      `,
      line: 7,
    },
    {
      path: "scripts/check-reader-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root) {
          let listDirectory = fs.readdir;
          listDirectory = fs["readdir"];
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 8,
    },
    {
      path: "scripts/check-reader-reactivation.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper) {
          let listDirectory = fs.readdir;
          listDirectory = helper;
          listDirectory = fs.readdir;
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 9,
    },
    {
      path: "scripts/check-captured-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper) {
          let listDirectory = fs.readdir;
          listDirectory = helper;
          async function discover() {
            return listDirectory(resolve(root, "artifacts"));
          }
          return discover();
        }
      `,
      line: 9,
    },
    {
      path: "scripts/check-early-captured-reader.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root) {
          async function discover() {
            return listDirectory(resolve(root, "artifacts"));
          }
          const listDirectory = fs.readdir;
          return discover();
        }
      `,
      line: 7,
    },
    {
      path: "scripts/check-shadowed-reassignment.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper) {
          let listDirectory = fs.readdir;
          {
            let listDirectory = helper;
            listDirectory = helper;
          }
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 11,
    },
    {
      path: "scripts/check-conditional-reactivation.mjs",
      source: `
        import fs from "node:fs/promises";
        import { resolve } from "node:path";

        async function inspect(root, helper, restore) {
          let listDirectory = fs.readdir;
          listDirectory = helper;
          if (restore) {
            listDirectory = fs.readdir;
          }
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
      line: 11,
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(
      artifactDiscoveryFailures(fixture.path, fixture.source),
      [
        `${fixture.path}:${fixture.line} lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
      ],
    );
  }
});

test("rejects legacy filesystem module specifiers through supported bindings", () => {
  const fixtures = [
    {
      path: "scripts/check-legacy-named-fs.mjs",
      source: `
        import { readdirSync as listDirectory } from "fs";
        import { resolve } from "node:path";

        function discover(root) {
          return listDirectory(resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-legacy-default-fs-promises.mjs",
      source: `
        import fs from "fs/promises";
        import { resolve } from "node:path";

        async function discover(root) {
          return fs.readdir(resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-legacy-require-fs.cjs",
      source: `
        const fs = require("fs");
        const path = require("node:path");

        function discover(root) {
          return fs.readdirSync(path.resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-legacy-require-fs-promises.cjs",
      source: `
        const { readdir: listDirectory } = require("fs/promises");
        const path = require("node:path");

        async function discover(root) {
          return listDirectory(path.resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-legacy-import-equals-fs.ts",
      source: `
        import fs = require("fs");
        import path = require("node:path");

        function discover(root: string) {
          return fs.readdirSync(path.resolve(root, "artifacts"));
        }
      `,
    },
    {
      path: "scripts/check-legacy-import-equals-fs-promises.ts",
      source: `
        import fs = require("fs/promises");
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

test("ignores dynamic and unrelated filesystem element access", () => {
  const source = `
    import fs from "node:fs/promises";
    import { resolve } from "node:path";

    async function inspect(root, method, other) {
      await fs[method](resolve(root, "artifacts"));
      await fs["stat"](resolve(root, "artifacts"));
      return other["readdir"](resolve(root, "artifacts"));
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [],
  );
});

test("ignores unrelated dynamic imports", () => {
  const source = `
    import { resolve } from "node:path";

    async function inspect(root) {
      const helper = await import("./artifact-helper.mjs");
      return helper.inspect(resolve(root, "artifacts"));
    }
  `;

  assert.deepEqual(
    artifactDiscoveryFailures("scripts/check-fixture.mjs", source),
    [],
  );
});

test("accepts equivalent actionable artifact discovery handling", () => {
  const source = `
    import fs = require("fs/promises");
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
