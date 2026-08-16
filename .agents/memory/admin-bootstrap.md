---
name: Admin bootstrap pattern
description: How super-admin access is granted. Dev and production Clerk IDs differ — all three must be covered.
---

# Super-Admin Bootstrap

## Critical: Three Clerk IDs are now in the hardcoded list

| Environment | Clerk User ID | Notes |
|---|---|---|
| Dev | `user_3HyQAQQh8oexrrANO8yBOIYm2m8` | Dev Clerk tenant |
| Production (facility-owner) | `user_3HpG4wWADUbnkJS3D2aGQspgGFP` | Registered a facility on prod; NOT the admin |
| **Production (actual admin)** | `user_3HxczU4Qjnwl3L2O5a8TssjtfON` | Confirmed via `/api/accounts/whoami` |

All three are hardcoded in:
- `artifacts/api-server/src/routes/accounts.ts` (`HARDCODED_SUPER_ADMINS` array in `/me` route)
- `artifacts/api-server/src/index.ts` (`bootstrapSuperAdmins()`)
- `index.jsx` (`ADMIN_CLERK_IDS` array, checked via `useUser()` client-side)

## How to find the real production Clerk ID

Ask the user to visit `/api/accounts/whoami` while signed in to the live URL. This returns `{"clerkUserId":"user_3H..."}` — that is their actual ID. Do NOT trust `account_users` table alone; that shows whoever *registered a facility*, which may be a different person.

**Why:** The dev and production Clerk environments assign different user IDs to the same email. The `account_users` table showed `user_3HpG4wWADUbnkJS3D2aGQspgGFP` (the facility-registration account), not the admin's real sign-in ID. The `ADMIN_CLERK_USER_IDS` secret contained a garbage/masked value — never rely on it.

## Current approach

`accounts.ts` `/me` route: checks `HARDCODED_SUPER_ADMINS.includes(userId)` — no DB or secret dependency.

`index.jsx`: checks `ADMIN_CLERK_IDS.includes(user?.id)` via `useUser()` — works instantly from Clerk session, no API call or cache needed.

`index.ts` `bootstrapSuperAdmins()`: upserts all IDs into `admin_users` on every server startup.

## Production DB write limitation

`executeSql` in CodeExecution is **read-only** against the production database. To write: deploy code that does it on startup (bootstrap), or use the app's own authenticated API endpoints.

## ETags fixed

`app.ts` has `app.set("etag", false)` — prevents browsers from getting stale 304 responses for `/api/accounts/me`.
