import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";
import { protectedCanvasPaths } from "./validate-canvas-changes.mjs";

const expectedCommand =
  "pnpm install --frozen-lockfile && pnpm --filter @workspace/mockup-sandbox run typecheck && PORT=4173 BASE_PATH=/__mockup NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build";

function workflow(config, name) {
  return config
    .split(/(?=\[\[workflows\.workflow\]\])/)
    .find((section) =>
      new RegExp(`^name\\s*=\\s*\"${name}\"\\s*$`, "m").test(section),
    );
}

const protectedPathsBlock =
  /<!-- canvas-protected-paths:start -->\s*```text\s*\n([\s\S]*?)\n```\s*<!-- canvas-protected-paths:end -->/;

const changedPathsVariable = "CANVAS_RELEASE_CHANGED_PATHS";
export const supportedWorkflowLocations = [
  { type: "file", path: ".replit", fixturePath: ".replit" },
  {
    type: "file",
    path: ".gitlab-ci.yml",
    fixturePath: ".gitlab-ci.yml",
  },
  {
    type: "file",
    path: "bitbucket-pipelines.yml",
    fixturePath: "bitbucket-pipelines.yml",
  },
  { type: "file", path: "Jenkinsfile", fixturePath: "Jenkinsfile" },
  {
    type: "directory",
    path: ".github/workflows",
    fixturePath: ".github/workflows/nested/canvas.yml",
  },
  {
    type: "directory",
    path: ".circleci",
    fixturePath: ".circleci/nested/config.yml",
  },
  {
    type: "directory",
    path: ".buildkite",
    fixturePath: ".buildkite/nested/pipeline.yml",
  },
];

export const releasePathScannerRegistry = [
  {
    path: "scripts/check-canvas-release-contract.mjs",
    semantics: "ascii-only",
  },
  {
    path: "scripts/validate-canvas-changes.mjs",
    semantics: "ascii-only",
  },
];

