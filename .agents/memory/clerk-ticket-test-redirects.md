---
name: Clerk ticket-test redirects
description: How Clerk's Playwright ticket sign-in behaves in apps that defer Clerk on public routes.
---

Programmatic email sign-in through Clerk's Playwright helper establishes and activates a real session, but it does not execute the mounted sign-in component's normal form-completion redirect.

**Why:** The helper requires a page where Clerk is already loaded, and waiting for the sign-in page's configured redirect leaves the browser on the sign-in route even though Clerk reports an authenticated user.

**How to apply:** Open an auth route, sign in programmatically, then navigate explicitly to the protected route. If a standalone frontend preview omits its API server, stub only the access response needed by a client-routing test; keep full authorization checks in an integrated environment.