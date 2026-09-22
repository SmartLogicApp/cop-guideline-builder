import { pgTable, uuid, text, timestamp, boolean, integer, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  // The account's single required identifier. Historically always a CMS
  // Certification Number — hence the column name, kept so no live data moves —
  // but it now holds whichever identifier the buyer actually has. Read it
  // together with identifierType; on its own it does not say what it is.
  // Required and unique on purpose: this is the key the register endpoint
  // looks accounts up by, so it is what keeps one organisation on one
  // subscription. See api-server/src/lib/provider-identifier.ts.
  ccn:                  text("ccn").unique().notNull(),
  // "ccn" | "npi" | "clia" | "consultant". Defaults to ccn, which is correct
  // for every row that existed before this column did.
  identifierType:       text("identifier_type").default("ccn").notNull(),
  facilityName:         text("facility_name").notNull(),
  facilityType:         text("facility_type"),
  state:                text("state"),
  city:                 text("city"),
  zip:                  text("zip"),
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId:        text("stripe_price_id"),
  subscriptionStatus:   text("subscription_status").default("trial"),
  subscriptionCurrentPeriodStart: timestamp("subscription_current_period_start", { withTimezone: true }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").default(false).notNull(),
  subscriptionCanceledAt: timestamp("subscription_canceled_at", { withTimezone: true }),
  trialEndsAt:          timestamp("trial_ends_at", { withTimezone: true }),
  trialWarningEmailSentAt: timestamp("trial_warning_email_sent_at", { withTimezone: true }),
  termsAcceptedAt:      timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion:         text("terms_version"),
  // Which affiliate, if any, this account is attributed to. Captured from the
  // signup URL at registration and never changed afterwards — attribution that
  // can be edited later is attribution that will be argued about later.
  //
  // Recorded now, before any affiliate programme exists, because it is the one
  // piece of affiliate data that cannot be backfilled: an account registered
  // without it has no recoverable referrer. Nothing reads this column yet.
  referralCode:         text("referral_code"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accountUsers = pgTable("account_users", {
  id:                         uuid("id").primaryKey().defaultRandom(),
  clerkUserId:                text("clerk_user_id").unique().notNull(),
  accountId:                  uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  role:                       text("role").default("member"),   // "admin" | "member"
  email:                      text("email"),
  hasComplimentaryAccess:     boolean("has_complimentary_access").default(false).notNull(),
  complimentaryAccessGrantedBy: text("complimentary_access_granted_by"),
  complimentaryAccessGrantedAt: timestamp("complimentary_access_granted_at", { withTimezone: true }),
  createdAt:                  timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Platform-level admins — managed via the /admin UI; bypasses subscription checks.
export const adminUsers = pgTable("admin_users", {
  id:          uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  email:       text("email").notNull(),
  label:       text("label"),                      // optional display name / note
  isActive:    boolean("is_active").default(true).notNull(),
  addedBy:     text("added_by").notNull(),          // Clerk user ID of the super-admin who granted access
  addedAt:     timestamp("added_at", { withTimezone: true }).defaultNow(),
});

// ── Token usage — one row per AI generation request ─────────────────────────
// rawCostUsd  = actual API cost at Claude list prices
// markedUpCostUsd = rawCostUsd × 1.5 (50% markup) → what the user is billed
export const tokenUsage = pgTable("token_usage", {
  id:              uuid("id").primaryKey().defaultRandom(),
  accountId:       uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  clerkUserId:     text("clerk_user_id").notNull(),
  model:           text("model").notNull(),
  feature:         text("feature"),                              // optional: "guidelines" | "policy" | "inspection" | "gap"
  // What this generation was FOR, as opposed to who ran it.
  //
  // Nothing in the app ties a generation to the account's registered facility:
  // the provider type comes from a picker in the browser and the facility name
  // is free text inside the prompt. So one subscription can produce documents
  // for any number of facilities, and until these two columns existed there
  // was no record that it had. They block nothing — they are here so the
  // question "does a typical account serve one facility or nine?" can be
  // answered from data rather than guessed at.
  //
  // Both are client-asserted and unverified. Treat them as a signal worth
  // looking at, never as proof of what a customer did.
  institution:     text("institution"),                          // provider type: "hospital" | "snf" | "hospice" | …
  facilityLabel:   text("facility_label"),                       // the specific facility, when the client names one
  inputTokens:     integer("input_tokens").notNull().default(0),
  outputTokens:    integer("output_tokens").notNull().default(0),
  inputCostUsd:    doublePrecision("input_cost_usd").notNull().default(0),
  outputCostUsd:   doublePrecision("output_cost_usd").notNull().default(0),
  rawCostUsd:      doublePrecision("raw_cost_usd").notNull().default(0),
  markedUpCostUsd: doublePrecision("marked_up_cost_usd").notNull().default(0),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Terms acceptance history ────────────────────────────────────────────────
// accounts.terms_version / terms_accepted_at hold the CURRENT accepted version,
// which is what the checkout gate reads. This table is the append-only record
// of every acceptance, so a customer who accepted 1.0 and later 2.0 leaves
// evidence of both. Rows are never updated or deleted.
export const termsAcceptances = pgTable("terms_acceptances", {
  id:           uuid("id").primaryKey().defaultRandom(),
  accountId:    uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }).notNull(),
  clerkUserId:  text("clerk_user_id").notNull(),          // who clicked, not just which facility
  termsVersion: text("terms_version").notNull(),
  acceptedAt:   timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  // Standard clickwrap evidence. Nullable so the flow works if you choose not
  // to collect them — see terms-v2 review notes before enabling in production,
  // as the Privacy Policy needs to cover what is stored.
  ipAddress:    text("ip_address"),
  userAgent:    text("user_agent"),
}, (table) => [
  index("terms_acceptances_account_id_idx").on(table.accountId),
  index("terms_acceptances_version_idx").on(table.termsVersion),
]);

export const gapHistory = pgTable("gap_history", {
  id:             text("id").primaryKey(),
  clerkUserId:    text("clerk_user_id"),
  sessionTokenHash: text("session_token_hash"),
  institution:    text("institution").notNull(),
  institutionLabel: text("institution_label").notNull(),
  topic:          text("topic").notNull(),
  score:          integer("score"),
  scannedAt:      timestamp("scanned_at", { withTimezone: true }).notNull(),
  result:         jsonb("result").notNull(),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("gap_history_clerk_user_id_idx").on(table.clerkUserId),
  index("gap_history_session_token_hash_idx").on(table.sessionTokenHash),
  index("gap_history_scanned_at_idx").on(table.scannedAt),
]);
export const ecfrCacheEntries = pgTable("ecfr_cache_entries", {
  institutionValue: text("institution_value").primaryKey(),
  text:             text("text").notNull(),
  fetchDate:        text("fetch_date").notNull(),
  source:           text("source").notNull(),
  expiresAt:        timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Account         = typeof accounts.$inferSelect;
export type AccountUser     = typeof accountUsers.$inferSelect;
export type TermsAcceptance = typeof termsAcceptances.$inferSelect;
export type AdminUser   = typeof adminUsers.$inferSelect;
export type TokenUsage  = typeof tokenUsage.$inferSelect;

export type GapHistory   = typeof gapHistory.$inferSelect;
