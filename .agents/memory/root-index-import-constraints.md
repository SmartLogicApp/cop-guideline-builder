---
name: Root-level index.jsx import constraints
description: index.jsx lives at the workspace root and is imported by the cop-guideline-builder artifact. It cannot import packages that are only installed inside an artifact during production Rollup builds.
---

## The Rule
`index.jsx` (workspace root) must NOT import from packages that are only resolvable within a specific artifact (e.g. `@clerk/react`, `wouter`). These resolve fine in Vite dev mode (HMR) but break the production Rollup build with "failed to resolve import" errors.

**Why:** Rollup resolves imports from the file's own location on disk (`/home/runner/workspace/index.jsx`), not from the artifact's context. Packages installed only in `artifacts/cop-guideline-builder` are not visible from the workspace root during bundling.

**Exception:** The `@` alias (`@/hooks/useAccount`, etc.) resolves correctly because Vite rewrites it before Rollup sees it. External package imports (`@clerk/react`, `wouter`, etc.) are NOT rewritten and must resolve from the root.

## How to Apply
When `index.jsx` needs functionality from an artifact-only package:
1. Import and call it inside the artifact (e.g. `App.tsx`)
2. Pass the value/function down as a **prop** to `CoPGuidelineBuilder`
3. `index.jsx` receives it via its function parameter and calls it directly

**Example fix for signOut:**
- ❌ `import { useClerk } from "@clerk/react"` in `index.jsx`
- ✅ `const { signOut } = useClerk()` in `App.tsx/HomeRedirect`, then `<CoPGuidelineBuilder onSignOut={...} />`
