import { Router, type IRouter } from "express";
import {
  GenerateWithAnthropicBody,
  GenerateWithAnthropicResponse,
} from "@workspace/api-zod";

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
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: parsed.data.maxTokens,
        system: parsed.data.systemPrompt,
        messages: [{ role: "user", content: parsed.data.userContent }],
      }),
    });

    const upstreamData: unknown = await upstreamResponse.json();
    if (!upstreamResponse.ok) {
      const message =
        typeof upstreamData === "object" &&
        upstreamData !== null &&
        "error" in upstreamData &&
        typeof upstreamData.error === "object" &&
        upstreamData.error !== null &&
        "message" in upstreamData.error &&
        typeof upstreamData.error.message === "string"
          ? upstreamData.error.message
          : "The AI service rejected the request";
      req.log.error(
        { status: upstreamResponse.status, message },
        "AI generation upstream request failed",
      );
      res.status(502).json({ error: message });
      return;
    }

    const responseData = GenerateWithAnthropicResponse.safeParse(upstreamData);
    if (!responseData.success) {
      req.log.error("AI service returned an unexpected response");
      res.status(502).json({ error: "The AI service returned an unexpected response" });
      return;
    }

    res.json(responseData.data);
  } catch (error) {
    req.log.error({ err: error }, "AI generation request failed");
    res.status(502).json({ error: "Unable to reach the AI service" });
  }
});

export default router;