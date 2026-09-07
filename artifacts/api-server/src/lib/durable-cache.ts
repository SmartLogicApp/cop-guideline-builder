export interface DurableCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface DurableCacheAdapter<T> {
  load(key: string): Promise<DurableCacheEntry<T> | undefined>;
  save(key: string, entry: DurableCacheEntry<T>): Promise<void>;
  remove(key: string): Promise<void>;
}

export class DurableCache<T> {
  private readonly memory = new Map<string, DurableCacheEntry<T>>();
  private readonly adapter: DurableCacheAdapter<T>;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    adapter: DurableCacheAdapter<T>,
    ttlMs: number,
    now: () => number = Date.now,
  ) {
    this.adapter = adapter;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async get(key: string): Promise<T | undefined> {
    const memoryEntry = this.memory.get(key);
    if (memoryEntry) {
      if (memoryEntry.expiresAt > this.now()) return memoryEntry.value;
      this.memory.delete(key);
      await this.adapter.remove(key);
      return undefined;
    }

    const storedEntry = await this.adapter.load(key);
    if (!storedEntry) return undefined;
    if (storedEntry.expiresAt <= this.now()) {
      await this.adapter.remove(key);
      return undefined;
    }

    this.memory.set(key, storedEntry);
    return storedEntry.value;
  }

  async set(key: string, value: T): Promise<void> {
    const entry = { value, expiresAt: this.now() + this.ttlMs };
    this.memory.set(key, entry);
    await this.adapter.save(key, entry);
  }
}