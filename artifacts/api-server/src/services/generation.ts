export const GENERATION_MODEL = "claude-sonnet-4-6";
export const GENERATION_TIMEOUT_MS = 170_000;

export interface GenerationServiceInput {
  apiKey: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
}

export interface GenerationContentBlock {
  type: string;
  text: string;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerationServiceResult {
  content: GenerationContentBlock[];
  usage: GenerationUsage;
}

export class GenerationUpstreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("The AI service rejected the generation request");
    this.name = "GenerationUpstreamError";
    this.status = status;
  }
}

export class GenerationTimeoutError extends Error {
  constructor() {
    super("The AI service took too long to respond");
    this.name = "GenerationTimeoutError";
  }
}

export async function generateComplianceContent(
  input: GenerationServiceInput,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<GenerationServiceResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal,
      body: JSON.stringify({
        model: GENERATION_MODEL,
        max_tokens: input.maxTokens,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.userContent }],
      }),
    });

    if (!response.ok) {
      throw new GenerationUpstreamError(response.status);
    }

    const payload = await response.json() as {
      content?: Array<{ type?: unknown; text?: unknown }>;
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    const content = payload.content?.filter(
      (block): block is GenerationContentBlock =>
        typeof block?.type === "string" &&
        typeof block?.text === "string" &&
        block.text.trim().length > 0,
    );

    if (!content?.length) {
      throw new GenerationUpstreamError(502);
    }

    return {
      content,
      usage: {
        inputTokens:
          typeof payload.usage?.input_tokens === "number"
            ? payload.usage.input_tokens
            : 0,
        outputTokens:
          typeof payload.usage?.output_tokens === "number"
            ? payload.usage.output_tokens
            : 0,
      },
    };
  } catch (error) {
    if (error instanceof GenerationUpstreamError) throw error;
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      if (options.signal?.aborted) throw error;
      throw new GenerationTimeoutError();
    }
    throw error;
  }
}