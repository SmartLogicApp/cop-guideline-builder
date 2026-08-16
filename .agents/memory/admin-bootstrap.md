---
name: Admin bootstrap pattern
description: How super-admin access is granted. Dev and production Clerk IDs differ — both must be covered.
---

# Super-Admin Bootstrap

## Critical: Dev vs Production Clerk IDs are DIFFERENT
- Dev Clerk ID: `user_3HyQAQQh8oexrrANO8yBOIYm2m8`
- Production Clerk ID: `user_3HpG4wWADUbnkJS3D2aGQspgGFP`

Both are hardcoded in `artifacts/api-server/src/routes/accounts.ts` (`HARDCODED_SUPER_ADMINS` array) and `artifacts/api-server/src/index.ts` (bootstrap).

## Current approach
`accounts.ts` `/me` route hardcodes both IDs in `HARDCODED_SUPER_ADMINS` so `isSuperAdmin` is true for either ID regardless of secret or DB state.

`index.ts` `bootstrapSuperAdmins()` runs on startup and upserts both IDs into `admin_users` table.

**Why:** Dev and prod Clerk environments assign different user IDs to the same person. Only the production account_users table reveals the production Clerk ID (`user_3HpG4wWADUbnkJS3D2aGQspgGFP` found in account_users). The ADMIN_CLERK_USER_IDS secret was also stuck at an invalid masked value (`0925IsaHec*1198`) — never rely on that secret.

**How to apply:** When adding a new super-admin, add their prod Clerk ID (found in production `account_users` table) to `HARDCODED_SUPER_ADMINS` in both files, then deploy.

## Production DB write limitation
`executeSql` in CodeExecution is **read-only** against the production database. To write: deploy code that does it on startup (bootstrap), or use the app's own authenticated API endpoints.

## Finding production Clerk IDs
Query production `account_users` table: `SELECT clerk_user_id, email FROM account_users ORDER BY created_at;` — this shows the real production Clerk ID for each registered user.
