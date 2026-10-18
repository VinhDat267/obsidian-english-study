/**
 * Pure TypeScript LRU (Least Recently Used) Cache implementation.
 * Operates in RAM with a configurable capacity (default: 200).
 * Provides fast O(1) lookups and updates via Javascript Map.
 */
export class LRUCache<T> {
  private capacity: number;
  private cache: Map<string, T>;

  constructor(capacity: number = 200) {
    this.capacity = capacity > 0 ? capacity : 200;
    this.cache = new Map<string, T>();
  }

  /**
   * Retrieves a value from the cache and marks it as most recently used.
   */
  get(key: string): T | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key)!;
    // Re-insert to push key to the end of insertion order (most recent)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Sets or updates a value in the cache.
   * If adding exceeds capacity, evicts the least recently used entry.
   */
  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // First key in Map iterator is the oldest / least recently used
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Checks whether a key exists in cache without modifying its recency.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clears all items in the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns current count of cached items.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Returns keys ordered from newest (most recently used) to oldest.
   */
  keys(): string[] {
    return Array.from(this.cache.keys()).reverse();
  }

  /**
   * Returns values ordered from newest (most recently used) to oldest.
   */
  values(): T[] {
    return Array.from(this.cache.values()).reverse();
  }
}
