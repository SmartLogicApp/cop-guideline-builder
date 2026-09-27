---
name: Access checks after native dialogs
description: Handle transient Clerk authorization failures triggered by native browser dialogs without weakening the workspace gate.
---

Native browser prompts and confirms can trigger focus and visibility handlers immediately on dismissal. A transient 401 from an access recheck at that moment does not necessarily mean the Clerk session ended; a subsequent request may already succeed.

**Why:** Production access logs showed short-lived unauthorized access probes followed seconds later by successful ones while the admin was using a review dialog. Treating the first 401 as final removed the admin panel before review could complete. This is separate from intentionally signing out.

**How to apply:** For sensitive admin actions and access rechecks, use the current Clerk session token and retry one 401 with a freshly requested token. If that still fails or the signed-in identity differs, continue to fail closed. Do not keep a workspace accessible based only on stale cached account data.