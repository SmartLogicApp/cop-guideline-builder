---
name: Long generation transport
description: Transport and lifecycle rules for long authenticated AI generation without durable customer-content storage.
---

Long AI generation must stay on one authenticated Server-Sent Events request with JSON progress, result, and error payloads. Do not return to process-local job polling or persist prompts/results merely to bridge request duration. Background identity/access refreshes must preserve the mounted workspace while a request is active.

**Why:** Model calls commonly run for 45-100 seconds. Direct idle responses and process-local polling are unreliable across proxies and autoscaling, while identity refreshes that temporarily replace the workspace silently abort the browser controller and discard successful upstream work.

**How to apply:** Use streamed keepalives and a terminal JSON event, cancel upstream work when the client genuinely disconnects, validate the terminal payload before rendering, and reserve blocking access-loading screens for initial identity resolution or an actual identity change.