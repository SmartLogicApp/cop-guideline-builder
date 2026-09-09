import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ENTRY_BUDGET_BYTES = 650 * 1024;

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

  const eagerChunks = collectStaticImports(manifest, publicKey);
  assert.ok(
    !eagerChunks.has(workspaceKey),
    `Private workspace chunk ${workspaceEntry.file} is eagerly referenced by public entry ${publicEntry.file}`,
  );
  assert.ok(
    (publicEntry.dynamicImports ?? []).includes(workspaceKey),
    `Public entry ${publicEntry.file} must dynamically import private workspace chunk ${workspaceEntry.file}`,
  );

  const workspaceChunks = [...collectStaticImports(manifest, workspaceKey)]
    .filter((key) => !eagerChunks.has(key))
    .map((key) => manifest[key]?.file)
    .filter(Boolean);
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const workspaceFile of workspaceChunks) {
    assert.ok(
      !html.includes(workspaceFile),
      `Generated HTML must not reference or preload private workspace chunk ${workspaceFile}`,
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
    workspaceChunks,
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
    `Bundle boundary verified: public entry ${result.publicEntry} (${result.publicEntryBytes} bytes); private workspace chunks ${result.workspaceChunks.join(', ')}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}