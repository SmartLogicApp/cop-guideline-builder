import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  checkMarketingBuildCredentialContract,
  executableWorkflowCommands,
  marketingBuildCredentialFailures,
  releaseBuildLocations,
} from "./check-marketing-build-credential-contract.mjs";

const rootDirectory = new URL("..", import.meta.url).pathname;
const fixtures = {
  rootPackage: await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ),
  marketingPackage: await readFile(
    new URL("../artifacts/marketing-site/package.json", import.meta.url),
    "utf8",
  ),
  artifactManifest: await readFile(
    new URL(
      "../artifacts/marketing-site/.replit-artifact/artifact.toml",
      import.meta.url,
    ),
    "utf8",
  ),
  playwright: await readFile(
    new URL("../playwright.config.ts", import.meta.url),
    "utf8",
  ),
};

test("enumerates every supported marketing release build location", () => {
  assert.deepEqual(releaseBuildLocations, [
    "package.json",
    "artifacts/marketing-site/package.json",
    "artifacts/marketing-site/.replit-artifact/artifact.toml",
    "playwright.config.ts",
    ".github/workflows",
  ]);
});

test("accepts all checked-in marketing build paths", async () => {
  assert.deepEqual(
    await checkMarketingBuildCredentialContract(rootDirectory),
    [],
  );
});

test("rejects a deployment that bypasses the protected package build", () => {
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    artifactManifest:
      'build = [ "pnpm", "exec", "vite", "build", "--config", "artifacts/marketing-site/vite.config.ts" ]',
  });
  assert.match(
    failures.join("\n"),
    /production deployment must run the protected package build/,
  );
});

test("rejects direct workflow Vite builds without credential validation", () => {
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    workflows: [
      {
        path: ".github/workflows/release.yml",
        text: "run: cd artifacts/marketing-site && pnpm exec vite build",
      },
    ],
  });
  assert.match(
    failures.join("\n"),
    /directly builds the marketing site without running test:clerk-credentials first/,
  );
});

test("keeps Playwright as the only credential exception", () => {
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    workflows: [
      {
        path: ".github/workflows/release.yml",
        text: `env:\n  CLERK_AUTH_BROWSER_TEST: "true"\nrun: pnpm --filter @workspace/marketing-site run build`,
      },
    ],
  });
  assert.match(
    failures.join("\n"),
    /CLERK_AUTH_BROWSER_TEST outside the sole documented Playwright fixture exception/,
  );
});

test("rejects alternate direct Vite builds in every package script", () => {
  const rootPackage = JSON.parse(fixtures.rootPackage);
  rootPackage.scripts.release =
    "pnpm exec vite --config artifacts/marketing-site/vite.config.ts build";
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts["build:alternate"] = "vite build";

  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    rootPackage: JSON.stringify(rootPackage),
    marketingPackage: JSON.stringify(marketingPackage),
  }).join("\n");

  assert.match(failures, /workspace package script "release".*without running/);
  assert.match(
    failures,
    /marketing-site package script "build:alternate".*without running/,
  );
});

test("accepts direct Vite builds only when credential validation runs first", () => {
  const rootPackage = JSON.parse(fixtures.rootPackage);
  rootPackage.scripts.release =
    "pnpm --filter @workspace/marketing-site run test:clerk-credentials && cd artifacts/marketing-site && pnpm exec vite build";

  assert.deepEqual(
    marketingBuildCredentialFailures({
      ...fixtures,
      rootPackage: JSON.stringify(rootPackage),
    }),
    [],
  );

  rootPackage.scripts.release =
    "cd artifacts/marketing-site && pnpm exec vite build && pnpm --filter @workspace/marketing-site run test:clerk-credentials";
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      rootPackage: JSON.stringify(rootPackage),
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("rejects failure-swallowing credential checks before direct builds", () => {
  const rootPackage = JSON.parse(fixtures.rootPackage);
  rootPackage.scripts.release =
    "pnpm --filter @workspace/marketing-site run test:clerk-credentials || pnpm exec vite --config artifacts/marketing-site/vite.config.ts build";
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts["build:fallback"] =
    "pnpm run test:clerk-credentials || true; vite build";

  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    rootPackage: JSON.stringify(rootPackage),
    marketingPackage: JSON.stringify(marketingPackage),
  }).join("\n");

  assert.match(failures, /workspace package script "release".*without running/);
  assert.match(
    failures,
    /marketing-site package script "build:fallback".*without running/,
  );
});

