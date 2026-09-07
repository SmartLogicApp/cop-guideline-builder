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
The guard uses an explicit strategy for each Git history shape:

- A first (root) commit treats every path introduced by that commit as changed.
- A commit with one parent compares the current commit with that parent.
- A merge commit compares the current commit with every parent and uses the
  union of those changed paths. This prevents a protected change from being
  hidden merely because it is already present in one side of the merge.
- Parent comparisons disable Git rename detection, so a move is reported as
  both a deletion and an addition. The gate therefore sees the protected side
  whether a file moves into or out of a protected path.

The full Canvas release validation only runs when at least one resulting
protected path changed.

Protected paths are listed below. A path ending in `/` matches that directory
and everything below it by prefix. A path without a trailing slash matches one
file exactly. The release contract check compares this ordered block with the
guard's executable list, so keep the markers and one-path-per-line format.

<!-- canvas-protected-paths:start -->

```text
.replit
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
artifacts/mockup-sandbox/
artifacts/cms-compliance-consultant-training/package.json
artifacts/api-server/src/middlewares/requireActiveSubscription.ts
artifacts/api-server/src/routes/billing.ts
scripts/validate-canvas-changes.mjs
scripts/validate-canvas-changes.test.mjs
```

<!-- canvas-protected-paths:end -->

The consultant-training package manifest is protected because its Vite optional
peers share pnpm resolution context with Canvas.

Other documentation, API, mobile, marketing, slide, and video changes exit
successfully without installing dependencies or building Canvas.

## Windows portability check

The focused `test:canvas-release-contract` suite also runs on
`windows-latest` with Node 24. Hard-link identity and deterministic ordering
remain required there. Symlink cases run when the hosted runner permits
symbolic-link creation; if Windows denies that capability with a filesystem
permission error, only those fixtures are reported as skipped with an explicit
platform-policy reason.

The guard can be checked deterministically by setting
`CANVAS_RELEASE_CHANGED_PATHS` to a JSON array of path strings, such as
`["README.md","artifacts/mockup-sandbox/src/App.tsx"]`. JSON preserves spaces,
quotes, embedded newlines, and control characters in every valid Git filename.
For compatibility, a single ordinary path may still be supplied directly;
multiline newline-separated values are rejected as ambiguous. If neither that
input nor all required Git comparisons are available, the guard runs the full
validation rather than risk skipping a required check.

When Replit documents a native validation path filter, configure it with the
protected paths above and keep the deterministic path-matching tests as its
contract. Only then should the Git comparison be removed.

Run the path-matching tests with:

```sh
pnpm run test:canvas-paths
```
