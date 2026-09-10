import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const APPROVED_DISCOVERY_HELPERS = new Set(["findBrowserArtifactDirectories"]);
const VALIDATION_SCRIPT = /^(?:check|validate)-.+\.(?:c?js|mjs|m?ts)$/u;
const TEST_SCRIPT = /\.test\.(?:c?js|mjs|m?ts)$/u;
const CONTRACT_SCRIPT_BASENAME = "check-artifact-discovery-contract";
const LOCAL_SCRIPT_EXTENSIONS = [".mjs", ".js", ".cjs", ".ts", ".mts"];
const FILESYSTEM_MODULE_SPECIFIERS = new Set([
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
]);

function isScannableValidationScript(name) {
  const basename = name.slice(0, name.lastIndexOf("."));
  return (
    VALIDATION_SCRIPT.test(name) &&
    !TEST_SCRIPT.test(name) &&
    basename !== CONTRACT_SCRIPT_BASENAME
  );
}

function functionName(node) {
  for (let current = node; current; current = current.parent) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isFunctionExpression(current)) &&
      current.name
    ) {
      return current.name.getText();
    }
  }
  return undefined;
}

function enclosingTryWithCatch(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTryStatement(current) && current.catchClause) return current;
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      return undefined;
    }
  }
  return undefined;
}

function hasActionableArtifactError(tryStatement) {
  const catchText = tryStatement.catchClause.getText();
  return (
    /(?:new\s+(?:Aggregate)?Error|failures?\.push|return\s+\[)/u.test(
      catchText,
    ) &&
    /artifact/iu.test(catchText) &&
    /(?:access|exist|list|permission|discover|directory)/iu.test(catchText)
  );
}

function artifactDirectoryVariables(sourceFile) {
  const names = new Set();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      /(?:join|resolve)\s*\([\s\S]*["']artifacts["'][\s\S]*\)/u.test(
        node.initializer.getText(),
      )
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function bindingScope(node, sourceFile) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
  }
  return sourceFile;
}

function visibilityScope(declaration, sourceFile) {
  if (ts.isParameter(declaration)) {
    return bindingScope(declaration, sourceFile);
  }
  if (ts.isCatchClause(declaration.parent)) {
    return declaration.parent;
  }
  const declarationList = declaration.parent;
  if (
    ts.isVariableDeclarationList(declarationList) &&
    (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
  ) {
    for (
      let current = declarationList.parent;
      current;
      current = current.parent
    ) {
      if (
        ts.isSourceFile(current) ||
        ts.isBlock(current) ||
        ts.isCaseBlock(current) ||
        ts.isForStatement(current) ||
        ts.isForInStatement(current) ||
        ts.isForOfStatement(current)
      ) {
        return current;
      }
    }
  }
  return bindingScope(declaration, sourceFile);
}

function scopeContains(scope, node) {
  for (let current = node; current; current = current.parent) {
    if (current === scope) return true;
  }
  return false;
}

function isStraightLineReassignment(node, scope) {
  if (bindingScope(node, node.getSourceFile()) !== scope) return false;
  let current = node.parent;
  while (current && current !== scope) {
    if (
      ts.isIfStatement(current) ||
      ts.isConditionalExpression(current) ||
      ts.isSwitchStatement(current) ||
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current) ||
      ts.isTryStatement(current) ||
      (ts.isBinaryExpression(current) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind))
    ) {
      return false;
    }
    current = current.parent;
  }
  return current === scope;
}

