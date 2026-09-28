---
name: Corepack CI package-manager version
description: Why GitHub CI must explicitly pin the pnpm version used for frozen installs
---

Keep the package-manager version explicit when CI enables Corepack; do not rely on its ambient pnpm selection.

**Why:** On GitHub's Node 24 runners, Corepack selected pnpm 12 for an unpinned workspace even though the lockfile was maintained with pnpm 10. The newer pnpm interpreted overrides differently and failed all three custom CI jobs with a frozen-lockfile configuration mismatch before their tests started.

**How to apply:** When adjusting workflows or lockfile management, check that clean checkout runners and local tooling select the same pnpm version, then verify a frozen install. The version is a reproducibility requirement, not a check bypass.