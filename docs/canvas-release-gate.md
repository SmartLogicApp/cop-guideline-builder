# Canvas release gate path matching

The `canvas-release` validation workflow calls `pnpm run validate:canvas:changed`.
The guard compares the current commit with its first parent and only runs the
full Canvas release validation when at least one protected path changed.

Protected paths are:

- `.replit` and the guard implementation/tests
- root workspace dependency manifests: `package.json`, `pnpm-workspace.yaml`,
  and `pnpm-lock.yaml`
- everything under `artifacts/mockup-sandbox/`
- `artifacts/cms-compliance-consultant-training/package.json`, because its
  Vite optional peers share pnpm resolution context with Canvas
- `artifacts/api-server/src/middlewares/requireActiveSubscription.ts`
- `artifacts/api-server/src/routes/billing.ts`

Other documentation, API, mobile, marketing, slide, and video changes exit
successfully without installing dependencies or building Canvas.

The guard can be checked deterministically by setting
`CANVAS_RELEASE_CHANGED_PATHS` to a newline-separated list. If neither that
input nor the Git comparison is available, the guard runs the full validation
rather than risk skipping a required check.

Run the path-matching tests with:

```sh
pnpm run test:canvas-paths
```