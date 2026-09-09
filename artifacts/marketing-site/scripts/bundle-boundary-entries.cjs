const assert = require('node:assert/strict');

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

function findPublicBundleBoundaryEntries(manifest) {
  return {
    publicEntry: findChunk(
      manifest,
      (_key, chunk) => chunk.isEntry && chunk.src === 'index.html',
      'public entry',
    ),
    workspaceEntry: findChunk(
      manifest,
      (key, chunk) =>
        chunk.isDynamicEntry &&
        (normalize(chunk.src ?? '').endsWith('/workspace-entry.tsx') ||
          normalize(chunk.src ?? '') === 'src/workspace-entry.tsx' ||
          key.endsWith('/workspace-entry.tsx') ||
          key === 'src/workspace-entry.tsx'),
      'private workspace',
    ),
    authEntry: findChunk(
      manifest,
      (key, chunk) =>
        chunk.isDynamicEntry &&
        (normalize(chunk.src ?? '').endsWith('/AuthenticatedApp.tsx') ||
          normalize(chunk.src ?? '') === 'src/AuthenticatedApp.tsx' ||
          normalize(chunk.src ?? '') === 'AuthenticatedApp.tsx' ||
          key.endsWith('/AuthenticatedApp.tsx') ||
          key === 'src/AuthenticatedApp.tsx' ||
          key === 'AuthenticatedApp.tsx'),
      'authenticated application',
    ),
  };
}

module.exports = {
  findChunk,
  findPublicBundleBoundaryEntries,
  normalize,
};