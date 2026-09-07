import assert from "node:assert/strict";
import test from "node:test";
import {
  DurableCache,
  type DurableCacheAdapter,
  type DurableCacheEntry,
} from "./durable-cache.ts";

function memoryAdapter<T>(rows: Map<string, DurableCacheEntry<T>>): DurableCacheAdapter<T> {
  return {
    async load(key) {
      return rows.get(key);
    },
    async save(key, entry) {
      rows.set(key, entry);
    },
    async remove(key) {
      rows.delete(key);
    },
  };
}

test("an unexpired entry survives a fresh cache instance with its original expiry", async () => {
  const rows = new Map<string, DurableCacheEntry<string>>();
  let now = 1_000;
  const firstServer = new DurableCache(memoryAdapter(rows), 500, () => now);

  await firstServer.set("hospital", "regulatory text");
  assert.equal(rows.get("hospital")?.expiresAt, 1_500);

  now = 1_200;
  const restartedServer = new DurableCache(memoryAdapter(rows), 500, () => now);
  assert.equal(await restartedServer.get("hospital"), "regulatory text");
  assert.equal(rows.get("hospital")?.expiresAt, 1_500);
});

test("an expired entry is rejected and removed after restart", async () => {
  const rows = new Map<string, DurableCacheEntry<string>>([
    ["hospital", { value: "stale text", expiresAt: 1_500 }],
  ]);
  const restartedServer = new DurableCache(memoryAdapter(rows), 500, () => 1_501);

  assert.equal(await restartedServer.get("hospital"), undefined);
  assert.equal(rows.has("hospital"), false);
});