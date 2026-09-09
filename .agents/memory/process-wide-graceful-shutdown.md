---
name: Process-wide graceful shutdown
description: Reliability rules for bounding server restarts while allowing active HTTP requests to finish.
---

Graceful shutdown deadlines must cover the entire process, including HTTP draining, resource cleanup, and unrelated referenced handles. A socket that was active when shutdown began may become an idle keep-alive socket later, so it must be closed after its response finishes rather than assuming the initial listener close handles it.

**Why:** HTTP connection closure alone cannot bound stalled database cleanup or background timers, and keep-alive transitions can prevent the listener's close callback from resolving even after the response body completes.

**How to apply:** Stop accepting connections first, drain active responses, close newly idle keep-alive connections, close long-lived resources, and explicitly exit successfully. Keep an authoritative timer that forcibly exits nonzero if any stage exceeds the grace period.