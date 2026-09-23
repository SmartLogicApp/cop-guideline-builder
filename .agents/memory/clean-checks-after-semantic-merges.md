---
name: Clean checks after semantic merges
description: How to prevent stale TypeScript build metadata from masking structural route corruption after automated merges.
---

After any rebase or semantic merge that touches TypeScript, run the affected package's compiler with incremental mode disabled before trusting its usual typecheck. If a route is corrupted, compare the repaired version against the last intact commit, not necessarily the immediate parent.

**Why:** A normal package typecheck reused stale build metadata and reported success even though an automated merge had spliced unrelated route fragments together. A clean non-incremental check exposed the real errors. The immediate parent can already contain corruption; later repairs can compile while still returning the wrong data or changing a financial write target.

**How to apply:** For the API server, rebuild referenced libraries first, then run its TypeScript project with `--noEmit --incremental false`. Find an intact historical version of the affected route and review the final diff against it to confirm only intended behavior changed. Check representative output shapes and financial write targets as well as compiler success.