import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { GenerateWithAnthropicBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { accountUsers, tokenUsage } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./accounts";

const router: IRouter = Router();

// ─── Claude model pricing (USD per 1M tokens) ────────────────────────────────

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6": { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-sonnet-4-5": { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-5":   { inputPer1M: 15.00, outputPer1M: 75.00 },
};
const MARKUP = 1.5; // 50% markup applied on top of raw API cost

function calcCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]!;
  const inputCostUsd  = (inputTokens  / 1_000_000) * pricing.inputPer1M;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const rawCostUsd    = inputCostUsd + outputCostUsd;
  const markedUpCostUsd = rawCostUsd * MARKUP;
  return { inputCostUsd, outputCostUsd, rawCostUsd, markedUpCostUsd };
}

// ─── eCFR institution → CFR part mapping ────────────────────────────────────

const CFR_PARTS: Record<string, { title: number; part: number; label: string }> = {
  hospital: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation: Hospitals" },
  cah:      { title: 42, part: 485, label: "42 CFR 485 – Conditions of Participation: CAH" },
  snf:      { title: 42, part: 483, label: "42 CFR 483 – Conditions of Participation: SNF" },
  hha:      { title: 42, part: 484, label: "42 CFR 484 – Conditions of Participation: HHA" },
  hospice:  { title: 42, part: 418, label: "42 CFR 418 – Conditions of Participation: Hospice" },
  asc:      { title: 42, part: 416, label: "42 CFR 416 – Conditions for Coverage: ASC" },
  esrd:     { title: 42, part: 494, label: "42 CFR 494 – Conditions for Coverage: ESRD" },
  rhc:      { title: 42, part: 491, label: "42 CFR 491 – Conditions of Participation: RHC/FQHC" },
};

// ─── eCFR XML text extraction ────────────────────────────────────────────────

const MAX_XML_BYTES   = 500_000;
const MAX_ECFR_CHARS  = 20_000;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x2014;/g, "—")
    .replace(/&#xA7;/g, "§")
    .replace(/&#x201C;/g, "\u201C")
    .replace(/&#x201D;/g, "\u201D")
    .replace(/&#xA0;/g, " ")
    .replace(/&#x[0-9a-fA-F]+;/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ");
}

function stripXml(xml: string): string {
  return xml
    .replace(/<HEAD[^>]*>([\s\S]*?)<\/HEAD>/gi, "\n$1\n")
    .replace(/<\/P>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractSectionsFromXml(xml: string, charLimit = MAX_ECFR_CHARS): string {
  const sectionRe = /<DIV8[^>]*>([\s\S]*?)<\/DIV8>/gi;
  const sections: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = sectionRe.exec(xml)) !== null) {
    const text = decodeXmlEntities(stripXml(m[1])).trim();
    if (text) sections.push(text);
  }

  if (sections.length === 0) {
    return decodeXmlEntities(stripXml(xml)).slice(0, charLimit);
  }

  const joined = sections.join("\n\n---\n\n");
  if (joined.length <= charLimit) return joined;

  const perSection = Math.floor(charLimit / sections.length);
  return sections
    .map((s) => s.slice(0, perSection))
    .join("\n\n---\n\n")
    .slice(0, charLimit);
}

// ─── eCFR response cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: EcfrResult;
  expiresAt: number;
}

const ecfrCache = new Map<string, CacheEntry>();

function getCachedEcfr(institutionValue: string): EcfrResult | undefined {
  const entry = ecfrCache.get(institutionValue);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    ecfrCache.delete(institutionValue);
    return undefined;
  }
  return entry.result;
}

function setCachedEcfr(institutionValue: string, result: EcfrResult): void {
  ecfrCache.set(institutionValue, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  for (const [k, entry] of ecfrCache) {
    if (Date.now() > entry.expiresAt) ecfrCache.delete(k);
  }
}

// ─── Live eCFR fetch ─────────────────────────────────────────────────────────

interface EcfrResult {
  text: string;
  fetchDate: string;
  source: "ecfr" | "ai";
}

async function fetchEcfrText(institutionValue: string): Promise<EcfrResult> {
  const mapping = CFR_PARTS[institutionValue];
  if (!mapping) return { text: "", fetchDate: "", source: "ai" };

  const today = new Date();

  const cached = getCachedEcfr(institutionValue);
  if (cached) {
    console.info(`[eCFR cache] HIT  institution=${institutionValue} fetchDate=${cached.fetchDate}`);
    return cached;
  }
  console.info(`[eCFR cache] MISS institution=${institutionValue} — fetching live`);

  const datesToTry: string[] = [];
  for (let d = 0; d <= 365; d += (d < 30 ? 1 : 30)) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    datesToTry.push(dt.toISOString().slice(0, 10));
  }

  for (const dateStr of datesToTry) {
    const url =
      `https://ecfr.gov/api/versioner/v1/full/${dateStr}/title-${mapping.title}.xml` +
      `?part=${mapping.part}`;

    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: "application/xml, text/xml" },
      });

      if (resp.status === 404) continue;
      if (!resp.ok) break;

      const reader = resp.body?.getReader();
      if (!reader) break;

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const decoder = new TextDecoder();

      while (totalBytes < MAX_XML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.byteLength;
        if (totalBytes >= MAX_XML_BYTES) {
          reader.cancel().catch(() => { /* ignore */ });
          break;
        }
      }

      let raw = "";
      for (const chunk of chunks) raw += decoder.decode(chunk, { stream: true });
      raw += decoder.decode();
      if (!raw.trim()) continue;

      const text = extractSectionsFromXml(raw, MAX_ECFR_CHARS);
      if (!text) continue;

      const result: EcfrResult = { text, fetchDate: dateStr, source: "ecfr" };
      setCachedEcfr(institutionValue, result);
      console.info(`[eCFR cache] STORED institution=${institutionValue} fetchDate=${dateStr} ttl=24h`);
      return result;
    } catch {
      break;
    }
  }

  return { text: "", fetchDate: "", source: "ai" };
}

