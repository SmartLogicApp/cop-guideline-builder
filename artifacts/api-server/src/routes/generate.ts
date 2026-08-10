import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { GenerateWithAnthropicBody } from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory job store. Each entry lives for 10 minutes.
type Job =
  | { status: "pending" }
  | { status: "done"; content: unknown }
  | { status: "error"; error: string };

const jobs = new Map<string, Job>();

// POST /api/generate — returns jobId immediately; Anthropic call runs in background.
router.post("/generate", async (req, res): Promise<void> => {
  const parsed = GenerateWithAnthropicBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid generation request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not configured");
    res.status(500).json({ error: "AI generation is not configured" });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending" });

  // Respond immediately — connection closes in < 100 ms.
  res.json({ jobId });

  // Background: call Anthropic after the HTTP response is already sent.
  void (async () => {
    try {
      const upstreamResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,           // never returned to the browser
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: parsed.data.maxTokens,
          system: parsed.data.systemPrompt,
          messages: [{ role: "user", content: parsed.data.userContent }],
        }),
      });

      const data = await upstreamResponse.json() as { content?: unknown; error?: { message?: string } };

      if (!upstreamResponse.ok) {
        const message = data?.error?.message ?? "The AI service rejected the request";
        req.log.error({ status: upstreamResponse.status, message }, "AI upstream error");
        jobs.set(jobId, { status: "error", error: message });
      } else {
        jobs.set(jobId, { status: "done", content: data.content });
      }
    } catch (err) {
      req.log.error({ err }, "AI generation background job failed");
      jobs.set(jobId, { status: "error", error: "Unable to reach the AI service" });
    }

    // Auto-cleanup after 10 minutes.
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  })();
});

// GET /api/generate/result?jobId=... — fast poll; never holds the connection open.
router.get("/generate/result", (req, res): void => {
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
  res.json(job);
});

export default router;
