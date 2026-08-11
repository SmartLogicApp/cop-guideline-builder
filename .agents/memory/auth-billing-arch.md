---
name: Auth and billing architecture
description: How user accounts, CCN registration, Clerk auth, and Stripe billing are wired together in this project.
---

## Auth stack
- **Clerk** (Replit-managed, `not_configured` → provisioned in this session)
- Cookie-based on web — no bearer tokens. Do NOT add Authorization headers to browser API calls.
- `clerkMiddleware` from `@clerk/express` mounts in `app.ts` after Clerk proxy and Stripe webhook routes.
- `requireAuth` helper in `routes/accounts.ts` reads `getAuth(req).userId`.

## CCN model
- One `accounts` row per CMS Certification Number (CCN, 6-char alphanumeric).
- `account_users` links Clerk user IDs → accounts. First user = admin, subsequent = member.
- Subscription is per CCN (account), not per user.
- Trial: 30 days, `subscription_status = 'trial'`, `trial_ends_at` set at registration.

## Key API routes
- `GET /api/accounts/validate-ccn?ccn=` — CMS Care Compare multi-dataset lookup, no auth required.
- `GET /api/accounts/me` — requires auth, returns `{ account, accountUser, isActive }`.
- `POST /api/accounts/register` — requires auth, creates or joins a CCN account.
- `POST /api/billing/checkout` — requires auth + Stripe connected, returns Stripe checkout URL.
- `GET  /api/billing/portal` — requires auth + Stripe connected, returns Stripe portal URL.

## Stripe
- **Not connected yet** — `initStripeIfAvailable()` in `index.ts` skips gracefully if credentials missing.
- `stripeClient.ts` fetches credentials from Replit connector API at runtime.
- When Stripe IS connected: seed products (Individual $99, Facility $299, Enterprise custom), then update `PLANS` price IDs in `artifacts/cop-guideline-builder/src/pages/billing.tsx`.

## Frontend routing (wouter, Clerk)
- `/` → `HomeRedirect`: Landing (signed-out) or main app (signed-in + account).
- `/sign-in/*?` and `/sign-up/*?` — Clerk `<SignIn>`/`<SignUp>` with `routing="path"`.
- `/register-ccn` — protected, CCN entry + CMS validation + account creation.
- `/billing` — protected, plan cards + Stripe checkout.
- Clerk component API uses `<Show when="signed-in">` / `<Show when="signed-out">` (NOT `SignedIn`/`SignedOut` — those don't exist in @clerk/react v6).
- `publishableKeyFromHost` lives at `@clerk/react/internal`.

## DB schema (public schema)
- `accounts(id, ccn, facility_name, facility_type, state, city, zip, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, created_at, updated_at)`
- `account_users(id, clerk_user_id, account_id, role, email, created_at)`
- Stripe data lives in the `stripe` schema managed by `stripe-replit-sync` (auto-created when Stripe is connected).

**Why:**
The CCN-per-facility billing model means subscriptions are institution-level, not user-level. Healthcare compliance departments are small (1–5 people) so per-seat pricing would undervalue the product relative to institution size and risk exposure.
