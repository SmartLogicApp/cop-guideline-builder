import { Readable } from "stream";
import { Router, type IRouter } from "express";
import { GenerateWithAnthropicBody } from "@workspace/api-zod";

const router: IRouter = Router();

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
    res.status(502).json({ error: "AI generation is not configured" });
    return;
  }

  try {
    const upstreamResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,            // secret stays server-side only
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: parsed.data.maxTokens,
        stream: true,                    // stream to avoid proxy timeout
        system: parsed.data.systemPrompt,
        messages: [{ role: "user", content: parsed.data.userContent }],
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamData = await upstreamResponse.json() as { error?: { message?: string } };
      const message = upstreamData?.error?.message ?? "The AI service rejected the request";
      req.log.error({ status: upstreamResponse.status, message }, "AI generation upstream error");
      res.status(502).json({ error: message });
      return;
    }

    // Pipe Anthropic's SSE stream straight to the browser.
    // The API key is only in the outbound request headers — never in the response body.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const nodeStream = Readable.fromWeb(
      upstreamResponse.body as import("stream/web").ReadableStream<Uint8Array>,
    );
    nodeStream.pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "AI generation request failed");
    if (!res.headersSent) {
      res.status(502).json({ error: "Unable to reach the AI service" });
    }
  }
});

export default router;
