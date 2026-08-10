const express = require("express");
const { Readable } = require("stream");
const app = express();
app.use(express.json());

app.post("/api/generate", async (req, res) => {
  // Secret is read server-side only and never returned to the browser.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "AI generation is not configured" } });
    return;
  }

  const { systemPrompt, userContent, maxTokens } = req.body ?? {};

  if (
    typeof systemPrompt !== "string" || systemPrompt.length < 1 || systemPrompt.length > 30000 ||
    typeof userContent  !== "string" || userContent.length  < 1 || userContent.length  > 30000 ||
    !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192
  ) {
    res.status(400).json({ error: { message: "Invalid generation request" } });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,            // stays on the server, never sent to browser
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        stream: true,                    // stream so the connection stays alive
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!upstream.ok) {
      const data = await upstream.json();
      const message = data?.error?.message || "The AI service rejected the request";
      res.status(502).json({ error: { message } });
      return;
    }

    // Pipe Anthropic's SSE stream straight to the browser.
    // The API key is in the request headers only — it never appears in the body.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: { message: "Unable to reach the AI service" } });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
