---
name: Admin authorization
description: Security boundary for granting platform-level administrative access.
---

# Admin Authorization Boundary

Platform-level administrative access must be granted through controlled environment configuration, an active database authorization record, or the explicitly authorized owner's verified primary Clerk email resolved server-side. Never embed privileged identity-provider user IDs in server or client source.

**Why:** Hardcoded identity IDs create a broken-access-control path that bypasses normal authorization governance and can silently survive account or environment changes.

**How to apply:** Resolve admin status on the server for each authenticated request. The client may render the returned status but must not independently grant access from a bundled identifier list.

For owner-only actions, retain exact production Clerk user ID grants. The owner explicitly authorized case-insensitive recognition of their email as an additional route to super-admin status; this exception applies only to Clerk's server-fetched, verified *primary* address, never client claims or a general admin database row. If a shared owner allowlist may contain other administrators' IDs and cannot safely be inspected, add a separately configured production owner ID rather than replacing the shared list.

**Why:** Development and production Clerk users have different IDs even when they sign in with the same address. Replacing a masked shared allowlist can unexpectedly revoke other owners. An unverified or client-provided email would weaken the owner-only boundary; the owner's explicit verified-primary-email exception avoids treating arbitrary account data as authorization.

**How to apply:** Preserve existing authorized IDs and test both the owner and non-owner cases. If Clerk cannot verify a non-allowlisted owner's primary address, fail closed; do not fall back to a session email. A separately configured production owner ID remains preferable when email lookup is unavailable.
