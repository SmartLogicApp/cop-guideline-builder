import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkPublicBundleBoundary } from './check-public-bundle-boundary.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

async function fixture({
  eagerPrivateChunk,
  preloadPrivateChunk,
  virtualWorkspace = false,
  clerkFile = 'assets/clerk-auth.js',
  publicBytes = 20,
  publicCssBytes = 20,
  includeWorkspaceCss = true,
} = {}) {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'bundle-boundary-'));
  const workspaceKey = virtualWorkspace ? '_workspace-entry-hash.js' : 'src/workspace-entry.tsx';
  await mkdir(path.join(outDir, '.vite'), { recursive: true });
  await mkdir(path.join(outDir, 'assets'), { recursive: true });
  const manifest = {
    'index.html': {
      file: 'assets/public.js',
      src: 'index.html',
      isEntry: true,
      imports: eagerPrivateChunk ? [eagerPrivateChunk] : [],
      dynamicImports: ['src/AuthenticatedApp.tsx'],
      css: ['assets/public.css'],
    },
    'src/AuthenticatedApp.tsx': {
      file: 'assets/authenticated-app.js',
      src: 'src/AuthenticatedApp.tsx',
      isDynamicEntry: true,
      imports: ['_clerk-auth.js'],
       dynamicImports: [workspaceKey],
      css: ['assets/authenticated-app.css'],
    },
    '_clerk-auth.js': {
      file: 'assets/clerk-auth.js',
    },
     [workspaceKey]: {
      file: 'assets/workspace.js',
       ...(virtualWorkspace ? {} : { src: 'src/workspace-entry.tsx' }),
      isDynamicEntry: true,
      css: includeWorkspaceCss ? ['assets/workspace.css'] : [],
    },
  };
  await writeFile(
    path.join(outDir, '.vite', 'manifest.json'),
    JSON.stringify(manifest),
  );
  await writeFile(
    path.join(outDir, '.vite', 'auth-boundary-manifest.json'),
    JSON.stringify({ clerkChunks: [clerkFile] }),
  );
  await writeFile(
    path.join(outDir, 'index.html'),
    preloadPrivateChunk
      ? `<link rel="modulepreload" href="/suite/${preloadPrivateChunk}">`
      : '<script type="module" src="/suite/assets/public.js"></script>',
  );
  await writeFile(path.join(outDir, 'assets', 'public.js'), 'x'.repeat(publicBytes));
  await writeFile(path.join(outDir, 'assets', 'authenticated-app.js'), 'authenticated');
  await writeFile(path.join(outDir, 'assets', 'authenticated-app.css'), '.auth{}');
  await writeFile(path.join(outDir, 'assets', 'clerk-auth.js'), 'clerk');
  await writeFile(path.join(outDir, 'assets', 'public.css'), 'x'.repeat(publicCssBytes));
  await writeFile(path.join(outDir, 'assets', 'workspace.js'), 'workspace');
  await writeFile(path.join(outDir, 'assets', 'workspace.css'), 'workspace');
  return outDir;
}

test('accepts separately loaded authentication and workspace chunks', async () => {
  const result = await checkPublicBundleBoundary({
    outDir: await fixture(),
    budgetBytes: 100,
    cssBudgetBytes: 100,
  });
  assert.deepEqual(result.privateChunks, [
    'assets/authenticated-app.js',
    'assets/authenticated-app.css',
    'assets/clerk-auth.js',
    'assets/workspace.js',
    'assets/workspace.css',
  ]);
  assert.deepEqual(result.workspaceChunks, [
    'assets/workspace.js',
    'assets/workspace.css',
  ]);
});

test('accepts an auth-only virtual workspace chunk emitted by Vite', async () => {
  const result = await checkPublicBundleBoundary({
    outDir: await fixture({ virtualWorkspace: true }),
    budgetBytes: 100,
    cssBudgetBytes: 100,
  });
  assert.deepEqual(result.workspaceChunks, ['assets/workspace.js', 'assets/workspace.css']);
});

test('rejects Clerk modules bundled into the public entry itself', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ clerkFile: 'assets/public.js' }),
      budgetBytes: 100,
      cssBudgetBytes: 100,
    }),
    /Clerk authentication chunk .* is eagerly reachable/,
  );
});

for (const [description, manifestKey] of [
  ['authenticated application', 'src/AuthenticatedApp.tsx'],
  ['Clerk authentication', '_clerk-auth.js'],
  ['private workspace', 'src/workspace-entry.tsx'],
]) {
  test(`rejects an eagerly reachable ${description} chunk`, async () => {
    await assert.rejects(
      checkPublicBundleBoundary({
        outDir: await fixture({ eagerPrivateChunk: manifestKey }),
        budgetBytes: 100,
      }),
      /eagerly reachable/,
    );
  });
}

for (const privateFile of [
  'assets/authenticated-app.js',
  'assets/authenticated-app.css',
  'assets/clerk-auth.js',
  'assets/workspace.js',
  'assets/workspace.css',
]) {
  test(`rejects an HTML preload of ${privateFile}`, async () => {
    await assert.rejects(
      checkPublicBundleBoundary({
        outDir: await fixture({ preloadPrivateChunk: privateFile }),
        budgetBytes: 100,
      }),
      /must not reference or preload/,
    );
  });
}

test('rejects a public entry over budget', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ publicBytes: 101 }),
      budgetBytes: 100,
      cssBudgetBytes: 100,
    }),
    /exceeding the 100-byte budget/,
  );
});

test('rejects public CSS over budget', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ publicCssBytes: 101 }),
      budgetBytes: 100,
      cssBudgetBytes: 100,
    }),
    /Public CSS .* exceeding the 100-byte budget/,
  );
});

test('rejects a workspace without separately loaded CSS', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ includeWorkspaceCss: false }),
      budgetBytes: 100,
      cssBudgetBytes: 100,
    }),
    /separately loaded CSS file/,
  );
});

test('keeps public and workspace Tailwind sources separated', async () => {
  const [publicCss, authCss, workspaceCss] = await Promise.all([
    readFile(path.join(scriptDir, '..', 'src', 'index.css'), 'utf8'),
    readFile(path.join(scriptDir, '..', 'src', 'auth.css'), 'utf8'),
    readFile(path.join(scriptDir, '..', 'src', 'workspace.css'), 'utf8'),
  ]);

  assert.match(publicCss, /@import 'tailwindcss' source\(none\);/);
  assert.doesNotMatch(publicCss, /AuthenticatedApp/);
  assert.doesNotMatch(publicCss, /index\.jsx/);
  assert.match(authCss, /@source '\.\/AuthenticatedApp\.tsx';/);
  assert.match(workspaceCss, /@source '\.\.\/\.\.\/\.\.\/index\.jsx';/);
});