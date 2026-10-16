type CacheEntry<T> = { value: T; expiresAt: number };

class LruTtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh LRU position
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.map.size > this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

// Caches must live on globalThis: in dev (and with route-level code splitting)
// a module can be instantiated once per route entry, so a plain module-level
// cache cleared from one route would not be the one another route reads.
export function globalCache<T>(key: string, maxSize: number): LruTtlCache<T> {
  const store = globalThis as unknown as Record<string, LruTtlCache<T> | undefined>;
  return (store[key] ??= new LruTtlCache<T>(maxSize));
}
