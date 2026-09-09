---
name: Clerk ticket-test redirects
description: How Clerk's Playwright ticket sign-in differs from completing the visible sign-in form.
---

Programmatic email sign-in through Clerk's Playwright helper establishes and activates a real session, but it does not execute the mounted sign-in component's normal form-completion redirect.

**Why:** Waiting for the sign-in page's configured redirect after ticket-based helper sign-in leaves the browser on the sign-in route even though Clerk reports an authenticated user.

**How to apply:** To test authenticated landing behavior, sign in programmatically from a public route whose signed-in state redirects into the app, then assert the destination. Test the sign-in widget's form redirect separately if that exact UI completion path matters.