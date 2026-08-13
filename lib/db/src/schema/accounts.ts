import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

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

export type Account     = typeof accounts.$inferSelect;
export type AccountUser = typeof accountUsers.$inferSelect;
export type AdminUser   = typeof adminUsers.$inferSelect;
