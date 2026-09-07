# Canvas release gate path matching

As of September 7, 2026, Replit's documented workflow configuration does not
provide a supported changed-path filter for validation workflows. The official
[App Configuration](https://docs.replit.com/features/project-setup/configuration)
and
[Task lifecycle](https://docs.replit.com/features/agent/task-lifecycle)
documentation describes workflow and task execution, but not include/exclude
path triggers. Do not add an undocumented workflow metadata field: silently
ignoring it could either run this expensive gate for every merge or, worse,
skip required checks.

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

When Replit documents a native validation path filter, configure it with the
protected paths above and keep the deterministic path-matching tests as its
contract. Only then should the Git comparison be removed.

Run the path-matching tests with:

```sh
pnpm run test:canvas-paths
```