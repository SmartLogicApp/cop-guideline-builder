---
name: Admin authorization
description: Security boundary for granting platform-level administrative access.
---

# Admin Authorization Boundary

Platform-level administrative access must be granted only through controlled environment configuration or an active database authorization record. Never embed privileged identity-provider user IDs in server or client source.

**Why:** Hardcoded identity IDs create a broken-access-control path that bypasses normal authorization governance and can silently survive account or environment changes.

**How to apply:** Resolve admin status on the server for each authenticated request. The client may render the returned status but must not independently grant access from a bundled identifier list.
