---
name: Admin bootstrap pattern
description: How super-admin access is granted and why the ADMIN_CLERK_USER_IDS secret approach was abandoned in favor of a DB bootstrap.
---

# Super-Admin Bootstrap

## The rule
Super-admin access is determined by the `admin_users` DB table (`is_active = true`), **not** by the `ADMIN_CLERK_USER_IDS` env secret. The secret approach was abandoned because the Replit `requestSecrets` UI caused the user to repeatedly re-save the masked placeholder value (`0925IsaHec*1198`) instead of the real Clerk user ID.

## Current approach
`artifacts/api-server/src/index.ts` runs `bootstrapSuperAdmins()` on every startup:
- Reads valid Clerk IDs from `ADMIN_CLERK_USER_IDS` (filters to IDs starting with `user_`)
- Hardcodes `user_3HyQAQQh8oexrrANO8yBOIYm2m8` as a permanent fallback
- Upserts all of them into `admin_users` with `is_active = true`

This runs on both dev and production startup, so a redeploy is all that's needed to restore access.

**Why:** The `requestSecrets` flow does not clear the masked placeholder — users save the display mask instead of their real value. DB-based admin is more reliable and survives secret misconfiguration.

**How to apply:** When granting super-admin to a new user, insert their Clerk user ID directly into `admin_users` via the Admin UI (Team Access tab) or `executeSql` against dev + redeploy for production. Do NOT rely on `ADMIN_CLERK_USER_IDS` secret for super-admin detection.

## Production DB write limitation
`executeSql` in CodeExecution is **read-only** against the production database — INSERTs will fail. To write to production DB: deploy code that does the write on startup (like the bootstrap), or use the app's own API endpoints.
