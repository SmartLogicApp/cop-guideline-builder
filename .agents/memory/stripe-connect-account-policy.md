---
name: Stripe Connect account policy
description: Accounts v1 creation policy, Accounts v2 compatibility, and real webhook/hosted-onboarding verification boundaries.
---

New Stripe Connect sandboxes can reject Accounts v1 creation with a message directing integrations to Accounts v2, even when Connect sandbox mode and test keys are configured. Stripe's own documentation provides a Dashboard API Policies toggle for Accounts v1 support in Test mode or sandboxes. Do not treat an API key or a configured secret as evidence that account creation or webhook delivery can succeed.

Completing both Connect Platform Profile liability/compliance acknowledgements is separate from enabling the Accounts v1 API policy. In this sandbox, Accounts v2 recipient/Express creation and a v1 hosted Account Link did succeed without enabling v1 creation. Its v1 representation reports `type: none`, even though its authoritative v2 dashboard is Express. A test webhook signing secret existing in Replit did not imply Stripe had an enabled Connect webhook destination; the account-holder's Dashboard setup and a human Stripe-hosted anti-bot challenge remained external blockers.

**Why:** Assuming v1 account shape or webhook registration from secrets alone would falsely mark a real account unsupported or an undelivered event verified. A Stripe-hosted anti-bot challenge cannot be bypassed by automation.

**How to apply:** For Accounts v2, verify Express plus recipient configuration through v2 before using v1-shaped sync or `account.updated` payloads. Check the live Stripe webhook destination and signed delivery separately from local handler tests. Never mark onboarding or webhook processing verified from a simulated event, secret existence, or merely opening an Account Link.