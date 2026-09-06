---
name: Ephemeral customer policy handling
description: Durable privacy boundary for uploaded customer policies and organization-specific analysis results.
---

Customer policies, extracted text, derived gap findings, and generated organization-specific documents must be temporary session data. Regulatory content and standard templates may be permanent application data; proprietary customer content may not.

**Why:** CMS Compliance Suite is a compliance-intelligence product, not a customer document repository. Keeping proprietary content in databases, object storage, permanent browser storage, logs, or analytics would violate the required product and privacy boundary.

**How to apply:** Keep policy sessions user-bound and short-lived, preserve them only long enough to survive an active-session refresh, purge them on logout/user change/expiry, authenticate and ownership-check transient server results, sanitize errors, and preserve download/export before expiry.