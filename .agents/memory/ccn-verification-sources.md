---
name: CCN verification sources
description: Boundary between queryable CMS Care Compare datasets and separate provider enrollment files.
---

Use the CMS Provider Data Catalog datastore for direct CCN verification only when the provider type has a queryable Care Compare dataset. FQHC and OPO listings are published through separate CMS enrollment or Provider of Services files, so they must remain on manual review until those sources have a reliable query integration.

**Why:** Supplying a catalog identifier from a different CMS API as though it were a Care Compare datastore ID creates a lookup that silently fails and presents valid providers as missing.

**How to apply:** Verify each dataset's live API endpoint and exact CCN, name, city, and state fields before marking a provider type as automatic. Keep unsupported types explicit and user-visible rather than treating them as generic “not found” results.