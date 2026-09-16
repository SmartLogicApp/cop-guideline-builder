import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import router from "./routes";
import { logger } from "./lib/logger";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isPaymentAcceptanceEnabled } from "./lib/payment-config";

const app: Express = express();

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

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

export default app;
