import { Router, type IRouter, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  GenerateWithAnthropicBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { accountUsers, tokenUsage } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { getEcfrSource, isProviderContentAvailable } from "@workspace/cms-compliance-data";
import { readFacilityLabel } from "../lib/facility-label";
import { createEcfrService } from "../services/ecfr";
import { ecfrDatabaseAdapter } from "../services/ecfr-database-adapter";
import {
  generateComplianceContent,
  GENERATION_MODEL,
  GenerationTimeoutError,
  GenerationUpstreamError,
} from "../services/generation";
import { resolveTokenUsageAccountId } from "../lib/token-usage-attribution";

const router: IRouter = Router();
const { fetchEcfrText } = createEcfrService(ecfrDatabaseAdapter);

// ─── Claude model pricing (USD per 1M tokens) ────────────────────────────────

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6": { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-sonnet-4-5": { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-5":   { inputPer1M: 15.00, outputPer1M: 75.00 },
};
const MARKUP = 1.5; // 50% markup applied on top of raw API cost

function calcCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]!;
  const inputCostUsd  = (inputTokens  / 1_000_000) * pricing.inputPer1M;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const rawCostUsd    = inputCostUsd + outputCostUsd;
  const markedUpCostUsd = rawCostUsd * MARKUP;
  return { inputCostUsd, outputCostUsd, rawCostUsd, markedUpCostUsd };
}

type DataSource =
  | { kind: "ecfr"; fetchDate: string }
  | { kind: "ai" };

function sendGenerationEvent(
  res: Response,
  event: "progress" | "result" | "error",
  payload: unknown,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// POST /api/generate — paid access only; requireAuth also identifies usage owner.
/**
 * Per-account abuse guard, distinct from the IP limiter in app.ts.
 *
 * The IP limiter (10/minute) stops a burst from one machine. This one stops a
 * single account grinding away for hours — a script left in a loop, a scheduled
 * job someone points at the API — which is the case that could actually cost
 * real money while token usage is included in the flat fee.
 *
 * It is deliberately generous: 120 generations an hour is far beyond what a
 * compliance team does by hand, so a legitimate heavy user never meets it.
 * This is not a pricing cap and must not be tuned into one — if usage ever
 * needs limiting for cost reasons, that belongs in metered billing, disclosed
 * at checkout, not in a rate limiter that returns an error mid-survey-prep.
 * Override with GENERATE_ACCOUNT_HOURLY_MAX.
 */
const accountHourlyMax = (() => {
  const parsed = Number.parseInt(process.env.GENERATE_ACCOUNT_HOURLY_MAX?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
})();

const accountGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: accountHourlyMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).clerkUserId ?? req.ip ?? "anonymous",
  message: {
    error:
      "You have made an unusually high number of generation requests in the past hour. " +
      "Access will resume shortly. If you need a higher limit, contact support.",
  },
});

