---
name: Stripe Connect account policy
description: Sandbox account-creation policy can block the existing Express onboarding flow despite valid test keys and webhook setup.
---

New Stripe Connect sandboxes can reject Accounts v1 creation with a message directing integrations to Accounts v2, even when Connect sandbox mode, test API keys, and webhook signing are configured. Stripe's own documentation provides a Dashboard API Policies toggle for Accounts v1 support in Test mode or sandboxes. Do not treat a valid webhook destination as evidence that account creation can succeed.

**Why:** A real test affiliate reached the existing onboarding endpoint, but Stripe rejected connected-account creation before any Account Link or account.updated event could exist. Retrying without resolving the account policy could not verify the flow.

**How to apply:** Before retesting the existing v1-based Express onboarding, verify the Stripe account's Accounts v1 support policy is enabled for the matching sandbox, or explicitly plan a reviewed Accounts v2 migration with updated webhooks. Never mark onboarding or webhook processing verified from a simulated event alone.