test("rejects swallowed credential failures in the protected prebuild hook", () => {
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts.prebuild =
    "pnpm run test:routing && pnpm run test:clerk-credentials || true";

  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      marketingPackage: JSON.stringify(marketingPackage),
    }).join("\n"),
    /package prebuild must run test:clerk-credentials/,
  );
});

test("rejects credential checks skipped by successful OR branches", () => {
  const rootPackage = JSON.parse(fixtures.rootPackage);
  rootPackage.scripts.release =
    "true || pnpm --filter @workspace/marketing-site run test:clerk-credentials && pnpm exec vite --config artifacts/marketing-site/vite.config.ts build";
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts.prebuild =
    "pnpm run test:routing && true || pnpm run test:clerk-credentials";

  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    rootPackage: JSON.stringify(rootPackage),
    marketingPackage: JSON.stringify(marketingPackage),
  }).join("\n");
  assert.match(failures, /workspace package script "release".*without running/);
  assert.match(failures, /package prebuild must run test:clerk-credentials/);
});

test("requires the exact credential validation script name", () => {
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts.prebuild =
    "pnpm run test:routing && pnpm run test:clerk-credentials:skip";
  marketingPackage.scripts["test:clerk-credentials:skip"] = "echo skipped";

  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      marketingPackage: JSON.stringify(marketingPackage),
    }).join("\n"),
    /package prebuild must run test:clerk-credentials/,
  );
});

test("rejects the browser-only bypass in package scripts and production settings", () => {
  const marketingPackage = JSON.parse(fixtures.marketingPackage);
  marketingPackage.scripts.build =
    "CLERK_AUTH_BROWSER_TEST=true vite build --config vite.config.ts";
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    marketingPackage: JSON.stringify(marketingPackage),
    artifactManifest: `${fixtures.artifactManifest}\nCLERK_AUTH_BROWSER_TEST = "true"`,
  }).join("\n");

  assert.match(failures, /marketing-site package script "build".*browser-only/);
  assert.match(failures, /production deployment uses the browser-only/);
});

test("ignores comments when proving workflow credential validation", () => {
  const workflow =
    "steps:\n  - run: cd artifacts/marketing-site && pnpm exec vite build # TODO: test:clerk-credentials";
  assert.deepEqual(executableWorkflowCommands(workflow), [
    "cd artifacts/marketing-site && pnpm exec vite build",
  ]);
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("does not treat echoed validation text as an executed credential check", () => {
  const workflow =
    'steps:\n  - run: echo "pnpm --filter @workspace/marketing-site run test:clerk-credentials" && cd artifacts/marketing-site && pnpm exec vite build';
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("parses executable multiline workflow commands", () => {
  const workflow = `steps:
  - run: |
      pnpm --filter @workspace/marketing-site run test:clerk-credentials &&
      cd artifacts/marketing-site &&
      pnpm exec vite build`;
  assert.deepEqual(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }),
    [],
  );
});

test("parses block-header comments and folded workflow commands", () => {
  const workflows = [
    {
      path: ".github/workflows/commented-header.yml",
      text: `steps:
  - run: | # Build marketing
      cd artifacts/marketing-site
      pnpm exec vite build`,
    },
    {
      path: ".github/workflows/folded.yml",
      text: `steps:
  - run: >
      cd artifacts/marketing-site &&
      pnpm exec vite
      build`,
    },
  ];
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    workflows,
  }).join("\n");
  assert.match(failures, /commented-header\.yml.*without running/);
  assert.match(failures, /folded\.yml.*without running/);
});

