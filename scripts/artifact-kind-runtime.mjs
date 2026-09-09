const ARTIFACT_KIND_DEFINITIONS = {
  api: { browserRuntime: false },
  design: { browserRuntime: true },
  "design-system": { browserRuntime: true },
  mobile: { browserRuntime: false },
  slides: { browserRuntime: true },
  video: { browserRuntime: true },
  web: { browserRuntime: true },
};

function validateArtifactKindDefinitions(definitions) {
  const entries = Object.entries(definitions);
  if (entries.length === 0) {
    throw new Error("artifact kind definitions must not be empty");
  }

  for (const [kind, definition] of entries) {
    if (!/^[a-z][a-z0-9-]*$/u.test(kind)) {
      throw new Error(`artifact kind "${kind}" is not a valid identifier`);
    }
    if (
      definition === null ||
      typeof definition !== "object" ||
      Object.keys(definition).length !== 1 ||
      typeof definition.browserRuntime !== "boolean"
    ) {
      throw new Error(
        `artifact kind "${kind}" must define exactly one boolean browserRuntime value`,
      );
    }
    Object.freeze(definition);
  }

  return Object.freeze(definitions);
}

export const ARTIFACT_KINDS = validateArtifactKindDefinitions(
  ARTIFACT_KIND_DEFINITIONS,
);

export function artifactKindDefinition(kind) {
  return Object.hasOwn(ARTIFACT_KINDS, kind) ? ARTIFACT_KINDS[kind] : undefined;
}

function parseRootAssignment(manifest, key, valuePattern) {
  const declaration = new RegExp(`^\\s*${key}\\s*=`, "u");
  const assignment = new RegExp(
    `^\\s*${key}\\s*=\\s*${valuePattern}\\s*(?:#.*)?$`,
    "u",
  );
  const declarations = [];
  let inTable = false;
  for (const line of manifest.split(/\r?\n/u)) {
    if (/^\s*\[\[?.+\]?\]\s*(?:#.*)?$/u.test(line)) {
      inTable = true;
    }
    if (!inTable && declaration.test(line)) {
      declarations.push(line);
    }
  }

  if (declarations.length > 1) {
    throw new Error(`defines ${key} more than once`);
  }
  if (declarations.length === 0) {
    return undefined;
  }

  const match = declarations[0].match(assignment);
  if (!match) {
    throw new Error(`has malformed ${key} metadata`);
  }
  return match[1];
}

export function artifactRunsInBrowser(manifest) {
  const kind = parseRootAssignment(manifest, "kind", '"([^"]+)"');
  if (kind === undefined) {
    throw new Error(
      'is missing required kind metadata (for example, kind = "web")',
    );
  }
  const kindDefinition = artifactKindDefinition(kind);
  if (kindDefinition === undefined) {
    throw new Error(
      `uses unknown artifact kind "${kind}" (expected one of: ${Object.keys(ARTIFACT_KINDS).join(", ")})`,
    );
  }

  const runtimeValue = parseRootAssignment(
    manifest,
    "browserRuntime",
    "(true|false)",
  );
  const expectedBrowserRuntime = kindDefinition.browserRuntime;
  if (
    runtimeValue !== undefined &&
    (runtimeValue === "true") !== expectedBrowserRuntime
  ) {
    throw new Error(
      `has contradictory runtime metadata: kind "${kind}" requires browserRuntime = ${expectedBrowserRuntime}`,
    );
  }

  return expectedBrowserRuntime;
}
