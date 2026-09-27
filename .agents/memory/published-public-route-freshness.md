---
name: Published public-route freshness
description: Distinguishing generated SEO pages from what the published route actually serves.
---

For crawlability bugs, compare the raw HTTP response at both a public route and its generated `index.html` path in production. A pre-rendered file may exist and have correct metadata while the public route still serves the homepage because the published routing configuration or build is older.

**Why:** Local output had distinct affiliate metadata and body, but the live clean route initially returned homepage metadata and body; even the live direct HTML file was from an older build. Source-only assertions failed to catch the gap. After publishing the updated build, the user confirmed the clean route returned its own canonical, title, and description.

**How to apply:** Gate each public page's built HTML with content assertions, verify direct clean-path routing against a static preview, then check the actual custom-domain raw response after publishing. Never report production SEO fixed based solely on local build output.