test("accepts a correctly gated quoted workflow command", () => {
  const workflow = `steps:
  - run: "pnpm --filter @workspace/marketing-site run test:clerk-credentials && cd artifacts/marketing-site && pnpm exec vite build"`;
  assert.deepEqual(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }),
    [],
  );
});

test("uses step and default working directories to classify marketing builds", () => {
  const workflows = [
    {
      path: ".github/workflows/step-directory.yml",
      text: `steps:
  - working-directory: artifacts/marketing-site
    run: pnpm exec vite build`,
    },
    {
      path: ".github/workflows/default-directory.yml",
      text: `defaults:
  run:
    working-directory: artifacts/marketing-site
steps:
  - run: pnpm exec vite build`,
    },
    {
      path: ".github/workflows/flow-directory.yml",
      text: 'steps: [{ working-directory: "artifacts/marketing-site", run: "pnpm exec vite build" }]',
    },
  ];

  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    workflows,
  }).join("\n");
  assert.match(failures, /step-directory\.yml.*without running/);
  assert.match(failures, /default-directory\.yml.*without running/);
  assert.match(failures, /flow-directory\.yml.*without running/);
});

test("rejects workflow fallback builds when credential validation fails", () => {
  const workflow = `defaults:
  run:
    working-directory: artifacts/marketing-site
steps:
  - run: pnpm run test:clerk-credentials || pnpm exec vite build`;
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("rejects direct Vite fallbacks after a failed protected package build", () => {
  const workflow = `steps:
  - run: pnpm --filter @workspace/marketing-site run build || cd artifacts/marketing-site && pnpm exec vite build`;
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("ignores commented deployment builds when checking the active command", () => {
  const artifactManifest = fixtures.artifactManifest.replace(
    /^build\s*=.*$/mu,
    '# build = [ "pnpm", "--filter", "@workspace/marketing-site", "run", "build" ]\nbuild = [ "pnpm", "exec", "vite", "build" ]',
  );
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      artifactManifest,
    }).join("\n"),
    /production deployment must run the protected package build/,
  );
});

test("rejects deployment fallbacks after the protected package build", () => {
  const artifactManifest = fixtures.artifactManifest.replace(
    /^build\s*=.*$/mu,
    'build = [ "sh", "-c", "pnpm --filter @workspace/marketing-site run build || pnpm exec vite build" ]',
  );
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      artifactManifest,
    }).join("\n"),
    /production deployment must run the protected package build/,
  );
});

test("parses flow-mapped workflow run commands", () => {
  const workflow =
    'steps: [{ name: "Release", run: "cd artifacts/marketing-site && pnpm exec vite build" }]';
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});

test("parses quoted YAML run keys", () => {
  const workflows = [
    {
      path: ".github/workflows/quoted-block.yml",
      text: `'steps':
  - 'run': cd artifacts/marketing-site && pnpm exec vite build`,
    },
    {
      path: ".github/workflows/quoted-flow.yml",
      text: `steps: [{ "run": "cd artifacts/marketing-site && pnpm exec vite build" }]`,
    },
  ];
  const failures = marketingBuildCredentialFailures({
    ...fixtures,
    workflows,
  }).join("\n");
  assert.match(failures, /quoted-block\.yml.*without running/);
  assert.match(failures, /quoted-flow\.yml.*without running/);
});

test("normalizes shell continuations before detecting workflow builds", () => {
  const workflow = `steps:
  - run: |
      cd artifacts/marketing-site
      pnpm exec vite \\
        build`;
  assert.match(
    marketingBuildCredentialFailures({
      ...fixtures,
      workflows: [{ path: ".github/workflows/release.yml", text: workflow }],
    }).join("\n"),
    /without running test:clerk-credentials first/,
  );
});
