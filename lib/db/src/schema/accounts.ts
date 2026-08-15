import { pgTable, uuid, text, timestamp, boolean, integer, doublePrecision } from "drizzle-orm/pg-core";

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
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accountUsers = pgTable("account_users", {
  id:          uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  accountId:   uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  role:        text("role").default("member"),   // "admin" | "member"
  email:       text("email"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
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

export type Account     = typeof accounts.$inferSelect;
export type AccountUser = typeof accountUsers.$inferSelect;
export type AdminUser   = typeof adminUsers.$inferSelect;
export type TokenUsage  = typeof tokenUsage.$inferSelect;
