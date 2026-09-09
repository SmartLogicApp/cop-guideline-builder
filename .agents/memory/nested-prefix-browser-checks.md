---
name: Nested-prefix browser checks
description: How browser coverage should distinguish escaped site URLs from legitimate external resources.
---

For pages mounted below a nested prefix, inspect both same-origin network requests and resolved same-origin link destinations. Restrict prefix assertions to same-origin assets; externally hosted styles or fonts legitimately use their own paths.

**Why:** Request monitoring catches assets and navigations that actually load, but an unclicked root-relative link emits no request. Conversely, treating every stylesheet path as site-owned creates false failures for external font providers.

**How to apply:** On each prefixed public page, assert resolved same-origin links and loaded same-origin assets remain under the configured prefix, monitor same-origin requests for escapes, and verify external resources separately when needed.