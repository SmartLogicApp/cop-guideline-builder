import app from "./app";
import { logger } from "./lib/logger";

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

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
});
