---
name: Affiliate payout settlement boundary
description: Conditions for safely coordinating historical commissions with reviewed Connect payouts
---

Never re-enable the historical affiliate payout settlement action merely because an affiliate passes the current compliance checklist. A settlement must reserve the exact commission rows under a transactional affiliate lock, be uniquely associated with one payout, and verify the resulting Stripe transfer identity, destination, amount, and currency before those commissions are marked paid. A partial transfer reversal is a manual reconciliation case, not permission to release every claim automatically.

**Why:** The original manual path marked the legacy commission ledger paid before payment was actually sent. A second payout workflow and asynchronous Connect webhooks make duplicate or unrelated settlement possible unless both ledgers agree on exact claims and transfer evidence.

**How to apply:** Any new payout route, batch, retry, webhook, or reactivation of a historical endpoint must use the shared eligibility gate, exact claim ownership, and verified transfer evidence. Keep the old settlement path blocked until it is unified with those controls; preserve old payout history.