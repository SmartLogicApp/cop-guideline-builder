---
name: Lazy bundle ownership checks
description: How to identify sensitive dependencies in generated bundles without changing their loading behavior
---

For production checks that must prove a sensitive dependency stays behind a lazy boundary, emit minimal build metadata mapping that dependency to its generated output chunk, then combine that metadata with the bundler's import graph.

**Why:** Forcing the dependency into a named manual chunk solely to make it identifiable can change chunk relationships. In an actual production build, shared imports caused the forced chunk to become a static dependency and HTML preload of the public entry—the regression the check was intended to prevent.

**When to apply:** Use this pattern for generated-asset release guards that need to find authentication, analytics, editor, or other route-private code inside hashed production chunks.