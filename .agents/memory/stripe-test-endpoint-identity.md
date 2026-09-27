---
name: Stripe Test endpoint identity
description: Why Test webhook reconciliation must target a configured endpoint ID rather than an exact URL search.
---

For preview-address synchronization, retrieve the intended Stripe Test billing destination by a configured ID. Validate that it is enabled, Test-mode, on the expected billing webhook path, and subscribed to core billing events before a URL-only update. Preserve an existing benign query suffix.

**Why:** The existing active destination had successful deliveries but a `?v=2` suffix. An exact no-query URL filter falsely reported no matching endpoint. Listing by path can also pick up the wrong destination if multiple exist. Stripe does not expose a previously created endpoint's signing secret through retrieval.

**How to apply:** Keep the explicit ID in development configuration, never create a duplicate on lookup failure, and do not change endpoint events or signing secrets while updating the preview host. Do not claim a secret match from retrieval alone; use verified delivery evidence if available.