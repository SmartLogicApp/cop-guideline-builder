import app from "./app";
import { logger } from "./lib/logger";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);
const readinessSmokeTest = process.env.API_READINESS_SMOKE === "1";
const shutdownGracePeriodMs = Number(process.env.API_SHUTDOWN_GRACE_PERIOD_MS ?? "10000");
if (!Number.isFinite(shutdownGracePeriodMs) || shutdownGracePeriodMs <= 0) {
  throw new Error("API_SHUTDOWN_GRACE_PERIOD_MS must be a positive number.");
}

// ── Optional Stripe init ──────────────────────────────────────────────────────
// Skips silently if the Stripe integration isn't connected yet.
async function initStripeIfAvailable() {
  try {
    const { runMigrations }  = await import("stripe-replit-sync");
    const { getStripeSync }  = await import("./stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    // Confirm the connector is available before running the vendor-managed
    // Stripe schema setup. Unconnected deployments must not mutate the DB.
    const stripeSync = await getStripeSync();

    logger.info("Initializing Stripe schema…");
    await runMigrations({ databaseUrl });

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

if (!readinessSmokeTest) {
  await initStripeIfAvailable();
}

// ── Bootstrap super-admins into the DB on every startup ──────────────────────
// Reads valid Clerk user IDs from ADMIN_CLERK_USER_IDS (comma-separated) and
// upserts them into admin_users so the button works even if the secret is stale.
// Also includes a hardcoded fallback so production never loses access.
async function bootstrapSuperAdmins() {
  const ids = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("user_")); // only real Clerk IDs

  for (const clerkUserId of ids) {
    await db.execute(sql`
      INSERT INTO admin_users (clerk_user_id, email, label, is_active, added_by)
      VALUES (${clerkUserId}, 'super-admin', 'Super Admin', true, 'system')
      ON CONFLICT (clerk_user_id) DO UPDATE SET is_active = true
    `);
  }

  logger.info({ count: ids.length }, "Super-admin bootstrap complete");
}

if (!readinessSmokeTest) {
  await bootstrapSuperAdmins();
}

if (readinessSmokeTest) {
  if (process.env.API_SHUTDOWN_SMOKE_LINGERING_TIMER === "1") {
    setInterval(() => undefined, 60_000);
  }
}

const server = app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
});

let shutdownStarted = false;
let activeRequests = 0;

server.on("request", (_request, response) => {
  activeRequests += 1;
  let requestFinished = false;
  const finishRequest = () => {
    if (requestFinished) return;
    requestFinished = true;
    activeRequests -= 1;
    if (shutdownStarted && activeRequests === 0) {
      server.closeIdleConnections();
    }
  };
  response.once("finish", finishRequest);
  response.once("close", finishRequest);
});

async function shutdown(signal: NodeJS.Signals) {
  if (shutdownStarted) {
    logger.warn({ signal }, "Shutdown already in progress");
    return;
  }
  shutdownStarted = true;
  logger.info(
    { signal, gracePeriodMs: shutdownGracePeriodMs, activeRequests },
    "Graceful shutdown started",
  );

  const deadline = setTimeout(() => {
    logger.error("Graceful shutdown deadline reached; closing remaining connections");
    server.closeAllConnections();
    process.exit(1);
  }, shutdownGracePeriodMs);

  try {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
    if (process.env.API_SHUTDOWN_SMOKE_STALL_POOL === "1") {
      await new Promise<never>(() => undefined);
    } else {
      await pool.end();
    }
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
