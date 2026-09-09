import { pgTable, uuid, text, timestamp, boolean, integer, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  ccn:                  text("ccn").unique().notNull(),
  facilityName:         text("facility_name").notNull(),
  facilityType:         text("facility_type"),
  state:                text("state"),
  city:                 text("city"),
  zip:                  text("zip"),
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus:   text("subscription_status").default("trial"),
  trialEndsAt:          timestamp("trial_ends_at", { withTimezone: true }),
  trialWarningEmailSentAt: timestamp("trial_warning_email_sent_at", { withTimezone: true }),
  termsAcceptedAt:      timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion:         text("terms_version"),
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
  inputTokens:     integer("input_tokens").notNull().default(0),
  outputTokens:    integer("output_tokens").notNull().default(0),
  inputCostUsd:    doublePrecision("input_cost_usd").notNull().default(0),
  outputCostUsd:   doublePrecision("output_cost_usd").notNull().default(0),
  rawCostUsd:      doublePrecision("raw_cost_usd").notNull().default(0),
  markedUpCostUsd: doublePrecision("marked_up_cost_usd").notNull().default(0),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow(),
});

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

export type Account     = typeof accounts.$inferSelect;
export type AccountUser = typeof accountUsers.$inferSelect;
export type AdminUser   = typeof adminUsers.$inferSelect;
export type TokenUsage  = typeof tokenUsage.$inferSelect;

export type GapHistory   = typeof gapHistory.$inferSelect;
