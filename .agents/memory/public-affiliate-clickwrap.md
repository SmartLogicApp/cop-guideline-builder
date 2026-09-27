---
name: Public affiliate clickwrap
description: The publication boundary and legacy compatibility for affiliate application-time agreement acceptance.
---

Public affiliate applications may capture acceptance without a prior invitation, but only against the exact document already published and configured as current by the owner. Store the application and linked immutable acceptance together; keep invitations for older pending applications that have no matching acceptance.

**Why:** A public checkbox must not silently turn a sample draft or an unpublished version into binding acceptance. The development database may contain only a sample agreement even when production has a published reviewed version; development should fail closed in that state rather than silently substituting source text or publishing on the owner's behalf.

**How to apply:** Derive the version and document hash from server-owned published records, validate the public form's displayed version/hash at submission, and preserve the separate owner-only publication gate. Treat unauthenticated applicants' linked affiliate ID and captured signer identity as the account/user equivalents; do not invent a Clerk user ID. A later applicant identity revision invalidates prior acceptance for activation.