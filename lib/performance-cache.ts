// Performance cache with memory limits and automatic cleanup
// Uses a doubly-linked list for O(1) LRU eviction

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  accessCount: number;
  lastAccessed: number;
}

// Doubly-linked list node for O(1) LRU operations
interface LRUNode<T> {
  key: string;
  entry: CacheEntry<T>;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

class PerformanceCache<T> {
  private cache = new Map<string, LRUNode<T>>();
  private head: LRUNode<T> | null = null; // Most recently used
  private tail: LRUNode<T> | null = null; // Least recently used
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly name: string;
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static instances = new Set<PerformanceCache<any>>();

  constructor(name: string, maxSize: number = 1000, ttlMs: number = 2 * 60 * 1000) {
    this.name = name;
    this.maxSize = maxSize;
    this.ttl = ttlMs;

    PerformanceCache.instances.add(this);

    // Single shared cleanup timer for all cache instances
    if (!PerformanceCache.cleanupTimer) {
      const timer = setInterval(
        () => {
          for (const instance of PerformanceCache.instances) {
            instance.cleanup();
          }
        },
        5 * 60 * 1000,
      );
      // Avoid keeping the event loop alive in serverless/idle contexts
      if (typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
      PerformanceCache.cleanupTimer = timer;
    }
  }

  get(key: string): T | null {
    const node = this.cache.get(key);
    if (!node) return null;

    // Check if expired
    if (Date.now() - node.entry.cachedAt > this.ttl) {
      this.removeNode(node);
      this.cache.delete(key);
      return null;
    }

    // Update access stats and move to head (most recently used)
    node.entry.accessCount++;
    node.entry.lastAccessed = Date.now();
    this.moveToHead(node);

    return node.entry.data;
  }

  set(key: string, data: T): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing entry and move to head
      existingNode.entry.data = data;
      existingNode.entry.cachedAt = Date.now();
      existingNode.entry.accessCount++;
      existingNode.entry.lastAccessed = Date.now();
      this.moveToHead(existingNode);
      return;
    }

    // Enforce memory limits - evict LRU entry (tail) in O(1)
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Create new node
    const newNode: LRUNode<T> = {
      key,
      entry: {
        data,
        cachedAt: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now(),
      },
      prev: null,
      next: null,
    };

    // Add to cache and linked list
    this.cache.set(key, newNode);
    this.addToHead(newNode);
  }

  delete(key: string): void {
    const node = this.cache.get(key);
    if (node) {
      this.removeNode(node);
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  // O(1) eviction - remove tail node
  private evictLeastRecentlyUsed(): void {
    if (this.tail) {
      const keyToRemove = this.tail.key;
      this.removeNode(this.tail);
      this.cache.delete(keyToRemove);
    }
  }

  // Add node to head of linked list
  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  // Remove node from linked list
  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  // Move existing node to head (most recently used)
  private moveToHead(node: LRUNode<T>): void {
    if (node === this.head) return; // Already at head
    this.removeNode(node);
    this.addToHead(node);
  }

  private cleanup(): void {
    const now = Date.now();

    // Iterate through cache and remove expired entries
    for (const [key, node] of this.cache.entries()) {
      if (now - node.entry.cachedAt > this.ttl) {
        this.removeNode(node);
        this.cache.delete(key);
      }
    }
  }
}

// Create cache instances with appropriate limits
export const sessionCache = new PerformanceCache<any>('sessions', 500, 15 * 60 * 1000); // 15 min, 500 sessions
export const usageCountCache = new PerformanceCache<number>('usage-counts', 2000, 5 * 60 * 1000); // 5 min, 2000 users

// Cache key generators
export const createSessionKey = (token: string) => `session:${token}`;
export const createMessageCountKey = (userId: string) => `msg-count:${userId}`;

