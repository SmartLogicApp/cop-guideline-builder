---
name: Native TypeScript test imports
description: How the workspace's native Node test runner resolves TypeScript source modules.
---

Node's native TypeScript type-stripping runner does not automatically resolve a source module's `.js` relative import to its `.ts` source file.

**Why:** A test that imported a new TypeScript helper directly failed at module resolution despite passing the workspace TypeScript check. Static imports are resolved before a test can register hooks.

**How to apply:** For source-level Node tests that import modules using `.js` ESM specifiers, register a local resolution hook first, then dynamically import the module under test. This is a test-runner concern, not a reason to change production `.js` specifiers.