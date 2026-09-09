---
name: Production schema ownership
description: Why API startup must remain free of application and vendor schema migrations.
---

Request-serving processes must open their port without running application-owned or vendor-owned database migrations, webhook setup, or backfills.

**Why:** A production publish reached the API run command but stalled indefinitely while awaiting a vendor migration before the server began listening. The database was reachable and had no ungranted locks; tying schema work to startup made the readiness probe wait forever and left the previous release serving.

**How to apply:** Keep managed PostgreSQL schema changes in Replit's Publish flow. Run any future vendor provisioning as an explicit, bounded, noninteractive administrative operation before enabling that vendor—not in build, startup, or readiness checks.