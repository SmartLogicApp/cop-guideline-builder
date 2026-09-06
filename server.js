const express = require("express");
const { randomUUID } = require("crypto");
const app = express();

app.use(express.json({ type: ["application/json", "text/plain"] }));

// ─── eCFR institution → CFR part mapping ─────────────────────────────────────

const CFR_PARTS = {
  hospital: { title: 42, part: 482, label: "42 CFR 482 – Conditions of Participation: Hospitals" },
  cah:      { title: 42, part: 485, label: "42 CFR 485 – Conditions of Participation: CAH" },
  snf:      { title: 42, part: 483, label: "42 CFR 483 – Conditions of Participation: SNF" },
  hha:      { title: 42, part: 484, label: "42 CFR 484 – Conditions of Participation: HHA" },
  hospice:  { title: 42, part: 418, label: "42 CFR 418 – Conditions of Participation: Hospice" },
  asc:      { title: 42, part: 416, label: "42 CFR 416 – Conditions for Coverage: ASC" },
  esrd:     { title: 42, part: 494, label: "42 CFR 494 – Conditions for Coverage: ESRD" },
  rhc:      { title: 42, part: 491, label: "42 CFR 491 – Conditions of Participation: RHC/FQHC" },
};

const MAX_XML_BYTES  = 500_000;
const MAX_ECFR_CHARS = 20_000;
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000;

/** Decode common XML/HTML entities. */
function decodeXmlEntities(s) {
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

/** Strip XML tags, preserving HEAD content as section labels. */
function stripXml(xml) {
  return xml
    .replace(/<HEAD[^>]*>([\s\S]*?)<\/HEAD>/gi, "\n$1\n")
    .replace(/<\/P>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Extract plain text from CFR XML; distributes evenly across all sections. */
function extractSectionsFromXml(xml, charLimit = MAX_ECFR_CHARS) {
  const sectionRe = /<DIV8[^>]*>([\s\S]*?)<\/DIV8>/gi;
  const sections = [];
  let m;
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
  return sections.map((s) => s.slice(0, perSection)).join("\n\n---\n\n").slice(0, charLimit);
}

// ─── eCFR in-memory cache ─────────────────────────────────────────────────────

const ecfrCache = new Map();

function getCachedEcfr(institutionValue) {
  const entry = ecfrCache.get(institutionValue);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    ecfrCache.delete(institutionValue);
    return undefined;
  }
  return entry.result;
}

function setCachedEcfr(institutionValue, result) {
  ecfrCache.set(institutionValue, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  for (const [k, entry] of ecfrCache) {
    if (Date.now() > entry.expiresAt) ecfrCache.delete(k);
  }
}

// ─── Live eCFR fetch ──────────────────────────────────────────────────────────

async function fetchEcfrText(institutionValue) {
  const mapping = CFR_PARTS[institutionValue];
  if (!mapping) return { text: "", fetchDate: "", source: "ai" };

  const cached = getCachedEcfr(institutionValue);
  if (cached) {
    console.info(`[eCFR cache] HIT  institution=${institutionValue} fetchDate=${cached.fetchDate}`);
    return cached;
  }
  console.info(`[eCFR cache] MISS institution=${institutionValue} — fetching live`);

  const today = new Date();
  const datesToTry = [];
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

      const chunks = [];
      let totalBytes = 0;
      const decoder = new TextDecoder();
      while (totalBytes < MAX_XML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.byteLength;
        if (totalBytes >= MAX_XML_BYTES) {
          reader.cancel().catch(() => {});
          break;
        }
      }
      let raw = "";
      for (const chunk of chunks) raw += decoder.decode(chunk, { stream: true });
      raw += decoder.decode();
      if (!raw.trim()) continue;

      const text = extractSectionsFromXml(raw, MAX_ECFR_CHARS);
      if (!text) continue;

      const result = { text, fetchDate: dateStr, source: "ecfr" };
      setCachedEcfr(institutionValue, result);
      console.info(`[eCFR cache] STORED institution=${institutionValue} fetchDate=${dateStr} ttl=24h`);
      return result;
    } catch {
      break;
    }
  }

  return { text: "", fetchDate: "", source: "ai" };
}

// ─── In-memory job store ──────────────────────────────────────────────────────

const jobs = new Map();

// ─── Shared generation handler ────────────────────────────────────────────────

async function runGenerationJob(jobId, { systemPrompt, userContent, maxTokens, institutionValue, apiKey }) {
  try {
    // 1. Optionally pre-fetch live eCFR text
    let finalSystemPrompt = systemPrompt;
    let dataSource = { kind: "ai" };

    if (institutionValue && CFR_PARTS[institutionValue]) {
      console.info(`[eCFR] Fetching live data for institution=${institutionValue}`);
      const ecfr = await fetchEcfrText(institutionValue);
      if (ecfr.source === "ecfr" && ecfr.text) {
        dataSource = { kind: "ecfr", fetchDate: ecfr.fetchDate };
        finalSystemPrompt =
          `AUTHORITATIVE CMS REGULATORY TEXT (live from eCFR.gov, retrieved ${ecfr.fetchDate}):\n` +
          `The following is the actual current text of ${CFR_PARTS[institutionValue].label}.\n` +
          `Use this as ground truth for all CMS citations. Do not contradict it.\n\n` +
          `---BEGIN eCFR TEXT---\n${ecfr.text}\n---END eCFR TEXT---\n\n` +
          systemPrompt;
        console.info(`[eCFR] Injected ${ecfr.text.length} chars, date=${ecfr.fetchDate}`);
      } else {
        console.warn(`[eCFR] Fetch failed for institution=${institutionValue}; falling back to AI knowledge`);
      }
    }

    // 2. Call Anthropic
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: finalSystemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      jobs.set(jobId, {
        status: "error",
        error: data?.error?.message || "The AI service rejected the request",
      });
    } else {
      jobs.set(jobId, { status: "done", content: data.content, dataSource });
    }
  } catch {
    jobs.set(jobId, { status: "error", error: "Unable to reach the AI service" });
  }

  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
}

// ─── POST /api/generate ───────────────────────────────────────────────────────

app.post("/api/generate", (_req, res) => {
  res.status(410).json({
    error: { message: "This legacy generation endpoint is disabled. Use the authenticated CMS Compliance Suite application." },
  });
});

// ─── GET /api/generate/result ─────────────────────────────────────────────────

app.get("/api/generate/result", (_req, res) => {
  res.status(410).json({ error: { message: "This legacy generation endpoint is disabled." } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
