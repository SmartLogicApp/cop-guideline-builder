const DEFAULT_TIMEOUT_MS = 180_000;
const LEGACY_POLL_INTERVAL_MS = 2_000;

function generationErrorMessage(status, payload) {
  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (status === 401) return "Your session has expired. Please sign in and try again.";
  if (status === 402 || status === 403) {
    return "Your account does not currently have access to generation.";
  }
  if (status === 409) {
    return "Official CMS content for this provider type is still pending verification.";
  }
  if (status === 504) return "Generation took too long. Please try again.";
  return `Generation failed (server returned ${status}). Please try again.`;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error("The generation service returned an empty response. Please try again.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("The generation service returned an invalid response. Please try again.");
  }
}

async function readGenerationStream(response) {
  if (!response.body) {
    throw new Error("The generation service returned an empty response. Please try again.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      if (!rawEvent.trim() || rawEvent.trimStart().startsWith(":")) continue;
      let eventType = "message";
      const dataLines = [];
      for (const line of rawEvent.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;

      let payload;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        throw new Error("The generation service returned an invalid event. Please try again.");
      }

      if (eventType === "error") {
        throw new Error(generationErrorMessage(response.status, payload));
      }
      if (eventType === "result") {
        return normalizeGenerationResponse(payload);
      }
    }

    if (done) break;
  }

  throw new Error("The generation stream ended before a result was available. Please try again.");
}

function normalizeGenerationResponse(payload) {
  const text = payload?.content?.find?.(
    (block) => block?.type === "text" && typeof block.text === "string",
  )?.text;

  if (!text?.trim()) {
    throw new Error("The generation service returned no usable content. Please try again.");
  }

  const source = payload?.dataSource;
  const dataSource =
    source?.kind === "ecfr" && typeof source.fetchDate === "string"
      ? { kind: "ecfr", fetchDate: source.fetchDate }
      : { kind: "ai" };

  return { text: text.trim(), dataSource };
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The generation request was cancelled.", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("The generation request was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Calls the shared generation endpoint. JSON Server-Sent Events are the current
 * long-running contract; direct JSON and job polling remain temporarily
 * supported during rolling production updates.
 */
export async function requestGeneration(
  input,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = LEGACY_POLL_INTERVAL_MS,
  } = {},
) {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetchImpl("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(input),
      signal: combinedSignal,
    });
    const responseType = response.headers.get("content-type") ?? "";

    if (response.ok && responseType.includes("text/event-stream")) {
      return await readGenerationStream(response);
    }

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(generationErrorMessage(response.status, payload));
    }
    if (typeof payload?.error === "string") {
      throw new Error(generationErrorMessage(response.status, payload));
    }

    if (Array.isArray(payload?.content)) {
      return normalizeGenerationResponse(payload);
    }

    if (typeof payload?.jobId !== "string" || !payload.jobId) {
      throw new Error("The generation service returned an unexpected response. Please try again.");
    }

    while (!combinedSignal.aborted) {
      await abortableDelay(pollIntervalMs, combinedSignal);
      const pollResponse = await fetchImpl(
        `/api/generate/result?jobId=${encodeURIComponent(payload.jobId)}`,
        { signal: combinedSignal },
      );
      const job = await readJsonResponse(pollResponse);

      if (!pollResponse.ok) {
        throw new Error(generationErrorMessage(pollResponse.status, job));
      }
      if (job?.status === "error") {
        throw new Error(
          typeof job.error === "string" && job.error.trim()
            ? job.error.trim()
            : "Generation failed. Please try again.",
        );
      }
      if (job?.status === "done") {
        return normalizeGenerationResponse(job);
      }
      if (job?.status !== "pending") {
        throw new Error("The generation service returned an invalid job status. Please try again.");
      }
    }

    throw new DOMException("Generation timed out.", "AbortError");
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new Error("Generation took too long. Please try again.");
    }
    if (error?.name === "AbortError") {
      throw new Error("Generation was cancelled.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseGeneratedJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("The generated response was empty. Please try again.");
  }

  const source = raw.replace(/```json\s*|```/gi, "").trim();
  try {
    return JSON.parse(source);
  } catch {
    // Recover only a response that is complete except for trailing closers.
  }

  const stack = [];
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") stack.push("}");
    if (character === "[") stack.push("]");
    if (character === "}" || character === "]") stack.pop();
  }

  if (!inString) {
    try {
      return JSON.parse(source.replace(/,\s*$/, "") + stack.reverse().join(""));
    } catch {
      // Fall through to a useful visible error.
    }
  }
  throw new Error("The generated response was incomplete. Please try again.");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseGuidelinesResult(raw) {
  const result = parseGeneratedJson(raw);
  const validSources =
    Array.isArray(result?.sources) &&
    result.sources.length > 0 &&
    result.sources.every(
      (source) =>
        isNonEmptyString(source?.body) &&
        Array.isArray(source?.standards) &&
        source.standards.length > 0 &&
        source.standards.every(
          (standard) =>
            isNonEmptyString(standard?.code) &&
            isNonEmptyString(standard?.title) &&
            isNonEmptyString(standard?.requirement),
        ),
    );

  if (!isNonEmptyString(result?.overview) || !validSources) {
    throw new Error("The generated guideline was incomplete. Please try again.");
  }
  return result;
}

export function parsePolicyTemplateResult(raw) {
  const result = typeof raw === "string"
    ? raw.replace(/```[\w]*\s*|```/g, "").trim()
    : "";
  if (result.length < 100) {
    throw new Error("The generated policy template was incomplete. Please try again.");
  }
  return result;
}

export function parseInspectionResult(raw) {
  const result = parseGeneratedJson(raw);
  const items = Array.isArray(result?.items) ? result.items : result;
  const valid =
    Array.isArray(items) &&
    items.length === 12 &&
    items.every(
      (item) =>
        isNonEmptyString(item?.id) &&
        isNonEmptyString(item?.area) &&
        isNonEmptyString(item?.question) &&
        ["High", "Medium", "Low"].includes(item?.riskLevel) &&
        isNonEmptyString(item?.regulatoryBasis) &&
        isNonEmptyString(item?.recommendation),
    );
  if (!valid) {
    throw new Error("The generated inspection checklist was incomplete. Please try again.");
  }
  return items;
}

export function parseGapAnalysisResult(raw) {
  const result = parseGeneratedJson(raw);
  const validScore =
    Number.isInteger(result?.score) && result.score >= 0 && result.score <= 100;
  const validFindings = ["met", "weak", "missing"].every((key) =>
    Array.isArray(result?.[key]),
  );
  if (!isNonEmptyString(result?.summary) || !validScore || !validFindings) {
    throw new Error("The generated gap analysis was incomplete. Please try again.");
  }
  return result;
}