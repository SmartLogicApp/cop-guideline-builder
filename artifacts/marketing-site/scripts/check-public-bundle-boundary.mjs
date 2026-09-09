import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ENTRY_BUDGET_BYTES = 450 * 1024;

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function findChunk(manifest, predicate, description) {
  const matches = Object.entries(manifest).filter(([key, chunk]) =>
    predicate(normalize(key), chunk),
  );
  assert.equal(
    matches.length,
    1,
    `Expected exactly one ${description} chunk in the Vite manifest, found ${matches.length}`,
  );
  return matches[0];
}

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
}) {
  const manifestPath = path.join(outDir, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const [publicKey, publicEntry] = findChunk(
    manifest,
    (_key, chunk) => chunk.isEntry && chunk.src === 'index.html',
    'public entry',
  );
  const [workspaceKey, workspaceEntry] = findChunk(
    manifest,
    (key, chunk) =>
      chunk.isDynamicEntry &&
      (normalize(chunk.src ?? '').endsWith('/index.jsx') ||
        normalize(chunk.src ?? '') === 'index.jsx' ||
        key.endsWith('/index.jsx') ||
        key === 'index.jsx'),
    'private workspace',
  );
  const [authKey, authEntry] = findChunk(
    manifest,
    (key, chunk) =>
      chunk.isDynamicEntry &&
      (normalize(chunk.src ?? '').endsWith('/AuthenticatedApp.tsx') ||
        normalize(chunk.src ?? '') === 'AuthenticatedApp.tsx' ||
        key.endsWith('/AuthenticatedApp.tsx') ||
        key === 'AuthenticatedApp.tsx'),
    'authenticated application',
  );
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

  return {
    publicEntry: publicEntry.file,
    publicEntryBytes,
    privateChunks: privateFiles,
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
    `Bundle boundary verified: public entry ${result.publicEntry} (${result.publicEntryBytes} bytes); private authentication chunks ${result.privateChunks.join(', ')}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}