// ─── In-memory job store ─────────────────────────────────────────────────────

type DataSource =
  | { kind: "ecfr"; fetchDate: string }
  | { kind: "ai" };

type Job =
  | { status: "pending" }
  | { status: "done"; content: unknown; dataSource: DataSource }
  | { status: "error"; error: string };

const jobs = new Map<string, Job>();

// POST /api/generate — requireAuth so we can record token usage per account.
router.post("/generate", requireAuth, async (req, res): Promise<void> => {
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

  // Capture auth context before the response is sent (closure used in background job)
  const clerkUserId = (req as any).clerkUserId as string;

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending" });

  res.json({ jobId });

  const model = "claude-sonnet-4-6";

  void (async () => {
    try {
      // ── 1. Optionally pre-fetch live eCFR text ───────────────────────────
      let systemPrompt = parsed.data.systemPrompt;
      let dataSource: DataSource = { kind: "ai" };

      if (parsed.data.institutionValue) {
        req.log.info({ institution: parsed.data.institutionValue }, "Fetching live eCFR data");
        const ecfr = await fetchEcfrText(parsed.data.institutionValue);

        if (ecfr.source === "ecfr" && ecfr.text) {
          dataSource = { kind: "ecfr", fetchDate: ecfr.fetchDate };
          systemPrompt =
            `AUTHORITATIVE CMS REGULATORY TEXT (live from eCFR.gov, retrieved ${ecfr.fetchDate}):\n` +
            `The following is the actual current text of ${CFR_PARTS[parsed.data.institutionValue]?.label ?? "the applicable CFR part"}.\n` +
            `Use this as ground truth for all CMS citations. Do not contradict it.\n\n` +
            `---BEGIN eCFR TEXT---\n${ecfr.text}\n---END eCFR TEXT---\n\n` +
            systemPrompt;
          req.log.info({ chars: ecfr.text.length, date: ecfr.fetchDate }, "eCFR text injected");
        } else {
          req.log.warn({ institution: parsed.data.institutionValue }, "eCFR fetch failed; falling back to AI knowledge");
        }
      }

      // ── 2. Call Anthropic ────────────────────────────────────────────────
      const upstreamResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: Math.max(parsed.data.maxTokens, 1500),
          system: systemPrompt,
          messages: [{ role: "user", content: parsed.data.userContent }],
        }),
      });

      const data = await upstreamResponse.json() as {
        content?: unknown;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      };

      if (!upstreamResponse.ok) {
        const message = data?.error?.message ?? "The AI service rejected the request";
        req.log.error({ status: upstreamResponse.status, message }, "AI upstream error");
        jobs.set(jobId, { status: "error", error: message });
      } else {
        jobs.set(jobId, { status: "done", content: data.content, dataSource });

        // ── 3. Record token usage (best-effort — never fails the job) ────
        try {
          const inputTokens  = data.usage?.input_tokens  ?? 0;
          const outputTokens = data.usage?.output_tokens ?? 0;

          if (inputTokens > 0 || outputTokens > 0) {
            const costs = calcCost(model, inputTokens, outputTokens);

            // Look up the account for this user
            const [au] = await db
              .select({ accountId: accountUsers.accountId })
              .from(accountUsers)
              .where(eq(accountUsers.clerkUserId, clerkUserId))
              .limit(1);

            await db.insert(tokenUsage).values({
              accountId:      au?.accountId ?? null,
              clerkUserId,
              model,
              inputTokens,
              outputTokens,
              inputCostUsd:   costs.inputCostUsd,
              outputCostUsd:  costs.outputCostUsd,
              rawCostUsd:     costs.rawCostUsd,
              markedUpCostUsd: costs.markedUpCostUsd,
            });

            req.log.info(
              { inputTokens, outputTokens, rawCostUsd: costs.rawCostUsd, markedUpCostUsd: costs.markedUpCostUsd },
              "Token usage recorded"
            );
          }
        } catch (usageErr) {
          // Non-fatal — never block the job result
          req.log.warn({ err: usageErr }, "Failed to record token usage (non-fatal)");
        }
      }
    } catch (err) {
      req.log.error({ err }, "AI generation background job failed");
      jobs.set(jobId, { status: "error", error: "Unable to reach the AI service" });
    }

    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  })();
});

// GET /api/generate/result?jobId=...
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
