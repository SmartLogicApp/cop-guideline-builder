import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPublicBundleBoundary } from './check-public-bundle-boundary.mjs';

async function fixture({
  eagerWorkspace = false,
  preloadWorkspace = false,
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
      imports: eagerWorkspace ? ['../../index.jsx'] : [],
      dynamicImports: ['../../index.jsx'],
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
    path.join(outDir, 'index.html'),
    preloadWorkspace
      ? '<link rel="modulepreload" href="/suite/assets/workspace.js">'
      : '<script type="module" src="/suite/assets/public.js"></script>',
  );
  await writeFile(path.join(outDir, 'assets', 'public.js'), 'x'.repeat(publicBytes));
  await writeFile(path.join(outDir, 'assets', 'workspace.js'), 'workspace');
  return outDir;
}

test('accepts a separately loaded workspace within the public-entry budget', async () => {
  const result = await checkPublicBundleBoundary({
    outDir: await fixture(),
    budgetBytes: 100,
  });
  assert.deepEqual(result.workspaceChunks, ['assets/workspace.js']);
});

test('rejects a workspace eagerly imported by the public entry', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ eagerWorkspace: true }),
      budgetBytes: 100,
    }),
    /eagerly referenced/,
  );
});

test('rejects workspace preload references in generated HTML', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ preloadWorkspace: true }),
      budgetBytes: 100,
    }),
    /must not reference or preload/,
  );
});

test('rejects a public entry over budget', async () => {
  await assert.rejects(
    checkPublicBundleBoundary({
      outDir: await fixture({ publicBytes: 101 }),
      budgetBytes: 100,
    }),
    /exceeding the 100-byte budget/,
  );
});