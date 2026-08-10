import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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

app.use("/api", router);

export default app;
