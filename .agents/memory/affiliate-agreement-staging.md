---
name: Affiliate agreement staging boundary
description: Keep source-derived legal text ready for owner review without implying publication or acceptance.
---

Prepare an unpublished affiliate agreement from the fixed attorney-supplied source for an authorized super-admin when they open the review screen. Never equate loading the draft, viewing its checksum, or deploying the app with publishing the legal agreement. Keep personal review attestation unchecked; only the owner may make it effective through the explicit publication action.

**Why:** A browser-local form cannot be prefilled in another person's session in advance. A deterministic, protected draft request makes the text ready when the owner arrives without creating a premature binding agreement or pretending an agent reviewed it.

**How to apply:** Keep draft generation read-only, source-constrained, and restricted to super-admins; make the final confirmation a separate deliberate action. Explain that app deployment and legal publication are different steps.

The review screen must treat a returned draft and checksum as untrusted until the browser independently hashes the exact returned UTF-8 body. On failure, keep the review action unavailable and discard any previously loaded draft rather than presenting stale text as ready.

**Why:** Showing a server-supplied checksum next to a body does not prove they match; a corrupted response could otherwise appear ready for an owner's legal approval.

**How to apply:** Maintain verification before prefilling the review form, and fail closed on missing browser crypto or a mismatched digest.