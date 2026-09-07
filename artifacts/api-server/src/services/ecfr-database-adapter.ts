import { db, ecfrCacheEntries } from "@workspace/db";
import { eq, lte } from "drizzle-orm";
import type { DurableCacheAdapter } from "../lib/durable-cache";
import type { EcfrResult } from "./ecfr";

export const ecfrDatabaseAdapter: DurableCacheAdapter<EcfrResult> = {
  async load(institutionValue) {
    const [entry] = await db
      .select()
      .from(ecfrCacheEntries)
      .where(eq(ecfrCacheEntries.institutionValue, institutionValue))
      .limit(1);
    if (!entry) return undefined;
    return {
      value: {
        text: entry.text,
        fetchDate: entry.fetchDate,
        source: entry.source === "ecfr" ? "ecfr" : "ai",
      },
      expiresAt: entry.expiresAt.getTime(),
    };
  },
  async save(institutionValue, entry) {
    await db
      .insert(ecfrCacheEntries)
      .values({
        institutionValue,
        text: entry.value.text,
        fetchDate: entry.value.fetchDate,
        source: entry.value.source,
        expiresAt: new Date(entry.expiresAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ecfrCacheEntries.institutionValue,
        set: {
          text: entry.value.text,
          fetchDate: entry.value.fetchDate,
          source: entry.value.source,
          expiresAt: new Date(entry.expiresAt),
          updatedAt: new Date(),
        },
      });
    await db.delete(ecfrCacheEntries).where(lte(ecfrCacheEntries.expiresAt, new Date()));
  },
  async remove(institutionValue) {
    await db.delete(ecfrCacheEntries).where(eq(ecfrCacheEntries.institutionValue, institutionValue));
  },
};