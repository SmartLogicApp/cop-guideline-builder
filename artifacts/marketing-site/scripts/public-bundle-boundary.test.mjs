import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPublicBundleBoundary } from './check-public-bundle-boundary.mjs';

async function fixture({
  eagerPrivateChunk,
  preloadPrivateChunk,
  clerkFile = 'assets/clerk-auth.js',
  publicBytes = 20,
} = {}) {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'bundle-boundary-'));
  await mkdir(path.join(outDir, '.vite'), { recursive: true });
  await mkdir(path.join(outDir, 'assets'), { recursive: true });
  const manifest = {
    'index.html': {
      file: 'assets/public.js',
      src: 'index.html',
      isEntry: true,
      imports: eagerPrivateChunk ? [eagerPrivateChunk] : [],
      dynamicImports: ['src/AuthenticatedApp.tsx'],
    },
    'src/AuthenticatedApp.tsx': {
      file: 'assets/authenticated-app.js',
      src: 'src/AuthenticatedApp.tsx',
      isDynamicEntry: true,
      imports: ['_clerk-auth.js'],
      dynamicImports: ['../../index.jsx'],
      css: ['assets/authenticated-app.css'],
    },
    '_clerk-auth.js': {
      file: 'assets/clerk-auth.js',
    },
    '../../index.jsx': {
      file: 'assets/workspace.js',
      src: '../../index.jsx',
      isDynamicEntry: true,
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
  await writeFile(path.join(outDir, 'assets', 'workspace.js'), 'workspace');
  return outDir;
}

test('accepts separately loaded authentication and workspace chunks', async () => {
  const result = await checkPublicBundleBoundary({
    outDir: await fixture(),
    budgetBytes: 100,
  });
  assert.deepEqual(result.privateChunks, [
    'assets/authenticated-app.js',
    'assets/authenticated-app.css',
    'assets/clerk-auth.js',
    'assets/workspace.js',
  ]);
});

test('rejects Clerk modules bundled into the public entry itself', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ clerkFile: 'assets/public.js' }),
      budgetBytes: 100,
    }),
    /Clerk authentication chunk .* is eagerly reachable/,
  );
});

for (const [description, manifestKey] of [
  ['authenticated application', 'src/AuthenticatedApp.tsx'],
  ['Clerk authentication', '_clerk-auth.js'],
  ['private workspace', '../../index.jsx'],
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
    }),
    /exceeding the 100-byte budget/,
  );
});