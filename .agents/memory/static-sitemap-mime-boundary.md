---
name: Static sitemap MIME boundary
description: How to satisfy an exact application/xml requirement for a public sitemap in this artifact setup.
---

When the requirement specifically demands `application/xml`, do not assume a public static XML file or a self-rewrite gives that header. The development proxy served the file as `text/xml`, even though its body was valid sitemap XML. A dedicated response with an explicit content type routed ahead of the SPA fallback was needed.

**Why:** A body-only sitemap test passed while the externally visible response still failed the requested MIME type. Production static handling should not be assumed to repair a preview MIME mismatch.

**How to apply:** Check the HTTP status, response body, and Content-Type through the shared proxy. If using a separate backend service for a root SEO route, register its exact path in artifact routing so the SPA service does not intercept it. Keep static and dynamic copies synchronized if both exist.