function directoryReaderBindings(sourceFile) {
  const direct = new Set(["readdir"]);
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteral(statement.moduleReference.expression) &&
      FILESYSTEM_MODULE_SPECIFIERS.has(statement.moduleReference.expression.text)
    ) {
      namespaces.add(statement.name.text);
      continue;
    }
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.length
    ) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          !initializer ||
          !ts.isCallExpression(initializer) ||
          !ts.isIdentifier(initializer.expression) ||
          initializer.expression.text !== "require" ||
          initializer.arguments.length !== 1 ||
          !ts.isStringLiteral(initializer.arguments[0]) ||
          !FILESYSTEM_MODULE_SPECIFIERS.has(initializer.arguments[0].text)
        ) {
          continue;
        }
        if (ts.isIdentifier(declaration.name)) {
          namespaces.add(declaration.name.text);
        } else if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            if (
              ts.isIdentifier(element.name) &&
              ["readdir", "readdirSync"].includes(
                element.propertyName?.getText() ?? element.name.text,
              )
            ) {
              direct.add(element.name.text);
            }
          }
        }
      }
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !FILESYSTEM_MODULE_SPECIFIERS.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const importClause = statement.importClause;
    if (importClause?.name) {
      namespaces.add(importClause.name.text);
    }
    const bindings = importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (
          ["readdir", "readdirSync"].includes(
            (element.propertyName ?? element.name).text,
          )
        ) {
          direct.add(element.name.text);
        }
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }
  const aliases = [];
  const localBindings = [];

  function addLocalBindings(name, declaration, scope) {
    if (ts.isIdentifier(name)) {
      localBindings.push({
        declaration,
        name: name.text,
        scope,
      });
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) {
          addLocalBindings(element.name, declaration, scope);
        }
      }
    }
  }

  function isTrackedNamespaceMember(node) {
    if (
      !ts.isPropertyAccessExpression(node) &&
      !ts.isElementAccessExpression(node)
    ) {
      return false;
    }
    if (
      !ts.isIdentifier(node.expression) ||
      !namespaces.has(node.expression.text)
    ) {
      return false;
    }
    if (ts.isPropertyAccessExpression(node)) {
      return ["readdir", "readdirSync"].includes(node.name.text);
    }
    return (
      ts.isStringLiteralLike(node.argumentExpression) &&
      ["readdir", "readdirSync"].includes(node.argumentExpression.text)
    );
  }

  function trackedAliasAt(name, node) {
    const position = node.getStart(sourceFile);
    const scope = bindingScope(node, sourceFile);
    return aliases.some((alias) => {
      if (
        alias.name !== name ||
        !scopeContains(alias.visibilityScope, node) ||
        hasShadowingBinding(alias, node)
      ) {
        return false;
      }
      if (scope !== alias.scope) {
        return alias.transitions.some((transition) => transition.active);
      }
      const latestTransition = alias.transitions
        .filter((transition) => transition.at < position)
        .at(-1);
      return latestTransition?.active === true;
    });
  }

  function isTrackedReaderValue(node) {
    return (
      isTrackedNamespaceMember(node) ||
      (ts.isIdentifier(node) &&
        (direct.has(node.text) || trackedAliasAt(node.text, node)))
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      addLocalBindings(
        node.name,
        node,
        visibilityScope(node, sourceFile),
      );
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      addLocalBindings(node.name, node, node.parent);
    } else if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name
    ) {
      addLocalBindings(node.name, node, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      aliases.push({
        name: node.name.text,
        declaration: node,
        scope: bindingScope(node, sourceFile),
        visibilityScope: visibilityScope(node, sourceFile),
        transitions: [],
      });
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(sourceFile);

  function hasShadowingBinding(alias, node) {
    return localBindings.some(
      (binding) =>
        binding.name === alias.name &&
        binding.declaration !== alias.declaration &&
        binding.scope !== alias.visibilityScope &&
        scopeContains(alias.visibilityScope, binding.scope) &&
        scopeContains(binding.scope, node),
    );
  }

  function collectTransitions(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const alias = aliases.find((candidate) => candidate.declaration === node);
      alias.transitions.push({
        at: node.initializer.end,
        active: isTrackedReaderValue(node.initializer),
      });
    } else if (
      ts.isBinaryExpression(node) &&
      ts.isIdentifier(node.left) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      for (const alias of aliases) {
        if (
          alias.name === node.left.text &&
          scopeContains(alias.scope, node) &&
          !hasShadowingBinding(alias, node) &&
          (isTrackedReaderValue(node.right) ||
            isStraightLineReassignment(node, alias.scope)) &&
          node.getStart(sourceFile) > alias.declaration.end
        ) {
          alias.transitions.push({
            at: node.end,
            active: isTrackedReaderValue(node.right),
          });
        }
      }
    }
    ts.forEachChild(node, collectTransitions);
  }
  collectTransitions(sourceFile);

  return { direct, namespaces, aliases, hasShadowingBinding };
}

