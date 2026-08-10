const express = require("express");
const { randomUUID } = require("crypto");
const app = express();
// Accept both application/json AND text/plain so the browser can POST without
// a Content-Type header, avoiding the CORS preflight that Cloudflare/Replit's
// outer proxy can intercept before it reaches our server.
app.use(express.json({ type: ["application/json", "text/plain"] }));

// In-memory job store. Each job lives for 10 minutes then is cleaned up.
const jobs = new Map();

// POST /api/generate — validates input, starts the Anthropic call in the
// background, and returns a jobId immediately (< 100 ms).
// The API key is never sent to the browser.
app.post("/api/generate", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res
      .status(500)
      .json({ error: { message: "AI generation is not configured" } });
    return;
  }

  const { systemPrompt, userContent, maxTokens } = req.body ?? {};

  if (
    typeof systemPrompt !== "string" ||
    systemPrompt.length < 1 ||
    systemPrompt.length > 30000 ||
    typeof userContent !== "string" ||
    userContent.length < 1 ||
    userContent.length > 30000 ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > 8192
  ) {
    res.status(400).json({ error: { message: "Invalid generation request" } });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending" });

  // Respond immediately so the HTTP connection closes right away.
  res.json({ jobId });

  // Run the Anthropic call after the response is sent.
  (async () => {
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey, // never returned to the browser
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      const data = await upstream.json();

      if (!upstream.ok) {
        jobs.set(jobId, {
          status: "error",
          error: data?.error?.message || "The AI service rejected the request",
        });
      } else {
        jobs.set(jobId, { status: "done", content: data.content });
      }
    } catch {
      jobs.set(jobId, {
        status: "error",
        error: "Unable to reach the AI service",
      });
    }

    // Auto-cleanup after 10 minutes.
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  })();
});

// GET /api/generate/result?jobId=... — fast poll; returns immediately.
app.get("/api/generate/result", (req, res) => {
  const { jobId } = req.query;
  if (!jobId || typeof jobId !== "string") {
    res.status(400).json({ error: { message: "Missing jobId" } });
    return;
  }
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: { message: "Job not found or expired" } });
    return;
  }
  res.json(job);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
