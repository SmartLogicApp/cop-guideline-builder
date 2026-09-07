---
name: Autoscale cache persistence
description: Durable storage requirements for caches that must survive deployment restarts and scaling.
---

Do not use the local filesystem for data that must survive an autoscale restart, deployment, or instance replacement. Use a shared durable store such as the project PostgreSQL database, and store absolute expiry timestamps with cached values.

**Why:** Autoscale instance filesystems are ephemeral. A file can survive a local process restart while still disappearing when the deployed instance is replaced, which does not satisfy restart persistence.

**How to apply:** For shared server caches with TTL guarantees, keep an optional in-process L1 cache for speed but treat PostgreSQL or another external durable service as the source of truth. Test restoration with a fresh cache instance and test rejection of expired rows.