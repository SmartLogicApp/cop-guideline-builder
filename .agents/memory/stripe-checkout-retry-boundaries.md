---
name: Stripe checkout retry boundaries
description: Avoid abandoned checkout dead ends, repeat trials, and early or duplicate subscription charges.
---

An existing Stripe customer does not imply a completed subscription. Keep checkout retry available after an abandoned session, but never issue a second session for a recoverable subscription. A fixed account-level session idempotency key can replay an expired session; a fresh attempt must first reconcile open sessions and subscription history. Once any subscription has existed, do not issue another introductory trial.

**Why:** Customers can leave a hosted Checkout session without subscribing, while failed-payment subscriptions may remain recoverable. Treating both as the same state either strands new customers or risks duplicate charges. Existing local trials can also have less time remaining than Stripe's minimum future trial-end window; immediate checkout in that window would charge before the promised end.

**How to apply:** Before creating checkout, verify the customer's complete Stripe subscription state, reuse or expire appropriate open sessions, preserve any eligible existing trial's absolute end, and defer checkout if its remaining trial cannot be represented without charging early. Keep the server-enforced advertised direct trial length consistent with checkout copy.