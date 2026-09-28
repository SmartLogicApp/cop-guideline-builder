---
name: Admin authorization
description: Security boundary for granting platform-level administrative access.
---

# Admin Authorization Boundary

Platform-level administrative access must be granted only through controlled environment configuration or an active database authorization record. Never embed privileged identity-provider user IDs in server or client source.

**Why:** Hardcoded identity IDs create a broken-access-control path that bypasses normal authorization governance and can silently survive account or environment changes.

**How to apply:** Resolve admin status on the server for each authenticated request. The client may render the returned status but must not independently grant access from a bundled identifier list.

For owner-only actions, prefer exact production Clerk user IDs over email matches or a general admin database row. If a shared owner allowlist may contain other administrators' IDs and cannot safely be inspected, add a separately configured production owner ID rather than replacing the shared list.

**Why:** Development and production Clerk users have different IDs even when they sign in with the same address. Replacing a masked shared allowlist can unexpectedly revoke other owners; promoting all general admins or matching an email would weaken the owner-only boundary.

**How to apply:** Have the signed-in owner retrieve their ID from the production session and configure that exact ID as a production-scoped value. Keep existing authorized IDs intact and test both the owner and non-owner cases.
