---
name: Stripe Managed Payments checkout
description: Product tax-code requirements and cancellation signals observed in Test and Live Stripe Checkout.
---

Stripe Test and Live Checkout can require a product tax code even for a zero-due-today subscription trial when Managed Payments is enabled by default. A valid recurring Price alone does not prove Checkout will open. The Facility Plan's established business-use SaaS category is the appropriate classification in both modes; validate each mode separately and do not infer Live readiness from a successful Test session.

**Why:** Hosted Checkout requests in both modes were rejected for a missing product tax code despite valid Prices and accepted Terms. A production account can remain pending payment while the app misleadingly treats its not-yet-started trial as expired.

**How to apply:** When testing a trial, validate the corresponding product's tax configuration in the intended mode and run a real Test session rather than relying only on price-contract checks. Keep Test and Live changes isolated.

The Stripe customer portal can schedule trial-end cancellation by setting `cancel_at` while leaving `cancel_at_period_end` false.

**Why:** The customer portal showed cancellation scheduled at the trial end, but a mirror that checked only `cancel_at_period_end` told the user the plan would renew.

**How to apply:** Derive the user-facing cancellation indicator from both Stripe cancellation fields against the current period end; do not interpret `canceled_at` alone as immediate loss of trial access.