const express = require("express");
const app = express();
app.use(express.json());

app.post("/api/generate", async (req, res) => {
  // Read the key on every request so a rotation takes effect without restart.
  // The key is ONLY used server-side and is never returned to the browser.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "AI generation is not configured" } });
    return;
  }

  const { systemPrompt, userContent, maxTokens } = req.body ?? {};

  // Validate inputs before forwarding to Anthropic.
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
        "x-api-key": apiKey,                  // secret stays on the server
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
      // Forward Anthropic's error message but nothing else (no key, no headers).
      const message = data?.error?.message || "The AI service rejected the request";
      res.status(502).json({ error: { message } });
      return;
    }

    // Return only the content array — the API key is never included.
    res.json({ content: data.content });
  } catch (err) {
    res.status(502).json({ error: { message: "Unable to reach the AI service" } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
