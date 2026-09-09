---
name: Clerk ticket-test redirects
description: How Clerk's Playwright ticket sign-in behaves in apps that defer Clerk on public routes.
---

Programmatic email sign-in through Clerk's Playwright helper establishes and activates a real session, but it does not execute the mounted sign-in component's normal form-completion redirect.

The resulting session is also scoped to the hostname where the ticket is consumed. A ticket accepted on a development or testing-helper host does not authenticate the same browser context on the published production hostname.

**Why:** The helper requires a page where Clerk is already loaded, and waiting for the sign-in page's configured redirect leaves the browser on the sign-in route even though Clerk reports an authenticated user. Clerk's development and production environments and their browser sessions are intentionally isolated.

**How to apply:** Open an auth route, sign in programmatically, then navigate explicitly to the protected route on the same host. Never treat a helper-host session as production evidence; if the live host cannot consume a safe synthetic ticket, report authenticated production checks as blocked rather than using real credentials or weakening auth. If a standalone frontend preview omits its API server, stub only the access response needed by a client-routing test; keep full authorization checks in an integrated environment.