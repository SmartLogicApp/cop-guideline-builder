---
name: Build-time smoke isolation
description: Safety boundary for release checks that execute compiled production entry points.
---

Compiled-server smoke checks must launch with an explicit minimal environment, not inherited process credentials, and must suppress startup integrations that can mutate shared data or external services.

**Why:** Production entry points may bootstrap authorization records, migrate vendor schemas, create webhooks, or start backfills before listening. Inheriting the agent or CI environment turns an otherwise read-only build check into an authorized mutation.

**How to apply:** When a build or release check launches a production entry point, pass only required non-secret variables, use isolated local endpoints for mandatory service configuration, and provide a narrowly scoped smoke mode for mutating startup work. Keep normal production startup unchanged.