const unicodeCaseConversion =
  /\.(?:toLowerCase|toLocaleLowerCase|toUpperCase|toLocaleUpperCase)\s*\(/u;

function flowYamlKeyContexts(source, initialAncestors = []) {
  const contexts = [];
  let index = 0;

  function skipWhitespaceAndComments() {
    while (index < source.length) {
      if (/\s/u.test(source[index])) {
        index += 1;
      } else if (source[index] === "#") {
        while (index < source.length && source[index] !== "\n") index += 1;
      } else {
        break;
      }
    }
  }

  function readQuotedScalar() {
    const quote = source[index];
    index += 1;
    let value = "";
    while (index < source.length) {
      const character = source[index];
      if (character === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        index += 1;
        return value;
      }
      if (quote === '"' && character === "\\" && index + 1 < source.length) {
        value += source[index + 1];
        index += 2;
      } else {
        value += character;
        index += 1;
      }
    }
    return value;
  }

  function readMappingKey() {
    skipWhitespaceAndComments();
    if (source[index] === '"' || source[index] === "'") {
      return readQuotedScalar();
    }
    const start = index;
    while (
      index < source.length &&
      ![":", ",", "{", "}", "[", "]"].includes(source[index])
    ) {
      index += 1;
    }
    return source.slice(start, index).trim();
  }

  function skipPlainScalar() {
    while (
      index < source.length &&
      ![",", "}", "]"].includes(source[index])
    ) {
      if (source[index] === '"' || source[index] === "'") {
        readQuotedScalar();
      } else if (source[index] === "#") {
        while (index < source.length && source[index] !== "\n") index += 1;
      } else {
        index += 1;
      }
    }
  }

  function parseValue(ancestors) {
    skipWhitespaceAndComments();
    if (source[index] === "{") {
      parseMapping(ancestors);
    } else if (source[index] === "[") {
      parseSequence(ancestors);
    } else {
      skipPlainScalar();
    }
  }

  function parseMapping(ancestors) {
    index += 1;
    while (index < source.length) {
      skipWhitespaceAndComments();
      if (source[index] === "}") {
        index += 1;
        return;
      }

      const key = readMappingKey();
      skipWhitespaceAndComments();
      if (!key || source[index] !== ":") {
        while (
          index < source.length &&
          source[index] !== "," &&
          source[index] !== "}"
        ) {
          index += 1;
        }
      } else {
        index += 1;
        contexts.push({ key, ancestors });
        parseValue([...ancestors, key]);
      }

      skipWhitespaceAndComments();
      if (source[index] === ",") index += 1;
    }
  }

  function parseSequence(ancestors) {
    index += 1;
    while (index < source.length) {
      skipWhitespaceAndComments();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      parseValue(ancestors);
      skipWhitespaceAndComments();
      if (source[index] === ",") index += 1;
    }
  }

  skipWhitespaceAndComments();
  if (source[index] === "{" || source[index] === "[") {
    parseValue(initialAncestors);
  }
  return contexts;
}

function yamlKeyContexts(text) {
  const contexts = [];
  const ancestors = [];

  for (const lineMatch of text.matchAll(/([^\r\n]*)(?:\r\n|\n|$)/gu)) {
    const line = lineMatch[1];
    const sourceOffset = lineMatch.index;
    if (lineMatch[0] === "") continue;
    if (/^\s*(?:#|$)/u.test(line)) {
      continue;
    }
    const indent = line.match(/^\s*/u)[0].length;
    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].indent >= indent
    ) {
      ancestors.pop();
    }
    const match = line.match(
      /^(\s*)(?:-\s*)?(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_./#@-]+))\s*:/u,
    );
    if (!match) {
      const flowStart = line.search(/^\s*(?:-\s*)?[\[{]/u);
      if (flowStart >= 0) {
        const collectionStart = line.search(/[\[{]/u);
        contexts.push(
          ...flowYamlKeyContexts(
            text.slice(sourceOffset + collectionStart),
            ancestors.map((ancestor) => ancestor.key),
          ),
        );
      }
      continue;
    }

    const key = match[2] ?? match[3] ?? match[4];
    const parentKeys = ancestors.map((ancestor) => ancestor.key);
    contexts.push({
      key,
      ancestors: parentKeys,
    });
    ancestors.push({ indent, key });

    const valueText = line.slice(match[0].length).trimStart();
    if (valueText.startsWith("{") || valueText.startsWith("[")) {
      const valueOffset =
        sourceOffset + match[0].length + line.slice(match[0].length).search(/\S/u);
      contexts.push(
        ...flowYamlKeyContexts(text.slice(valueOffset), [...parentKeys, key]),
      );
    }
  }

  return contexts;
}

function hasWorkflowPathFilter(path, text) {
  const keys = yamlKeyContexts(text);
  if (path.startsWith(".github/workflows/")) {
    const events = new Set([
      "push",
      "pull_request",
      "pull_request_target",
      "merge_group",
    ]);
    if (
      keys.some(
        ({ key, ancestors }) =>
          (key === "paths" || key === "paths-ignore") &&
          ancestors[0] === "on" &&
          ancestors.some((ancestor) => events.has(ancestor)),
      )
    ) {
      return true;
    }
  }
  if (path === ".gitlab-ci.yml") {
    if (
      keys.some(
        ({ key, ancestors }) =>
          key === "changes" &&
          ancestors.some((ancestor) =>
            ["rules", "only", "except"].includes(ancestor),
          ),
      )
    ) {
      return true;
    }
  }
  if (path === "bitbucket-pipelines.yml") {
    if (
      keys.some(
        ({ key, ancestors }) =>
          (key === "includePaths" || key === "excludePaths") &&
          ancestors.includes("changesets"),
      )
    ) {
      return true;
    }
  }
  if (
    path === "Jenkinsfile" &&
    /(?:^|\{)\s*changeset\b\s*(?:\(\s*)?(?:["']|\b(?:glob|pattern)\s*:)/mu.test(
      text,
    )
  ) {
    return true;
  }
  if (
    path.startsWith(".circleci/") &&
    (keys.some(({ key }) => key === "path-filtering/filter") ||
      /circleci\/path-filtering@/u.test(text))
  ) {
    return true;
  }
  if (
    path.startsWith(".buildkite/") &&
    keys.some(
      ({ key }) =>
        key.startsWith("monorepo-diff#") ||
        key.startsWith("changed-files#") ||
        key === "monorepo-diff" ||
        key === "changed-files",
    )
  ) {
    return true;
  }

  return false;
}

function hasFindPathScanner(text) {
  return (
    /(?:^|[;&|]\s*|\$\()\s*(?:-\s*)?(?:command\s+)?find(?:\s|$)/mu.test(
      text,
    ) ||
    /^\s*(?:-\s*)?(?:run|script|command|commands)\s*:\s*(?:[>|][-+]?\s*)?(?:command\s+)?find(?:\s|$)/mu.test(
      text,
    ) ||
    /\b(?:execFileSync|spawnSync)\s*\(\s*["']find["']/u.test(text)
  );
}

// Buildkite has no provider-native changed-path condition. Its common
// monorepo-diff and changed-files plugins are classified above; arbitrary
// third-party plugins cannot be inferred safely from ordinary YAML keys.
function looksLikeReleasePathScanner({ path, text }) {
  if (path.startsWith("scripts/") && /\.test\.[cm]?[jt]s$/u.test(path)) {
    return false;
  }

  return (
    /(?:--name-only|CANVAS_RELEASE_CHANGED_PATHS)/u.test(text) ||
    (/\breaddir\b/u.test(text) && /\brelative\b/u.test(text)) ||
    hasFindPathScanner(text) ||
    hasWorkflowPathFilter(path, text)
  );
}

export function releasePathScannerAuditFailures(
  entryPoints,
  registry = releasePathScannerRegistry,
) {
  const failures = [];
  const discovered = entryPoints.filter(looksLikeReleasePathScanner);
  const discoveredByPath = new Map(discovered.map((entry) => [entry.path, entry]));
  const registeredPaths = new Set();

  for (const [index, registration] of registry.entries()) {
    const label = `release path scanner registry entry ${index + 1}`;
    if (
      !registration ||
      typeof registration !== "object" ||
      Array.isArray(registration) ||
      typeof registration.path !== "string" ||
      registration.path.trim() === ""
    ) {
      failures.push(`${label} must declare a non-empty path`);
      continue;
    }
    if (
      registration.semantics !== "ascii-only" &&
      registration.semantics !== "documented-unicode"
    ) {
      failures.push(
        `${label} for ${JSON.stringify(registration.path)} must declare "ascii-only" or "documented-unicode" semantics`,
      );
    }
    if (registeredPaths.has(registration.path)) {
      failures.push(
        `${label} duplicates registered scanner ${JSON.stringify(registration.path)}`,
      );
    }
    registeredPaths.add(registration.path);

    const entryPoint = discoveredByPath.get(registration.path);
    if (!entryPoint) {
      failures.push(
        `${label} references ${JSON.stringify(registration.path)}, but automatic inventory did not identify it as a release path scanner`,
      );
    } else if (
      registration.semantics === "ascii-only" &&
      unicodeCaseConversion.test(entryPoint.text)
    ) {
      failures.push(
        `${registration.path} declares ASCII-only path semantics but uses Unicode-aware case conversion; use an explicit ASCII A-Z fold`,
      );
    }
  }

  for (const { path } of discovered) {
    if (!registeredPaths.has(path)) {
      failures.push(
        `automatically discovered release path scanner ${JSON.stringify(path)} is unaudited; add it to releasePathScannerRegistry with "ascii-only" semantics or document and register its intentional Unicode semantics`,
      );
    }
  }

  return failures;
}

export function protectedCanvasPathDeclarationFailures(
  paths = protectedCanvasPaths,
) {
  const failures = [];
  for (const [index, path] of paths.entries()) {
    if (typeof path !== "string") continue;
    if (/[^\x00-\x7f]/u.test(path)) {
      failures.push(
        `protected Canvas path entry ${index + 1} must contain ASCII characters only; received ${JSON.stringify(path)}`,
      );
    }
  }
  return failures;
}

function workflowPathFailure(value) {
  if (
    posix.isAbsolute(value) ||
    win32.isAbsolute(value) ||
    win32.parse(value).root !== ""
  ) {
    return "must be relative to the repository";
  }

  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return "must not escape the repository with parent traversal";
  }

  return null;
}

function normalizedWorkflowPath(value) {
  return (
    posix
      .normalize(value.replaceAll("\\", "/"))
      .replace(/\/+$/, "")
      || "/"
  );
}

// Declaration paths are ASCII-only, and portability comparisons fold only
// ASCII A-Z. Unicode normalization/case-folding is deliberately unsupported
// because filesystem behavior differs across Linux, macOS, and Windows.
function foldAsciiPath(value) {
  return value.replace(/[A-Z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x20),
  );
}

export function workflowLocationShapeFailures(
  locations = supportedWorkflowLocations,
) {
  const failures = [];
  for (const [index, location] of locations.entries()) {
    const entry = `supported workflow location entry ${index + 1}`;
    if (!location || typeof location !== "object" || Array.isArray(location)) {
      failures.push(`${entry} must be an object`);
      continue;
    }

    if (location.type !== "file" && location.type !== "directory") {
      failures.push(
        `${entry} field "type" must be "file" or "directory"; received ${JSON.stringify(location.type)}`,
      );
    }
    for (const field of ["path", "fixturePath"]) {
      if (typeof location[field] !== "string" || location[field].trim() === "") {
        failures.push(
          `${entry} field "${field}" must be a non-empty string; received ${JSON.stringify(location[field])}`,
        );
        continue;
      }

      if (/[^\x00-\x7f]/u.test(location[field])) {
        failures.push(
          `${entry} field "${field}" must contain ASCII characters only; received ${JSON.stringify(location[field])}`,
        );
        continue;
      }

      const pathFailure = workflowPathFailure(location[field]);
      if (pathFailure) {
        failures.push(
          `${entry} field "${field}" ${pathFailure}; received ${JSON.stringify(location[field])}`,
        );
        continue;
      }

      const canonicalPath = normalizedWorkflowPath(location[field]);
      if (location[field] !== canonicalPath) {
        failures.push(
          `${entry} field "${field}" uses non-canonical workflow path ${JSON.stringify(location[field])}; use ${JSON.stringify(canonicalPath)} instead`,
        );
      }
    }

    const hasValidPaths = ["path", "fixturePath"].every(
      (field) =>
        typeof location[field] === "string" && location[field].trim() !== "",
    );
    if (!hasValidPaths) continue;

    if (location.type === "file" && location.fixturePath !== location.path) {
      failures.push(
        `${entry} has conflicting fields: file fixturePath ${JSON.stringify(location.fixturePath)} must equal path ${JSON.stringify(location.path)}`,
      );
    }
    if (location.type === "directory") {
      const fixtureRelativePath = relative(
        location.path,
        location.fixturePath,
      );
      if (
        fixtureRelativePath === "" ||
        fixtureRelativePath === ".." ||
        fixtureRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(fixtureRelativePath)
      ) {
        failures.push(
          `${entry} has conflicting fields: directory fixturePath ${JSON.stringify(location.fixturePath)} must be nested under path ${JSON.stringify(location.path)}`,
        );
      }
    }
  }
  return failures;
}

export function duplicateWorkflowLocationFailures(
  locations = supportedWorkflowLocations,
) {
  const failures = [];
  for (const key of ["path", "fixturePath"]) {
    const seen = new Map();
    for (const location of locations) {
      const value = location?.[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      const normalizedValue = normalizedWorkflowPath(value);
      const portableValue = foldAsciiPath(normalizedValue);
      const originalValue = seen.get(portableValue);
      if (originalValue !== undefined) {
        if (normalizedWorkflowPath(originalValue) === normalizedValue) {
          failures.push(
            `duplicate supported workflow ${key} entries ${JSON.stringify(originalValue)} and ${JSON.stringify(value)} normalize to ${JSON.stringify(normalizedValue)}`,
          );
        } else {
          failures.push(
            `case-colliding supported workflow ${key} entries ${JSON.stringify(originalValue)} and ${JSON.stringify(value)} are not portable; use one canonical spelling`,
          );
        }
      } else {
        seen.set(portableValue, value);
      }
    }
  }
  return failures;
}

function isPathNestedUnder(parentPath, childPath) {
  const nestedPath = relative(parentPath, childPath);
  return (
    nestedPath !== "" &&
    nestedPath !== ".." &&
    !nestedPath.startsWith(`..${sep}`) &&
    !isAbsolute(nestedPath)
  );
}

function isPathContainedBy(parentPath, childPath) {
  const containedPath = relative(parentPath, childPath);
  return (
    containedPath === "" ||
    (containedPath !== ".." &&
      !containedPath.startsWith(`..${sep}`) &&
      !isAbsolute(containedPath))
  );
}

export function overlappingWorkflowLocationFailures(
  locations = supportedWorkflowLocations,
) {
  const validLocations = locations.filter(
    (location) =>
      location &&
      typeof location === "object" &&
      !Array.isArray(location) &&
      (location.type === "file" || location.type === "directory") &&
      typeof location.path === "string" &&
      location.path.trim() !== "",
  );
  const failures = [];

  for (const [index, first] of validLocations.entries()) {
    for (const second of validLocations.slice(index + 1)) {
      let directory;
      let covered;

      if (
        first.type === "directory" &&
        isPathNestedUnder(first.path, second.path)
      ) {
        directory = first;
        covered = second;
      } else if (
        second.type === "directory" &&
        isPathNestedUnder(second.path, first.path)
      ) {
        directory = second;
        covered = first;
      } else {
        continue;
      }

      failures.push(
        `overlapping supported workflow locations: ${covered.type} "${covered.path}" is already covered by directory "${directory.path}"`,
      );
    }
  }

  return failures;
}

function isJsonArrayProducer(line) {
  const assignment = line.match(
    /CANVAS_RELEASE_CHANGED_PATHS\s*(?::|=)\s*(.*)$/,
  );
  if (!assignment) {
    return false;
  }

  let value = assignment[1].trim().replace(/[;,]\s*$/, "");
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.every((path) => typeof path === "string");
    } catch {
      return false;
    }
  }

  return false;
}

export function unsafeChangedPathProducers(workflowConfigs) {
  const unsafe = [];
  for (const { path, text } of workflowConfigs) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const trimmedLine = line.trimStart();
      if (
        line.includes(changedPathsVariable) &&
        !trimmedLine.startsWith("#") &&
        !trimmedLine.startsWith("//") &&
        !isJsonArrayProducer(line)
      ) {
        unsafe.push(`${path}:${index + 1}`);
      }
    }
  }
  return unsafe;
}

function externalWorkflowLocationError(rootDirectory, path) {
  return new Error(
    `supported workflow location "${relative(rootDirectory, path)}" resolves outside the repository`,
  );
}

function assertNoCaseCollidingWorkflowEntries(
  entries,
  directory,
  rootDirectory,
) {
  const seen = new Map();
  for (const entry of entries) {
    const foldedName = foldAsciiPath(entry.name);
    const originalName = seen.get(foldedName);
    if (originalName !== undefined && originalName !== entry.name) {
      const firstPath = normalizedWorkflowPath(
        relative(rootDirectory, resolve(directory, originalName)),
      );
      const secondPath = normalizedWorkflowPath(
        relative(rootDirectory, resolve(directory, entry.name)),
      );
      throw new Error(
        `case-colliding workflow paths "${firstPath}" and "${secondPath}" are unsupported; rename one so workflow discovery is identical on case-sensitive and case-insensitive filesystems`,
      );
    }
    seen.set(foldedName, entry.name);
  }
}

function assertAsciiWorkflowEntries(entries, directory, rootDirectory) {
  for (const entry of entries) {
    if (/[^\x00-\x7f]/u.test(entry.name)) {
      const path = normalizedWorkflowPath(
        relative(rootDirectory, resolve(directory, entry.name)),
      );
      throw new Error(
        `workflow path ${JSON.stringify(path)} must contain ASCII characters only; non-ASCII workflow names are unsupported so discovery is identical across filesystems`,
      );
    }
  }
}

// Supported runtimes/filesystems must expose a stable, non-zero inode together
// with its device ID through Node's bigint Stats API. This is the portable
// identity Node provides for hard links on supported Unix and Windows filesystems.
// Failing explicitly is safer than silently emitting duplicate diagnostics.
export function workflowFileIdentity(file, path = "workflow file") {
  if (
    typeof file?.dev !== "bigint" ||
    typeof file?.ino !== "bigint" ||
    file.dev < 0n ||
    file.ino <= 0n
  ) {
    throw new Error(
      `cannot determine stable file identity for "${path}": this runtime/filesystem must provide non-negative bigint stat.dev and positive bigint stat.ino values`,
    );
  }
  return `${file.dev}:${file.ino}`;
}

async function filesBelow(
  directory,
  rootDirectory,
  resolvedRootDirectory,
  ancestorDirectories = new Set(),
  traversalCache = new Map(),
  readDirectory = readdir,
) {
  let resolvedDirectory;
  try {
    resolvedDirectory = await realpath(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  if (!isPathContainedBy(resolvedRootDirectory, resolvedDirectory)) {
    throw externalWorkflowLocationError(rootDirectory, directory);
  }
  if (ancestorDirectories.has(resolvedDirectory)) {
    throw new Error(
      `supported workflow location "${relative(rootDirectory, directory)}" resolves to a recursive directory symlink, which is intentionally unsupported`,
    );
  }
  const cachedRelativeFiles = traversalCache.get(resolvedDirectory);
  if (cachedRelativeFiles) {
    return cachedRelativeFiles.map((path) => resolve(directory, path));
  }

  let entries;
  try {
    entries = await readDirectory(resolvedDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  assertAsciiWorkflowEntries(entries, directory, rootDirectory);
  entries.sort((first, second) =>
    first.name < second.name ? -1 : first.name > second.name ? 1 : 0,
  );
  assertNoCaseCollidingWorkflowEntries(entries, directory, rootDirectory);

  const nestedAncestors = new Set(ancestorDirectories).add(resolvedDirectory);
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await filesBelow(
          path,
          rootDirectory,
          resolvedRootDirectory,
          nestedAncestors,
           traversalCache,
           readDirectory,
        )),
      );
    } else if (entry.isFile()) {
      files.push(path);
    } else if (entry.isSymbolicLink()) {
      const resolvedPath = await realpath(path);
      if (!isPathContainedBy(resolvedRootDirectory, resolvedPath)) {
        throw externalWorkflowLocationError(rootDirectory, path);
      }
      const target = await stat(resolvedPath);
      if (target.isDirectory()) {
        files.push(
          ...(await filesBelow(
            path,
            rootDirectory,
            resolvedRootDirectory,
            nestedAncestors,
             traversalCache,
             readDirectory,
          )),
        );
      } else if (target.isFile()) {
        files.push(path);
      }
    }
  }
  traversalCache.set(
    resolvedDirectory,
    files.map((path) => relative(directory, path)),
  );
  return files;
}

export async function readCheckedInWorkflowConfigs(
  rootDirectory,
  { readDirectory = readdir } = {},
) {
  const resolvedRootDirectory = await realpath(rootDirectory);
  const traversalCache = new Map();
  const candidates = [];
  for (const location of supportedWorkflowLocations) {
    const absolutePath = resolve(rootDirectory, location.path);
    if (location.type === "file") {
      candidates.push(absolutePath);
    } else {
      candidates.push(
        ...(await filesBelow(
          absolutePath,
          rootDirectory,
          resolvedRootDirectory,
           new Set(),
           traversalCache,
           readDirectory,
        )),
      );
    }
  }

  const configs = [];
  const seenResolvedPaths = new Set();
  const seenFileIdentities = new Set();
  for (const path of candidates) {
    try {
      const resolvedPath = await realpath(path);
      if (!isPathContainedBy(resolvedRootDirectory, resolvedPath)) {
        throw externalWorkflowLocationError(rootDirectory, path);
      }
      if (seenResolvedPaths.has(resolvedPath)) continue;
      seenResolvedPaths.add(resolvedPath);
      const file = await stat(resolvedPath, { bigint: true });
      const fileIdentity = workflowFileIdentity(
        file,
        relative(rootDirectory, path),
      );
      if (seenFileIdentities.has(fileIdentity)) continue;
      seenFileIdentities.add(fileIdentity);
      configs.push({
        path: normalizedWorkflowPath(relative(rootDirectory, path)),
        text: await readFile(resolvedPath, "utf8"),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return configs;
}

export async function readReleaseCheckEntryPoints(
  rootDirectory,
  workflowLocations = supportedWorkflowLocations,
) {
  const resolvedRootDirectory = await realpath(rootDirectory);
  const candidates = await filesBelow(
    resolve(rootDirectory, "scripts"),
    rootDirectory,
    resolvedRootDirectory,
  );
  for (const location of workflowLocations) {
    const path = resolve(rootDirectory, location.path);
    if (location.type === "file") {
      candidates.push(path);
    } else {
      candidates.push(
        ...(await filesBelow(
          path,
          rootDirectory,
          resolvedRootDirectory,
        )),
      );
    }
  }
  const entryPoints = [];
  const seenPaths = new Set();
  for (const path of candidates) {
    const repositoryPath = normalizedWorkflowPath(
      relative(rootDirectory, path),
    );
    if (seenPaths.has(repositoryPath)) continue;
    seenPaths.add(repositoryPath);
    if (
      repositoryPath.split("/").some((segment) =>
        ["node_modules", ".git", "dist", "coverage"].includes(segment),
      )
    ) {
      continue;
    }
    try {
      const resolvedPath = await realpath(path);
      if (!isPathContainedBy(resolvedRootDirectory, resolvedPath)) {
        throw externalWorkflowLocationError(rootDirectory, path);
      }
      const file = await stat(resolvedPath);
      if (!file.isFile()) continue;
      entryPoints.push({
        path: repositoryPath,
        text: await readFile(resolvedPath, "utf8"),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return entryPoints;
}

export function documentedProtectedCanvasPaths(documentationText) {
  const match = documentationText.match(protectedPathsBlock);
  if (!match) {
    return null;
  }

  return match[1]
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

export function checkCanvasReleaseContract(
  replitConfig,
  packageJsonText,
  changedPathGuardText,
  documentationText,
  executableProtectedPaths = protectedCanvasPaths,
  workflowConfigs = [],
  workflowLocations = supportedWorkflowLocations,
  releaseCheckEntryPoints = [],
  scannerRegistry = releasePathScannerRegistry,
) {
  const failures = [
    ...protectedCanvasPathDeclarationFailures(executableProtectedPaths),
    ...workflowLocationShapeFailures(workflowLocations),
    ...duplicateWorkflowLocationFailures(workflowLocations),
    ...overlappingWorkflowLocationFailures(workflowLocations),
    ...releasePathScannerAuditFailures(releaseCheckEntryPoints, scannerRegistry),
  ];
  const unsafeProducers = unsafeChangedPathProducers(workflowConfigs);
  if (unsafeProducers.length > 0) {
    failures.push(
      `${changedPathsVariable} producer(s) at ${unsafeProducers.join(
        ", ",
      )} must be a provable JSON array of path strings; do not use newline-delimited paths or an unverified dynamic serializer. Assign a JSON array literal, or extend this contract with a tested array-producing form.`,
    );
  }
  const canvasWorkflow = workflow(replitConfig, "canvas-release");

  if (!canvasWorkflow) {
    failures.push(
      'missing the "canvas-release" workflow registration in .replit',
    );
  } else {
    if (!/^isValidation\s*=\s*true\s*$/m.test(canvasWorkflow)) {
      failures.push(
        'the "canvas-release" workflow is not registered as a validation',
      );
    }
    if (
      !/^args\s*=\s*"pnpm run validate:canvas:changed"\s*$/m.test(
        canvasWorkflow,
      )
    ) {
      failures.push(
        'the "canvas-release" validation does not run "pnpm run validate:canvas:changed"',
      );
    }
  }

  const contractWorkflow = workflow(replitConfig, "canvas-release-contract");
  if (
    !contractWorkflow ||
    !/^isValidation\s*=\s*true\s*$/m.test(contractWorkflow) ||
    !/^args\s*=\s*"pnpm run test:canvas-release-contract"\s*$/m.test(
      contractWorkflow,
    )
  ) {
    failures.push(
      'the independent "canvas-release-contract" validation is not registered correctly',
    );
  }

  const documentedPaths =
    typeof documentationText === "string"
      ? documentedProtectedCanvasPaths(documentationText)
      : null;
  if (!documentedPaths) {
    failures.push(
      "the Canvas release documentation is missing its protected-path contract block",
    );
  } else if (
    documentedPaths.length !== executableProtectedPaths.length ||
    documentedPaths.some((path, index) => path !== executableProtectedPaths[index])
  ) {
    failures.push(
      "the documented protected paths do not match the executable protected paths (a trailing slash means directory-prefix matching; paths without one match exactly)",
    );
  }

  const scripts = JSON.parse(packageJsonText).scripts;
  const contractCommand = scripts?.["test:canvas-release-contract"];
  if (
    typeof contractCommand !== "string" ||
    !contractCommand.includes("scripts/check-canvas-release-contract.test.mjs") ||
    !contractCommand.includes("scripts/validate-canvas-changes.test.mjs")
  ) {
    failures.push(
      'the "test:canvas-release-contract" package command must run both the release contract and changed-path fixtures',
    );
  }

  const guardedCommand = scripts?.["validate:canvas:changed"];
  if (guardedCommand !== "node scripts/validate-canvas-changes.mjs") {
    failures.push(
      'the "validate:canvas:changed" package command does not run the path guard',
    );
  }

  if (
    typeof changedPathGuardText !== "string" ||
    !/spawnSync\("pnpm", \["run", "validate:canvas"\]/.test(
      changedPathGuardText,
    ) ||
    !/process\.exitCode\s*=\s*result\.status\s*\?\?\s*1/.test(
      changedPathGuardText,
    )
  ) {
    failures.push(
      "the Canvas path guard does not run the canonical validation and propagate failures",
    );
  }

  const command = scripts?.["validate:canvas"];
  if (typeof command !== "string") {
    failures.push('missing the "validate:canvas" package command');
  } else if (command !== expectedCommand) {
    if (!command.includes("pnpm install --frozen-lockfile")) {
      failures.push('missing frozen-lockfile install from "validate:canvas"');
    }
    if (
      !command.includes("pnpm --filter @workspace/mockup-sandbox run typecheck")
    ) {
      failures.push('missing Canvas typecheck from "validate:canvas"');
    }
    if (
      !command.includes(
        "NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build",
      )
    ) {
      failures.push('missing Canvas production build from "validate:canvas"');
    }
    if (failures.length === 0) {
      failures.push(
        '"validate:canvas" must use the canonical ordered && command so every protection gates release',
      );
    }
  }

  return failures;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rootDirectory = resolve(new URL("..", import.meta.url).pathname);
  const workflowLocationFailures = workflowLocationShapeFailures();
  const [
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
    workflowConfigs,
    releaseCheckEntryPoints,
  ] =
    await Promise.all([
      readFile(new URL("../.replit", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("./validate-canvas-changes.mjs", import.meta.url), "utf8"),
      readFile(new URL("../docs/canvas-release-gate.md", import.meta.url), "utf8"),
      workflowLocationFailures.length === 0
        ? readCheckedInWorkflowConfigs(rootDirectory)
        : Promise.resolve([]),
      readReleaseCheckEntryPoints(rootDirectory),
    ]);
  const failures = checkCanvasReleaseContract(
    replitConfig,
    packageJsonText,
    changedPathGuardText,
    documentationText,
    protectedCanvasPaths,
    workflowConfigs,
    supportedWorkflowLocations,
    releaseCheckEntryPoints,
  );
  failures.push(...workflowLocationFailures.filter(
    (failure) => !failures.includes(failure),
  ));

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Canvas release contract failed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Canvas release contract passed.");
  }
}
