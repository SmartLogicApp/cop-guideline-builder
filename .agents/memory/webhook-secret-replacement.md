---
name: Webhook secret replacement
description: Avoid stale Stripe signing secrets when a connected Test account or webhook destination changes.
---

When the connected Stripe Test account or webhook endpoint changes, use a distinct Test-only secret key rather than repeatedly requesting the existing production-compatible key.

**Why:** The secure-entry flow can confirm an existing secret without replacing it. This can leave a correctly formatted but stale signing secret in place, causing real Stripe deliveries to fail signature verification despite repeated submissions.

**How to apply:** Keep production verification on its production secret key. For development, request a separate Test webhook secret after creating the destination, and verify it with a real Stripe-signed delivery after restarting the API.