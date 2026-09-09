import test from "node:test";
import assert from "node:assert/strict";
import {
  generateComplianceContent,
  GenerationTimeoutError,
  GenerationUpstreamError,
} from "./generation.ts";

const input = {
  apiKey: "test-key",
  systemPrompt: "System prompt",
  userContent: "User content",
  maxTokens: 1200,
};

test("returns validated Anthropic content and usage", async () => {
  const result = await generateComplianceContent(input, {
    fetchImpl: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "Generated compliance content" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }), { status: 200 }),
  });

  assert.equal(result.content[0]?.text, "Generated compliance content");
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 50 });
});

test("rejects upstream HTTP errors without exposing provider details", async () => {
  await assert.rejects(
    generateComplianceContent(input, {
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: "sensitive provider detail" } }),
        { status: 429 },
      ),
    }),
    (error) => error instanceof GenerationUpstreamError && error.status === 429,
  );
});

test("rejects successful responses with no usable text", async () => {
  await assert.rejects(
    generateComplianceContent(input, {
      fetchImpl: async () => new Response(JSON.stringify({ content: [] }), { status: 200 }),
    }),
    GenerationUpstreamError,
  );
});

test("applies a bounded upstream timeout", async () => {
  await assert.rejects(
    generateComplianceContent(input, {
      timeoutMs: 5,
      fetchImpl: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Timed out", "TimeoutError"));
          });
        }),
    }),
    GenerationTimeoutError,
  );
});

test("honors browser cancellation separately from the upstream timeout", async () => {
  const controller = new AbortController();
  const pending = generateComplianceContent(input, {
    signal: controller.signal,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Cancelled", "AbortError"));
        });
      }),
  });

  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
});