---
name: Ephemeral customer policy handling
description: Durable privacy boundary for uploaded customer policies and organization-specific analysis results.
---

Customer policies and extracted text must be temporary session data. Saved gap-history results may be durable when explicitly requested by the user, but raw source policy text and generated organization-specific documents remain ephemeral. Regulatory content and standard templates may be permanent application data.

**Why:** CMS Compliance Suite is not a customer document repository, but users explicitly need durable scan history across browsers and devices. The storage boundary must preserve that feature without retaining uploaded source documents.

**How to apply:** Keep raw policy sessions user-bound and short-lived, purge source text on logout/user change/expiry, and never send it to history endpoints. Scope durable cross-device scan history to a Clerk user. Anonymous history may use an opaque token only within the active browser session. Ownership-check every request and mutation, abort synchronization on identity changes, and sanitize errors.