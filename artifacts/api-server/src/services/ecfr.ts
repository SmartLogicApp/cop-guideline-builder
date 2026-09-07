import { getEcfrSource } from "@workspace/cms-compliance-data";
import { DurableCache, type DurableCacheAdapter } from "../lib/durable-cache.ts";

const MAX_XML_BYTES = 500_000;
const MAX_ECFR_CHARS = 20_000;

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface EcfrResult {
  text: string;
  fetchDate: string;
  source: "ecfr" | "ai";
}

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
  let match: RegExpExecArray | null;

  while ((match = sectionRe.exec(xml)) !== null) {
    const text = decodeXmlEntities(stripXml(match[1])).trim();
    if (text) sections.push(text);
  }

  if (sections.length === 0) {
    return decodeXmlEntities(stripXml(xml)).slice(0, charLimit);
  }

  const joined = sections.join("\n\n---\n\n");
  if (joined.length <= charLimit) return joined;

  const perSection = Math.floor(charLimit / sections.length);
  return sections
    .map((section) => section.slice(0, perSection))
    .join("\n\n---\n\n")
    .slice(0, charLimit);
}

export function createEcfrService(
  adapter: DurableCacheAdapter<EcfrResult>,
  now: () => number = Date.now,
) {
  const cache = new DurableCache(adapter, CACHE_TTL_MS, now);

  async function getCachedEcfr(institutionValue: string): Promise<EcfrResult | undefined> {
    try {
      return await cache.get(institutionValue);
    } catch (error) {
      console.warn("[eCFR cache] Persistent cache read failed; fetching live", error);
      return undefined;
    }
  }

  async function setCachedEcfr(institutionValue: string, result: EcfrResult): Promise<void> {
    try {
      await cache.set(institutionValue, result);
    } catch (error) {
      console.warn("[eCFR cache] Persistent cache write failed; keeping in-memory entry", error);
    }
  }

  async function fetchEcfrText(institutionValue: string): Promise<EcfrResult> {
  const mapping = getEcfrSource(institutionValue);
  if (!mapping) return { text: "", fetchDate: "", source: "ai" };

  const today = new Date();
  const cached = await getCachedEcfr(institutionValue);
  if (cached) {
    console.info(`[eCFR cache] HIT  institution=${institutionValue} fetchDate=${cached.fetchDate}`);
    return cached;
  }
  console.info(`[eCFR cache] MISS institution=${institutionValue} — fetching live`);

  const datesToTry: string[] = [];
  for (let daysAgo = 0; daysAgo <= 365; daysAgo += daysAgo < 30 ? 1 : 30) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    datesToTry.push(date.toISOString().slice(0, 10));
  }

  for (const dateStr of datesToTry) {
    const url =
      `https://ecfr.gov/api/versioner/v1/full/${dateStr}/title-${mapping.title}.xml` +
      `?part=${mapping.part}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: "application/xml, text/xml" },
      });

      if (response.status === 404) continue;
      if (!response.ok) break;

      const reader = response.body?.getReader();
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
          reader.cancel().catch(() => {});
          break;
        }
      }

      let raw = "";
      for (const chunk of chunks) raw += decoder.decode(chunk, { stream: true });
      raw += decoder.decode();
      if (!raw.trim()) continue;

      const text = extractSectionsFromXml(raw);
      if (!text) continue;

      const result: EcfrResult = { text, fetchDate: dateStr, source: "ecfr" };
      await setCachedEcfr(institutionValue, result);
      console.info(`[eCFR cache] STORED institution=${institutionValue} fetchDate=${dateStr} ttl=24h`);
      return result;
    } catch {
      break;
    }
  }

  return { text: "", fetchDate: "", source: "ai" };
  }

  return { getCachedEcfr, setCachedEcfr, fetchEcfrText };
}