router.post("/generate", requireAuth, accountGenerateLimiter, requireActiveSubscription, async (req, res): Promise<void> => {
  const parsed = GenerateWithAnthropicBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ issueCount: parsed.error.issues.length }, "Invalid generation request");
    res.status(400).json({ error: "Invalid generation request" });
    return;
  }

  if (parsed.data.institutionValue && !isProviderContentAvailable(parsed.data.institutionValue)) {
    res.status(409).json({
      error: "Official CMS content for this provider type is pending verification. Generation is unavailable until verified sources are added.",
    });
    return;
  }

  // Which facility this generation is for. Unverified client input, sanitised
  // in lib/facility-label.ts, recorded but never gating the request.
  const facilityLabel = readFacilityLabel(req.body);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not configured");
    res.status(500).json({ error: "AI generation is not configured" });
    return;
  }

  const clerkUserId = (req as any).clerkUserId as string;
  const memberships = await db
    .select({ accountId: accountUsers.accountId })
    .from(accountUsers)
    .where(eq(accountUsers.clerkUserId, clerkUserId))
    .limit(2);
  const accountId = resolveTokenUsageAccountId(memberships);
  if (!accountId) {
    req.log.error(
      { hasMembership: memberships.length > 0 },
      "Generation blocked because the Clerk user has no unambiguous client account",
    );
    res.status(403).json({
      error: "This login is not linked to a client account. Contact support before generating content.",
    });
    return;
  }

  const upstreamController = new AbortController();
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sendGenerationEvent(res, "progress", {
    message: parsed.data.institutionValue
      ? "Fetching live regulatory data"
      : "Generating compliance content",
  });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(": keepalive\n\n");
    }
  }, 10_000);
  heartbeat.unref();
  const handleResponseClose = () => {
    if (!res.writableEnded) upstreamController.abort();
  };
  res.on("close", handleResponseClose);

  try {
    let systemPrompt = parsed.data.systemPrompt;
    let dataSource: DataSource = { kind: "ai" };

    if (parsed.data.institutionValue) {
      req.log.info({ institution: parsed.data.institutionValue }, "Fetching live eCFR data");
      const ecfr = await fetchEcfrText(parsed.data.institutionValue);

      if (ecfr.source === "ecfr" && ecfr.text) {
        dataSource = { kind: "ecfr", fetchDate: ecfr.fetchDate };
        systemPrompt =
          `AUTHORITATIVE CMS REGULATORY TEXT (live from eCFR.gov, retrieved ${ecfr.fetchDate}):\n` +
          `The following is the actual current text of ${getEcfrSource(parsed.data.institutionValue)?.label ?? "the applicable CFR part"}.\n` +
          `Use this as ground truth for all CMS citations. Do not contradict it.\n\n` +
          `---BEGIN eCFR TEXT---\n${ecfr.text}\n---END eCFR TEXT---\n\n` +
          systemPrompt;
        req.log.info({ chars: ecfr.text.length, date: ecfr.fetchDate }, "eCFR text injected");
      } else {
        req.log.warn(
          { institution: parsed.data.institutionValue },
          "eCFR fetch failed; falling back to AI knowledge",
        );
      }
    }

    sendGenerationEvent(res, "progress", { message: "Generating compliance content" });
    const generation = await generateComplianceContent({
      apiKey,
      systemPrompt,
      userContent: parsed.data.userContent,
      maxTokens: parsed.data.maxTokens,
    }, {
      signal: upstreamController.signal,
    });

    if (res.destroyed) return;
    const response = {
      content: generation.content,
      dataSource,
    };
    sendGenerationEvent(res, "result", response);
    res.end();

    try {
      const { inputTokens, outputTokens } = generation.usage;
      if (inputTokens > 0 || outputTokens > 0) {
        const costs = calcCost(GENERATION_MODEL, inputTokens, outputTokens);
        await db.insert(tokenUsage).values({
          accountId,
          clerkUserId,
          model: GENERATION_MODEL,
          institution: parsed.data.institutionValue ?? null,
          facilityLabel,
          inputTokens,
          outputTokens,
          inputCostUsd: costs.inputCostUsd,
          outputCostUsd: costs.outputCostUsd,
          rawCostUsd: costs.rawCostUsd,
          markedUpCostUsd: costs.markedUpCostUsd,
        });
        req.log.info(
          {
            inputTokens,
            outputTokens,
            rawCostUsd: costs.rawCostUsd,
            markedUpCostUsd: costs.markedUpCostUsd,
          },
          "Token usage recorded",
        );
      }
    } catch (usageError) {
      req.log.warn({ err: usageError }, "Failed to record token usage (non-fatal)");
    }
  } catch (error) {
    if (res.destroyed || upstreamController.signal.aborted) return;
    if (error instanceof GenerationTimeoutError) {
      req.log.warn("AI generation timed out");
      const payload = { error: "Generation took too long. Please try again." };
      sendGenerationEvent(res, "error", payload);
      res.end();
      return;
    }
    if (error instanceof GenerationUpstreamError) {
      req.log.error({ status: error.status }, "AI upstream error");
      const payload = {
        error: "The AI service could not complete the request. Please try again.",
      };
      sendGenerationEvent(res, "error", payload);
      res.end();
      return;
    }
    req.log.error(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "AI generation failed",
    );
    const payload = { error: "Unable to reach the AI service. Please try again." };
    sendGenerationEvent(res, "error", payload);
    res.end();
  } finally {
    clearInterval(heartbeat);
    res.off("close", handleResponseClose);
  }
});

// Kept for logout compatibility. Results are returned directly and never stored.
router.delete("/generate/session", requireAuth, (_req, res): void => {
  res.status(204).end();
});

export default router;