function isDirectoryReaderCall(call, bindings) {
  if (ts.isIdentifier(call.expression)) {
    if (bindings.direct.has(call.expression.text)) return true;
    const callPosition = call.getStart();
    const callScope = bindingScope(call, call.getSourceFile());
    return bindings.aliases.some((alias) => {
      if (
        alias.name !== call.expression.text ||
        !scopeContains(alias.visibilityScope, call) ||
        bindings.hasShadowingBinding(alias, call)
      ) {
        return false;
      }
      if (callScope !== alias.scope) {
        return alias.transitions.some((transition) => transition.active);
      }
      const latestTransition = alias.transitions
        .filter((transition) => transition.at < callPosition)
        .at(-1);
      return latestTransition?.active === true;
    });
  }
  const expression = call.expression;
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }
  if (
    !ts.isIdentifier(expression.expression) ||
    !bindings.namespaces.has(expression.expression.text)
  ) {
    return false;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return ["readdir", "readdirSync"].includes(expression.name.text);
  }
  return (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    ["readdir", "readdirSync"].includes(expression.argumentExpression.text)
  );
}

function enumeratesArtifactRoot(call, artifactVariables) {
  if (!call.arguments.length) return false;
  const argument = call.arguments[0];
  if (ts.isIdentifier(argument) && artifactVariables.has(argument.text)) {
    return true;
  }
  return /(?:join|resolve)\s*\([\s\S]*["']artifacts["'][\s\S]*\)/u.test(
    argument.getText(),
  );
}

export function artifactDiscoveryFailures(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    undefined,
  );
  const artifactVariables = artifactDirectoryVariables(sourceFile);
  const readerBindings = directoryReaderBindings(sourceFile);
  const failures = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      isDirectoryReaderCall(node, readerBindings) &&
      enumeratesArtifactRoot(node, artifactVariables)
    ) {
      const owner = functionName(node);
      const guardedTry = enclosingTryWithCatch(node);
      if (
        !APPROVED_DISCOVERY_HELPERS.has(owner) &&
        (!guardedTry || !hasActionableArtifactError(guardedTry))
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        failures.push(
          `${path}:${line + 1} lists the top-level artifacts directory without an approved discovery helper or actionable error handling`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return failures;
}

function localImportSpecifiers(path, source) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    undefined,
  );
  const specifiers = new Set();

  function addSpecifier(node) {
    if (
      node &&
      ts.isStringLiteral(node) &&
      (node.text.startsWith("./") || node.text.startsWith("../"))
    ) {
      specifiers.add(node.text);
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      addSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...specifiers];
}

async function resolveLocalScript(importingFile, specifier) {
  const unresolved = resolve(dirname(importingFile), specifier);
  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        ...LOCAL_SCRIPT_EXTENSIONS.map((extension) => unresolved + extension),
        ...LOCAL_SCRIPT_EXTENSIONS.map((extension) =>
          resolve(unresolved, `index${extension}`),
        ),
      ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
    }
  }
  return undefined;
}

export async function checkArtifactDiscoveryContract(rootDirectory) {
  const scriptsDirectory = resolve(rootDirectory, "scripts");
  let entries;
  try {
    entries = await readdir(scriptsDirectory, { withFileTypes: true });
  } catch (error) {
    return [
      `Artifact discovery contract could not list the validation scripts directory: ${error.message}. Check that scripts exists and that this validation process has permission to access it.`,
    ];
  }

  const failures = [];
  const pendingFiles = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !isScannableValidationScript(entry.name)
    ) {
      continue;
    }
    pendingFiles.push(resolve(scriptsDirectory, entry.name));
  }

  const visitedFiles = new Set();
  while (pendingFiles.length) {
    const file = pendingFiles.pop();
    if (visitedFiles.has(file)) continue;
    visitedFiles.add(file);

    const path = relative(rootDirectory, file).split("\\").join("/");
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      failures.push(
        `${path} could not be read: ${error.message}. Check file access for this validation script or its local dependencies.`,
      );
      continue;
    }
    failures.push(...artifactDiscoveryFailures(path, source));

    for (const specifier of localImportSpecifiers(path, source)) {
      try {
        const dependency = await resolveLocalScript(file, specifier);
        if (dependency) pendingFiles.push(dependency);
      } catch (error) {
        failures.push(
          `${path} could not inspect local dependency ${specifier}: ${error.message}. Check file access for this validation script dependency.`,
        );
      }
    }
  }
  return failures.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const failures = await checkArtifactDiscoveryContract(root);
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Artifact discovery error-handling contract passed.");
  }
}
