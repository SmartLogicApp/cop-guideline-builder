import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { extractEmail, verifyClerkWebhook } from "./lib/clerk-webhook.js";
import { sendViaResend } from "./lib/resend-mailer.js";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import router from "./routes";
import { logger } from "./lib/logger";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isPaymentAcceptanceEnabled } from "./lib/payment-config";

const app: Express = express();

/** Express gives header values as string | string[]; take the first either way. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Trust the Replit/Cloudflare proxy so express-rate-limit reads the real IP
// from X-Forwarded-For instead of the internal proxy address.
app.set("trust proxy", 1);

// Disable ETags globally — prevents browsers from caching API responses
// via If-None-Match / 304, which was causing stale isSuperAdmin=false results.
app.set("etag", false);

// Production starts listening only after startup dependencies have initialized,
// so a response here means the API is ready to receive traffic. Keep this route
// ahead of Clerk and all authenticated API routing.
app.get("/api/healthz", (_req, res) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

if (process.env.API_READINESS_SMOKE === "1") {
  app.get("/api/shutdown-smoke", (_req, res) => {
    const delayMs = Number(process.env.API_SHUTDOWN_SMOKE_RESPONSE_DELAY_MS ?? "200");
    res.setHeader("Content-Type", "application/json");
    res.flushHeaders();
    setTimeout(() => res.end('{"status":"finished"}'), delayMs);
  });
}

// ── Logging ──────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// ── Clerk proxy (must be before body parsers) ─────────────────────────────────
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── Stripe webhook (must be before express.json()) ────────────────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!isPaymentAcceptanceEnabled()) {
      return res.status(503).json({ error: "Payment acceptance is not enabled yet." });
    }
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error(
        { errorName: err?.name, errorMessage: err?.message },
        "Stripe webhook error",
      );
      return res.status(400).json({ error: "Webhook processing failed" });
    }
  },
);

// ── Clerk email webhook (must be before express.json(), like Stripe's) ───────
//
// Clerk is configured with "Delivered by Clerk" OFF for its email templates, so
// instead of sending through SendGrid's shared pool it posts the message here
// and this application sends it through Resend. See lib/resend-mailer.ts for
// why: Outlook silently drops the SendGrid path, which made signup impossible
// for anyone on outlook.com or hotmail.com.
//
// express.raw() matters. Svix signs the exact bytes received; verifying a
// re-serialized object never matches, because JSON.stringify does not reproduce
// key order, unicode escaping or whitespace byte-for-byte.
app.post(
  "/api/clerk/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const verification = verifyClerkWebhook(
      req.body as Buffer,
      {
        id: firstHeader(req.headers["svix-id"]),
        timestamp: firstHeader(req.headers["svix-timestamp"]),
        signature: firstHeader(req.headers["svix-signature"]),
      },
      process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() ?? "",
    );

    if (!verification.ok) {
      // 401, and deliberately without echoing the reason to the caller. An
      // unauthenticated endpoint that explains precisely why a signature failed
      // is a tool for forging a working one.
      logger.warn({ reason: verification.reason }, "Clerk webhook rejected");
      return res.status(401).json({ error: "Invalid signature" });
    }

    let event: unknown;
    try {
      event = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Malformed payload" });
    }

    const email = extractEmail(event as any);
    // Not an email event, or not a sendable one. 200 on purpose: Clerk delivers
    // every subscribed event type here, and answering non-2xx would make it
    // retry events that were handled correctly by ignoring them.
    if (!email) return res.status(200).json({ received: true, sent: false });

    const result = await sendViaResend(email);
    if (!result.sent) {
      // 500 so Clerk retries. A verification code that failed to send is worth
      // another attempt — the alternative is a customer staring at a sign-in
      // screen for a code that will never arrive.
      logger.error(
        { slug: email.slug, status: result.status, errorMessage: result.error },
        "Clerk email send failed",
      );
      return res.status(500).json({ error: "Send failed" });
    }

    // The recipient address is NOT logged. These messages carry login codes,
    // and the pairing of address and timestamp in a log is exactly what should
    // not be sitting in a log aggregator.
    logger.info({ slug: email.slug, resendId: result.id }, "Clerk email sent via Resend");
    return res.status(200).json({ received: true, sent: true });
  },
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ type: ["application/json", "text/plain"], limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Clerk session middleware ───────────────────────────────────────────────────
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// ── Rate limiting (AI generation only) ───────────────────────────────────────
const generateLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: "Too many requests — please wait a moment before generating again." },
  skip:           (req) => req.method === "GET",
});
app.use("/api/generate", generateLimiter);

/**
 * The affiliate application form is the only unauthenticated write endpoint in
 * the API, so it is the only one a stranger can call in a loop. Without a limit
 * here, anyone could fill the affiliates table with junk applications — which
 * costs nothing to send and real time to clean up, and would bury a genuine
 * applicant in the operator's review queue.
 *
 * Five per hour per IP is far above what a real applicant needs (they apply
 * once) and far below what makes flooding worthwhile.
 */
const affiliateApplyLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: "Too many applications from this location. Please email us instead." },
  skip:            (req) => req.method !== "POST",
});
app.use("/api/affiliates/apply", affiliateApplyLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

export default app;
