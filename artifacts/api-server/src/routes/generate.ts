import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { GenerateWithAnthropicBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { accountUsers, tokenUsage } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./accounts";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { getEcfrSource, isProviderContentAvailable } from "@workspace/cms-compliance-data";
import { createEcfrService } from "../services/ecfr";
import { ecfrDatabaseAdapter } from "../services/ecfr-database-adapter";

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

// ─── In-memory job store ─────────────────────────────────────────────────────

type DataSource =
  | { kind: "ecfr"; fetchDate: string }
  | { kind: "ai" };

type Job =
  | { status: "pending"; ownerId: string }
  | { status: "done"; ownerId: string; content: unknown; dataSource: DataSource }
  | { status: "error"; ownerId: string; error: string };

const jobs = new Map<string, Job>();

// POST /api/generate — paid access only; requireAuth also identifies usage owner.
router.post("/generate", requireAuth, requireActiveSubscription, async (req, res): Promise<void> => {
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not configured");
    res.status(500).json({ error: "AI generation is not configured" });
    return;
  }

  // Capture auth context before the response is sent (closure used in background job)
  const clerkUserId = (req as any).clerkUserId as string;

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", ownerId: clerkUserId });
  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);

  res.json({ jobId });

  const model = "claude-sonnet-4-6";

  void (async () => {
    try {
      // ── 1. Optionally pre-fetch live eCFR text ───────────────────────────
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
          req.log.warn({ institution: parsed.data.institutionValue }, "eCFR fetch failed; falling back to AI knowledge");
        }
      }

      // ── 2. Call Anthropic ────────────────────────────────────────────────
      const upstreamResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: Math.max(parsed.data.maxTokens, 1500),
          system: systemPrompt,
          messages: [{ role: "user", content: parsed.data.userContent }],
        }),
      });

      const data = await upstreamResponse.json() as {
        content?: unknown;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      };

      if (!upstreamResponse.ok) {
        req.log.error({ status: upstreamResponse.status }, "AI upstream error");
        jobs.set(jobId, { status: "error", ownerId: clerkUserId, error: "The AI service rejected the request" });
      } else {
        jobs.set(jobId, { status: "done", ownerId: clerkUserId, content: data.content, dataSource });

        // ── 3. Record token usage (best-effort — never fails the job) ────
        try {
          const inputTokens  = data.usage?.input_tokens  ?? 0;
          const outputTokens = data.usage?.output_tokens ?? 0;

          if (inputTokens > 0 || outputTokens > 0) {
            const costs = calcCost(model, inputTokens, outputTokens);

            // Look up the account for this user
            const [au] = await db
              .select({ accountId: accountUsers.accountId })
              .from(accountUsers)
              .where(eq(accountUsers.clerkUserId, clerkUserId))
              .limit(1);

            await db.insert(tokenUsage).values({
              accountId:      au?.accountId ?? null,
              clerkUserId,
              model,
              inputTokens,
              outputTokens,
              inputCostUsd:   costs.inputCostUsd,
              outputCostUsd:  costs.outputCostUsd,
              rawCostUsd:     costs.rawCostUsd,
              markedUpCostUsd: costs.markedUpCostUsd,
            });

            req.log.info(
              { inputTokens, outputTokens, rawCostUsd: costs.rawCostUsd, markedUpCostUsd: costs.markedUpCostUsd },
              "Token usage recorded"
            );
          }
        } catch (usageErr) {
          // Non-fatal — never block the job result
          req.log.warn({ err: usageErr }, "Failed to record token usage (non-fatal)");
        }
      }
    } catch (err) {
      req.log.error({ errorType: err instanceof Error ? err.name : "unknown" }, "AI generation background job failed");
      jobs.set(jobId, { status: "error", ownerId: clerkUserId, error: "Unable to reach the AI service" });
    }
  })();
});

// GET /api/generate/result?jobId=...
router.get("/generate/result", requireAuth, requireActiveSubscription, (req, res): void => {
  const { jobId } = req.query;
  if (!jobId || typeof jobId !== "string") {
    res.status(400).json({ error: "Missing jobId" });
    return;
  }
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  const clerkUserId = (req as any).clerkUserId as string;
  if (job.ownerId !== clerkUserId) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  res.json(job);
  if (job.status !== "pending") jobs.delete(jobId);
});

// Purge all transient AI results owned by the authenticated session before logout.
router.delete("/generate/session", requireAuth, (req, res): void => {
  const clerkUserId = (req as any).clerkUserId as string;
  for (const [jobId, job] of jobs.entries()) {
    if (job.ownerId === clerkUserId) jobs.delete(jobId);
  }
  res.status(204).end();
});

export default router;
