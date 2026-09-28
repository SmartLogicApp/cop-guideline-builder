---
name: Lazy bundle ownership checks
description: How to identify sensitive dependencies in generated bundles without changing their loading behavior
---

For production checks that must prove a sensitive dependency stays behind a lazy boundary, emit minimal build metadata mapping that dependency to its generated output chunk, then combine that metadata with the bundler's import graph. When comparing browser requests to a private graph, subtract files owned by the public static graph because lazy entries can legally import shared public chunks.

When a route-private page is also reused inside another lazy workspace entry, Vite may give the authenticated entry a hashed virtual manifest key without a source path. Identify it by its authenticated-entry key shape *and* the public entry's dynamic import edge, then keep the eager-import and HTML-preload rejection checks.

**Why:** Forcing the dependency into a named manual chunk solely to make it identifiable can change chunk relationships. In an actual production build, shared imports caused the forced chunk to become a static dependency and HTML preload of the public entry—the regression the check was intended to prevent. Conversely, classifying every transitive import of a lazy entry as private creates false positives when that entry imports the public shell. A source-path-only matcher also wrongly rejects a safe, dynamically imported virtual chunk.

**How to apply:** Use this pattern for generated-asset release guards that need to find authentication, analytics, editor, or other route-private code inside hashed production chunks. Determine ownership from both the sensitive-entry and public-entry graphs before asserting on generated files.