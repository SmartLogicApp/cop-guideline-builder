---
name: Workspace preview browser fixtures
description: Browser-test access fixtures for the standalone workspace preview.
---

The standalone workspace preview is not an authenticated session. Scanner browser fixtures must pass an explicit synthetic user ID into a test-only preview wrapper, then return the same ID and active access from their mocked account response. Do not bypass the production access gate to make a preview test run.

**Why:** The access check waits for a Clerk identity before making a request. Mocking the account endpoint alone is insufficient, and older anonymous preview fixtures can appear to work until authorization tightens.

**How to apply:** For standalone preview UI checks, use a test-only wrapper with a synthetic identity, matching mocked response, and owner-scoped storage. Keep this identity out of the real user-facing preview.