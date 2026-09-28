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

Setup-mode Checkout with this Stripe account's Managed Payments default rejects card collection unless Managed Payments is explicitly disabled for that setup session. Stripe also rejects a `setup_intent_data[usage]` parameter on that Checkout request; setup mode already prepares the card for future off-session use.

**Why:** An authenticated Test-mode Checkout returned `parameter_unknown` before displaying a card form, and then rejected setup mode under the Managed Payments default. A controlled per-session opt-out let a real Test card complete without changing account-wide settings.

**How to apply:** Keep the per-session setup-mode settings distinct from subscription-mode Checkout, and validate the hosted card page against the configured Stripe mode. For subscriptions created after an expired local trial, verify the first invoice actually charges automatically; a saved card plus an incomplete subscription is not proof of day-31 billing.