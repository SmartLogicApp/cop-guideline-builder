import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Accept both application/json AND text/plain so the browser can POST without
// a Content-Type header (sending text/plain by default), which avoids the
// CORS preflight that Cloudflare/Replit's outer proxy can block.
app.use(express.json({ type: ["application/json", "text/plain"] }));
app.use(express.urlencoded({ extended: true }));

// Rate limit AI generation requests: max 10 per IP per minute.
// Polling (GET /api/generate/result) is excluded — it is cheap and must run freely.
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 10,                    // 10 generation requests per IP per minute
  standardHeaders: true,      // Return rate-limit headers (RateLimit-*)
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment before generating again." },
  skip: (req) => req.method === "GET", // polling calls are never rate-limited
});

app.use("/api/generate", generateLimiter);
app.use("/api", router);

export default app;
