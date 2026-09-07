import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { DurableCacheEntry } from "../lib/durable-cache.ts";
import {
  CACHE_TTL_MS,
  createEcfrService,
  type EcfrResult,
} from "./ecfr.ts";

const providerValues = ["hospital", "snf", "hha"] as const;
const originalFetch = globalThis.fetch;
let now: number;
let rows: Map<string, DurableCacheEntry<EcfrResult>>;
let service: ReturnType<typeof createEcfrService>;

beforeEach(() => {
  now = 1_000;
  rows = new Map();
  service = createEcfrService({
    async load(key) {
      return rows.get(key);
    },
    async save(key, entry) {
      rows.set(key, entry);
    },
    async remove(key) {
      rows.delete(key);
    },
  }, () => now);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("eCFR cache", () => {
  test("returns undefined on a cache miss for each required provider", async () => {
    for (const provider of providerValues) {
      assert.equal(await service.getCachedEcfr(provider), undefined);
    }
  });

  test("uses the institution value as the cache key", async () => {
    for (const provider of providerValues) {
      await service.setCachedEcfr(provider, {
        text: `${provider} regulatory text`,
        fetchDate: "2026-09-07",
        source: "ecfr",
      });
    }

    for (const provider of providerValues) {
      assert.equal(
        (await service.getCachedEcfr(provider))?.text,
        `${provider} regulatory text`,
      );
    }
  });

  test("evicts an entry when its TTL expires", async () => {
    await service.setCachedEcfr("hospital", {
      text: "Hospital regulatory text",
      fetchDate: "2026-09-07",
      source: "ecfr",
    });

    now += CACHE_TTL_MS;
    assert.equal(await service.getCachedEcfr("hospital"), undefined);
    assert.equal(rows.has("hospital"), false);
  });
});

describe("fetchEcfrText", () => {
  for (const provider of providerValues) {
    test(`${provider} fetches once and serves the second call from cache`, async () => {
      const requestedUrls: string[] = [];
      globalThis.fetch = async (input) => {
        requestedUrls.push(String(input));
        return new Response(
          `<ROOT><DIV8><HEAD>Provider requirements</HEAD><P>${provider} &amp; safety text</P></DIV8></ROOT>`,
          { status: 200, headers: { "content-type": "application/xml" } },
        );
      };

      const first = await service.fetchEcfrText(provider);
      const second = await service.fetchEcfrText(provider);

      assert.equal(first.source, "ecfr");
      assert.match(first.text, new RegExp(`${provider} & safety text`));
      assert.deepEqual(second, first);
      assert.equal(requestedUrls.length, 1);
      assert.match(requestedUrls[0], /^https:\/\/ecfr\.gov\/api\/versioner\/v1\/full\//);
    });
  }
});