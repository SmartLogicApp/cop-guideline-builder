import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { GenerateWithAnthropicBody } from "@workspace/api-zod";

const router: IRouter = Router();

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

const MAX_XML_BYTES   = 500_000; // max raw XML to buffer (500 KB — enough for any single CFR part)
const MAX_ECFR_CHARS  = 20_000; // max plain-text chars injected into the prompt

/** Decode common XML/HTML entities. */
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

/** Strip XML tags from a string, preserving HEAD content as section labels. */
function stripXml(xml: string): string {
  return xml
    .replace(/<HEAD[^>]*>([\s\S]*?)<\/HEAD>/gi, "\n$1\n") // preserve headings
    .replace(/<\/P>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Extract plain text from a complete CFR XML string.
 * Parses every <DIV8> (section) element so content from the whole document
 * is represented — not just the truncated beginning.
 * Returns up to `charLimit` characters of plain text.
 */
function extractSectionsFromXml(xml: string, charLimit = MAX_ECFR_CHARS): string {
  // Capture each <DIV8 ...>...</DIV8> block (a CFR section)
  const sectionRe = /<DIV8[^>]*>([\s\S]*?)<\/DIV8>/gi;
  const sections: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = sectionRe.exec(xml)) !== null) {
    const text = decodeXmlEntities(stripXml(m[1])).trim();
    if (text) sections.push(text);
  }

  // If no DIV8 found, fall back to stripping the entire document
  if (sections.length === 0) {
    return decodeXmlEntities(stripXml(xml)).slice(0, charLimit);
  }

  // Join all sections; if the total exceeds the limit distribute evenly
  const joined = sections.join("\n\n---\n\n");
  if (joined.length <= charLimit) return joined;

  // Too long: keep proportional slices of each section so all sections appear
  const perSection = Math.floor(charLimit / sections.length);
  return sections
    .map((s) => s.slice(0, perSection))
    .join("\n\n---\n\n")
    .slice(0, charLimit);
}

// ─── eCFR response cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  result: EcfrResult;
  expiresAt: number;
}

const ecfrCache = new Map<string, CacheEntry>();

/** Return a cached eCFR result if one exists and is still fresh; otherwise undefined. */
function getCachedEcfr(institutionValue: string): EcfrResult | undefined {
  const entry = ecfrCache.get(institutionValue);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    ecfrCache.delete(institutionValue);
    return undefined;
  }
  return entry.result;
}

/** Store an eCFR result in the cache with a 24-hour TTL and evict expired entries. */
function setCachedEcfr(institutionValue: string, result: EcfrResult): void {
  ecfrCache.set(institutionValue, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  // Evict all expired entries to prevent unbounded growth
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

  // eCFR only publishes on amendment dates, so try recent dates going back
  // up to a year in coarse steps to find the latest published version.
  const today = new Date();

  // ── Cache lookup: keyed by institution only; TTL is the sole freshness guard ─
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
    // Use the XML endpoint — full/{date}/title-N.json returns 406 for large parts.
    const url =
      `https://ecfr.gov/api/versioner/v1/full/${dateStr}/title-${mapping.title}.xml` +
      `?part=${mapping.part}`;

    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: "application/xml, text/xml" },
      });

      if (resp.status === 404) continue; // no version on this date — try older
      if (!resp.ok) break;              // unexpected error — bail

      // Buffer the complete response up to MAX_XML_BYTES
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

      // Concatenate all chunks into one string
      let raw = "";
      for (const chunk of chunks) raw += decoder.decode(chunk, { stream: true });
      raw += decoder.decode(); // flush
      if (!raw.trim()) continue;

      const text = extractSectionsFromXml(raw, MAX_ECFR_CHARS);
      if (!text) continue;

      const result: EcfrResult = { text, fetchDate: dateStr, source: "ecfr" };
      // Cache keyed by institution; TTL controls freshness across day boundaries
      setCachedEcfr(institutionValue, result);
      console.info(`[eCFR cache] STORED institution=${institutionValue} fetchDate=${dateStr} ttl=24h`);
      return result;
    } catch {
      break; // network / timeout — give up
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

// POST /api/generate — returns jobId immediately; Anthropic call runs in background.
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
    res.status(500).json({ error: "AI generation is not configured" });
    return;
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending" });

  // Respond immediately — connection closes in < 100 ms.
  res.json({ jobId });

  // Background: fetch eCFR then call Anthropic after the HTTP response is sent.
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
          // Inject eCFR text into the system prompt as authoritative ground truth
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
          "x-api-key": apiKey,           // never returned to the browser
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: Math.max(parsed.data.maxTokens, 1500),
          system: systemPrompt,
          messages: [{ role: "user", content: parsed.data.userContent }],
        }),
      });

      const data = await upstreamResponse.json() as { content?: unknown; error?: { message?: string } };

      if (!upstreamResponse.ok) {
        const message = data?.error?.message ?? "The AI service rejected the request";
        req.log.error({ status: upstreamResponse.status, message }, "AI upstream error");
        jobs.set(jobId, { status: "error", error: message });
      } else {
        jobs.set(jobId, { status: "done", content: data.content, dataSource });
      }
    } catch (err) {
      req.log.error({ err }, "AI generation background job failed");
      jobs.set(jobId, { status: "error", error: "Unable to reach the AI service" });
    }

    // Auto-cleanup after 10 minutes.
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  })();
});

// GET /api/generate/result?jobId=... — fast poll; never holds the connection open.
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
