---
name: Autoscale lifecycle scheduling
description: Why subscription reconciliation and trial reminders need an external schedule on autoscale.
---

Do not claim a daily account-wide Stripe reconciliation or advance email reminder is reliable merely because an Autoscale API starts a timer or checks an account when its owner logs in. An idle deployment may scale to zero before the timer fires, and an inactive trialist may never trigger the login check.

**Why:** The current deployment target is Autoscale. A timer is useful opportunistically, and login-time reconciliation protects returning users, but neither is a 24-hour account-wide delivery guarantee.

**How to apply:** Arrange a production daily scheduled caller for the protected lifecycle sweep and verify the scheduled run's result. Treat that schedule as an explicit release dependency; retain webhook and login reconciliation as independent fallbacks.