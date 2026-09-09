import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const APPROVED_DISCOVERY_HELPERS = new Set(["findBrowserArtifactDirectories"]);
const VALIDATION_SCRIPT = /^(?:check|validate)-.+\.mjs$/u;

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

function directoryReaderBindings(sourceFile) {
  const direct = new Set(["readdir"]);
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !["node:fs", "node:fs/promises"].includes(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
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
  return { direct, namespaces };
}

function isDirectoryReaderCall(call, bindings) {
  if (ts.isIdentifier(call.expression)) {
    return bindings.direct.has(call.expression.text);
  }
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ["readdir", "readdirSync"].includes(call.expression.name.text) &&
    ts.isIdentifier(call.expression.expression) &&
    bindings.namespaces.has(call.expression.expression.text)
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
    ts.ScriptKind.JS,
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
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !VALIDATION_SCRIPT.test(entry.name) ||
      entry.name === "check-artifact-discovery-contract.mjs"
    ) {
      continue;
    }
    const path = `scripts/${entry.name}`;
    let source;
    try {
      source = await readFile(resolve(scriptsDirectory, entry.name), "utf8");
    } catch (error) {
      failures.push(
        `${path} could not be read: ${error.message}. Check file access for this validation script.`,
      );
      continue;
    }
    failures.push(...artifactDiscoveryFailures(path, source));
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
