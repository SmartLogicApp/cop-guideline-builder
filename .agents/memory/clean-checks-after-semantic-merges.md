---
name: Clean checks after semantic merges
description: How to prevent stale TypeScript build metadata from masking structural route corruption after automated merges.
---

After any rebase or semantic merge that touches TypeScript, run the affected package's compiler with incremental mode disabled before trusting its usual typecheck.

**Why:** A normal package typecheck reused stale build metadata and reported success even though an automated merge had spliced unrelated route fragments together. A clean non-incremental check exposed the real errors.

**How to apply:** For the API server, rebuild referenced libraries first, then run its TypeScript project with `--noEmit --incremental false`. Treat the clean result—not the cached result—as the completion gate after merges.