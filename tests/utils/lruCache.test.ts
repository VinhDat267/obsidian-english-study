import { describe, it, expect, beforeEach } from "vitest";
import { LRUCache } from "../../src/utils/lruCache";

describe("LRUCache", () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  describe("Basic Operations", () => {
    it("should set and get values correctly", () => {
      cache.set("a", "apple");
      cache.set("b", "banana");

      expect(cache.get("a")).toBe("apple");
      expect(cache.get("b")).toBe("banana");
      expect(cache.size).toBe(2);
    });

    it("should return undefined for non-existent keys", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should check existence with has()", () => {
      cache.set("a", "apple");

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
    });

    it("should clear all items with clear()", () => {
      cache.set("a", "apple");
      cache.set("b", "banana");
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.has("a")).toBe(false);
      expect(cache.keys()).toEqual([]);
      expect(cache.values()).toEqual([]);
    });

    it("should default to capacity 200 when no capacity is specified", () => {
      const defaultCache = new LRUCache<number>();
      for (let i = 0; i < 205; i++) {
        defaultCache.set(`key-${i}`, i);
      }
      expect(defaultCache.size).toBe(200);
      // First 5 items (0..4) should have been evicted
      expect(defaultCache.get("key-0")).toBeUndefined();
      expect(defaultCache.get("key-4")).toBeUndefined();
      expect(defaultCache.get("key-5")).toBe(5);
      expect(defaultCache.get("key-204")).toBe(204);
    });
  });

  describe("LRU Eviction Policy", () => {
    it("should evict least recently used item when capacity is exceeded", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.set("c", "gamma");

      // Cache is full: [a, b, c]
      // Adding 'd' should evict 'a' (oldest)
      cache.set("d", "delta");

      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe("beta");
      expect(cache.get("c")).toBe("gamma");
      expect(cache.get("d")).toBe("delta");
    });

    it("should update recency on get() and not evict recently accessed items", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.set("c", "gamma");

      // Access 'a' so order becomes: b, c, a (a is newest)
      expect(cache.get("a")).toBe("alpha");

      // Adding 'd' should evict 'b' (now the oldest), not 'a'
      cache.set("d", "delta");

      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("a")).toBe("alpha");
      expect(cache.get("c")).toBe("gamma");
      expect(cache.get("d")).toBe("delta");
    });

    it("should update value and recency when setting an existing key", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.set("c", "gamma");

      // Update 'a' so order becomes: b, c, a
      cache.set("a", "alpha-updated");

      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBe("alpha-updated");

      // Adding 'd' should evict 'b'
      cache.set("d", "delta");

      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("a")).toBe("alpha-updated");
      expect(cache.get("c")).toBe("gamma");
      expect(cache.get("d")).toBe("delta");
    });

    it("should handle capacity of 1 correctly", () => {
      const singleCache = new LRUCache<string>(1);
      singleCache.set("k1", "v1");
      expect(singleCache.get("k1")).toBe("v1");

      singleCache.set("k2", "v2");
      expect(singleCache.get("k1")).toBeUndefined();
      expect(singleCache.get("k2")).toBe("v2");
      expect(singleCache.size).toBe(1);
    });
  });

  describe("keys() and values() Ordering", () => {
    it("should return keys from newest to oldest", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");

      expect(cache.keys()).toEqual(["c", "b", "a"]);

      // Access 'b' -> newest becomes 'b'
      cache.get("b");
      expect(cache.keys()).toEqual(["b", "c", "a"]);
    });

    it("should return values from newest to oldest", () => {
      cache.set("a", "apple");
      cache.set("b", "banana");
      cache.set("c", "cherry");

      expect(cache.values()).toEqual(["cherry", "banana", "apple"]);

      // Access 'a' -> newest becomes 'a'
      cache.get("a");
      expect(cache.values()).toEqual(["apple", "cherry", "banana"]);
    });
  });
});
