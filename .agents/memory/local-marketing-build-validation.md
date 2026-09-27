---
name: Local marketing build validation
description: Distinguish local bundle verification with development Clerk credentials from production publishing validation.
---

Local build verification with development Clerk credentials should use the project's browser-test mode and explicit runtime port/base path; a normal production-mode build intentionally rejects development credentials.

**Why:** A local build failed first on missing runtime routing configuration, then on the production Clerk key guard. The browser-test build succeeded without changing credentials or weakening the guard. This verifies bundling, not production publishing readiness.

**How to apply:** When checking changes to the marketing app locally, use the browser-test route for a bundle check. Keep production-mode credential enforcement intact; never infer publish readiness from that local check.