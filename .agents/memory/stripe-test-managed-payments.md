---
name: Stripe Test Managed Payments checkout
description: Test Checkout requirements and cancellation signals observed in the Stripe account.
---

Stripe Test Checkout can require a product tax code even for a zero-due-today subscription trial when Managed Payments is enabled by default. A valid recurring Price alone does not prove Checkout will open. Use the matching Test product's business SaaS tax category for this product; do not change a Live product merely to make a Test journey pass.

**Why:** A hosted Test Checkout request was rejected for a missing product tax code despite a valid Test Price and an accepted Terms record.

**How to apply:** When testing a trial, validate the Test product's tax configuration and run a real Test session rather than relying only on price-contract checks. Keep Test and Live changes isolated.

The Stripe customer portal can schedule trial-end cancellation by setting `cancel_at` while leaving `cancel_at_period_end` false.

**Why:** The customer portal showed cancellation scheduled at the trial end, but a mirror that checked only `cancel_at_period_end` told the user the plan would renew.

**How to apply:** Derive the user-facing cancellation indicator from both Stripe cancellation fields against the current period end; do not interpret `canceled_at` alone as immediate loss of trial access.