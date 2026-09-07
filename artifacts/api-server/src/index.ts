import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { adminUsers } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Optional Stripe init ──────────────────────────────────────────────────────
// Skips silently if the Stripe integration isn't connected yet.
async function initStripeIfAvailable() {
  try {
    const { runMigrations }  = await import("stripe-replit-sync");
    const { getStripeSync }  = await import("./stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    logger.info("Initializing Stripe schema…");
    await runMigrations({ databaseUrl, schema: "stripe" });

    const stripeSync = await getStripeSync();

    const domains     = process.env.REPLIT_DOMAINS?.split(",") ?? [];
    const webhookBase = `https://${domains[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBase}/api/stripe/webhook`);

    // Backfill runs in background — don't await so startup isn't blocked.
    stripeSync.syncBackfill().catch((err) =>
      logger.warn({ err }, "Stripe backfill failed (non-fatal)"),
    );

    logger.info("Stripe initialized");
  } catch (err: any) {
    // Not fatal — Stripe simply isn't connected yet.
    logger.info({ msg: err?.message }, "Stripe not available (will enable when connected)");
  }
}

await initStripeIfAvailable();

async function migrateEcfrCache() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ecfr_cache_entries (
      institution_value text PRIMARY KEY,
      text text NOT NULL,
      fetch_date text NOT NULL,
      source text NOT NULL,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

await migrateEcfrCache();

// ── Bootstrap super-admins into the DB on every startup ──────────────────────
// Reads valid Clerk user IDs from ADMIN_CLERK_USER_IDS (comma-separated) and
// upserts them into admin_users so the button works even if the secret is stale.
// Also includes a hardcoded fallback so production never loses access.
async function bootstrapSuperAdmins() {
  const HARDCODED_SUPER_ADMINS = [
    "user_3HyQAQQh8oexrrANO8yBOIYm2m8", // dev Clerk ID
    "user_3HpG4wWADUbnkJS3D2aGQspgGFP",  // production facility-owner account
    "user_3HxczU4Qjnwl3L2O5a8TssjtfON",  // actual production admin Clerk ID ✓ confirmed
  ];

  const fromEnv = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("user_")); // only real Clerk IDs

  const ids = Array.from(new Set([...HARDCODED_SUPER_ADMINS, ...fromEnv]));

  for (const clerkUserId of ids) {
    await db.execute(sql`
      INSERT INTO admin_users (clerk_user_id, email, label, is_active, added_by)
      VALUES (${clerkUserId}, 'super-admin', 'Super Admin', true, 'system')
      ON CONFLICT (clerk_user_id) DO UPDATE SET is_active = true
    `);
  }

  logger.info({ count: ids.length }, "Super-admin bootstrap complete");
}

await bootstrapSuperAdmins();

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
});
