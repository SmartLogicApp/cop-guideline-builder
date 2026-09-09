import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGapAnalysisResult,
  parseGuidelinesResult,
  parseInspectionResult,
  parsePolicyTemplateResult,
  requestGeneration,
} from "./generation-client.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("returns generated text from the direct JSON API contract", async () => {
  const result = await requestGeneration(
    { systemPrompt: "system", userContent: "user", maxTokens: 100 },
    {
      fetchImpl: async (url) => {
        assert.equal(url, "/api/generate");
        return jsonResponse({
          content: [{ type: "text", text: "Generated result" }],
          dataSource: { kind: "ecfr", fetchDate: "2026-09-04" },
        });
      },
    },
  );

  assert.deepEqual(result, {
    text: "Generated result",
    dataSource: { kind: "ecfr", fetchDate: "2026-09-04" },
  });
});

test("returns the final result from the JSON event stream contract", async () => {
  const stream = [
    'event: progress\ndata: {"message":"Fetching live regulatory data"}\n\n',
    ": keepalive\n\n",
    'event: result\ndata: {"content":[{"type":"text","text":"Streamed result"}],"dataSource":{"kind":"ai"}}\n\n',
  ].join("");

  const result = await requestGeneration(
    { systemPrompt: "system", userContent: "user", maxTokens: 100 },
    {
      fetchImpl: async () => new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    },
  );

  assert.equal(result.text, "Streamed result");
});

test("surfaces JSON error events from an established stream", async () => {
  await assert.rejects(
    requestGeneration(
      { systemPrompt: "system", userContent: "user", maxTokens: 100 },
      {
        fetchImpl: async () => new Response(
          'event: error\ndata: {"error":"Generation timed out. Please try again."}\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      },
    ),
    /Generation timed out/,
  );
});

test("supports the legacy job protocol during rolling updates", async () => {
  const responses = [
    jsonResponse({ jobId: "job-1" }),
    jsonResponse({ status: "pending" }),
    jsonResponse({
      status: "done",
      content: [{ type: "text", text: "Finished result" }],
      dataSource: { kind: "ai" },
    }),
  ];

  const result = await requestGeneration(
    { systemPrompt: "system", userContent: "user", maxTokens: 100 },
    { fetchImpl: async () => responses.shift(), pollIntervalMs: 1 },
  );

  assert.equal(result.text, "Finished result");
});

test("surfaces failed polling responses instead of silently continuing", async () => {
  const responses = [
    jsonResponse({ jobId: "expired-job" }),
    jsonResponse({ error: "Generation job expired. Please try again." }, 404),
  ];

  await assert.rejects(
    requestGeneration(
      { systemPrompt: "system", userContent: "user", maxTokens: 100 },
      { fetchImpl: async () => responses.shift(), pollIntervalMs: 1 },
    ),
    /Generation job expired/,
  );
});

test("surfaces useful API errors", async () => {
  await assert.rejects(
    requestGeneration(
      { systemPrompt: "system", userContent: "user", maxTokens: 100 },
      {
        fetchImpl: async () =>
          jsonResponse({ error: "AI generation is temporarily unavailable" }, 502),
      },
    ),
    /temporarily unavailable/,
  );
});

test("rejects malformed success responses", async () => {
  await assert.rejects(
    requestGeneration(
      { systemPrompt: "system", userContent: "user", maxTokens: 100 },
      { fetchImpl: async () => jsonResponse({ content: [] }) },
    ),
    /no usable content/,
  );
});

test("validates all four feature response formats", () => {
  const guideline = parseGuidelinesResult(JSON.stringify({
    overview: "Guideline overview",
    sources: [{
      body: "CMS",
      standards: [{
        code: "42 CFR §482.42",
        title: "Infection prevention",
        requirement: "Maintain an active infection prevention program.",
      }],
    }],
  }));
  assert.equal(guideline.overview, "Guideline overview");

  assert.match(
    parsePolicyTemplateResult(
      "POLICY TITLE\n" + "This is a complete policy statement and procedure. ".repeat(4),
    ),
    /POLICY TITLE/,
  );

  const inspection = parseInspectionResult(JSON.stringify({
    items: Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1),
      area: "Documentation",
      question: `Readiness question ${index + 1}`,
      riskLevel: index < 4 ? "High" : index < 9 ? "Medium" : "Low",
      regulatoryBasis: "42 CFR §482.42",
      recommendation: "Verify the required evidence.",
    })),
  }));
  assert.equal(inspection.length, 12);

  const gaps = parseGapAnalysisResult(JSON.stringify({
    summary: "The policy needs several updates.",
    score: 72,
    met: [],
    weak: [],
    missing: [],
  }));
  assert.equal(gaps.score, 72);
});

test("rejects incomplete feature output before it reaches a renderer", () => {
  assert.throws(() => parseGuidelinesResult('{"overview":"Only an overview"}'), /incomplete/);
  assert.throws(() => parsePolicyTemplateResult("Too short"), /incomplete/);
  assert.throws(() => parseInspectionResult('{"items":[]}'), /incomplete/);
  assert.throws(
    () => parseGapAnalysisResult('{"summary":"Missing score","met":[],"weak":[],"missing":[]}'),
    /incomplete/,
  );
});