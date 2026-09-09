import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bundleBoundaryEntries from './bundle-boundary-entries.cjs';

const {
  findChunk,
  findPublicBundleBoundaryEntries,
  normalize,
} = bundleBoundaryEntries;

export const PUBLIC_ENTRY_BUDGET_BYTES = 450 * 1024;
export const PUBLIC_CSS_BUDGET_BYTES = 105 * 1024;

function collectStaticImports(manifest, startKey) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    for (const importedKey of manifest[key]?.imports ?? []) visit(importedKey);
  };
  visit(startKey);
  return visited;
}

function assertNotPubliclyReachable({
  eagerChunks,
  forbiddenKey,
  forbiddenEntry,
  publicEntry,
  description,
}) {
  assert.ok(
    !eagerChunks.has(forbiddenKey),
    `${description} chunk ${forbiddenEntry.file} is eagerly reachable from public entry ${publicEntry.file}`,
  );
}

export async function checkPublicBundleBoundary({
  outDir,
  budgetBytes = PUBLIC_ENTRY_BUDGET_BYTES,
  cssBudgetBytes = PUBLIC_CSS_BUDGET_BYTES,
}) {
  const manifestPath = path.join(outDir, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const {
    publicEntry: [publicKey, publicEntry],
    workspaceEntry: [workspaceKey, workspaceEntry],
    authEntry: [authKey, authEntry],
  } = findPublicBundleBoundaryEntries(manifest);
  const authBoundaryMetadata = JSON.parse(
    await readFile(
      path.join(outDir, '.vite', 'auth-boundary-manifest.json'),
      'utf8',
    ),
  );
  assert.ok(
    Array.isArray(authBoundaryMetadata.clerkChunks) &&
      authBoundaryMetadata.clerkChunks.length > 0,
    'Expected generated auth boundary metadata to identify at least one Clerk chunk',
  );
  const clerkEntries = authBoundaryMetadata.clerkChunks.map((clerkFile) =>
    findChunk(
      manifest,
      (_key, chunk) => normalize(chunk.file ?? '') === normalize(clerkFile),
      `Clerk authentication output ${clerkFile}`,
    ),
  );

  const eagerChunks = collectStaticImports(manifest, publicKey);
  for (const [forbiddenKey, forbiddenEntry, description] of [
    [authKey, authEntry, 'Authenticated application'],
    ...clerkEntries.map(([key, entry]) => [
      key,
      entry,
      'Clerk authentication',
    ]),
    [workspaceKey, workspaceEntry, 'Private workspace'],
  ]) {
    assertNotPubliclyReachable({
      eagerChunks,
      forbiddenKey,
      forbiddenEntry,
      publicEntry,
      description,
    });
  }
  assert.ok(
    (publicEntry.dynamicImports ?? []).includes(authKey),
    `Public entry ${publicEntry.file} must dynamically import authenticated application chunk ${authEntry.file}`,
  );
  const authChunks = collectStaticImports(manifest, authKey);
  for (const [clerkKey, clerkEntry] of clerkEntries) {
    assert.ok(
      authChunks.has(clerkKey),
      `Authenticated application chunk ${authEntry.file} must load Clerk chunk ${clerkEntry.file}`,
    );
  }
  assert.ok(
    (authEntry.dynamicImports ?? []).includes(workspaceKey),
    `Authenticated application chunk ${authEntry.file} must dynamically import private workspace chunk ${workspaceEntry.file}`,
  );

  const privateChunks = new Set([
    ...collectStaticImports(manifest, authKey),
    ...collectStaticImports(manifest, workspaceKey),
  ]);
  const privateChunkFiles = [...privateChunks]
    .filter((key) => !eagerChunks.has(key))
    .flatMap((key) => {
      const chunk = manifest[key];
      return chunk
        ? [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]
        : [];
    })
    .filter(Boolean);
  const privateFiles = [...new Set(privateChunkFiles)];

  const workspaceKeys = [...collectStaticImports(manifest, workspaceKey)]
    .filter((key) => !eagerChunks.has(key));
  const workspaceChunks = [...new Set(
    workspaceKeys.flatMap((key) => {
      const chunk = manifest[key];
      return chunk
        ? [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]
        : [];
    }).filter(Boolean),
  )];
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const privateFile of privateFiles) {
    assert.ok(
      !html.includes(privateFile),
      `Generated HTML must not reference or preload private authentication chunk ${privateFile}`,
    );
  }

  const publicEntryBytes = (await stat(path.join(outDir, publicEntry.file))).size;
  assert.ok(
    publicEntryBytes <= budgetBytes,
    `Public entry ${publicEntry.file} is ${publicEntryBytes} bytes, exceeding the ${budgetBytes}-byte budget`,
  );

  const publicCss = [...new Set(
    [...eagerChunks].flatMap((key) => manifest[key]?.css ?? []),
  )];
  const publicCssBytes = (
    await Promise.all(
      publicCss.map(async (file) => (await stat(path.join(outDir, file))).size),
    )
  ).reduce((total, bytes) => total + bytes, 0);
  assert.ok(
    publicCssBytes <= cssBudgetBytes,
    `Public CSS (${publicCss.join(', ')}) is ${publicCssBytes} bytes, exceeding the ${cssBudgetBytes}-byte budget`,
  );

  const workspaceCss = workspaceChunks.filter((file) => file.endsWith('.css'));
  assert.ok(
    workspaceCss.length > 0,
    'Expected the private workspace to own at least one separately loaded CSS file',
  );

  return {
    publicEntry: publicEntry.file,
    publicEntryBytes,
    privateChunks: privateFiles,
    publicCss,
    publicCssBytes,
    workspaceChunks,
    workspaceCss,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(
    scriptDir,
    '..',
    process.env.BUILD_OUT_DIR ?? 'dist/public',
  );
  const result = await checkPublicBundleBoundary({ outDir });
  console.log(
    `Bundle boundary verified: public entry ${result.publicEntry} (${result.publicEntryBytes} bytes), public CSS ${result.publicCss.join(', ')} (${result.publicCssBytes} bytes); private authentication chunks ${result.privateChunks.join(', ')}; private workspace chunks ${result.workspaceChunks.join(', ')}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}