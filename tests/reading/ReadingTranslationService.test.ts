import { describe, expect, it, vi } from "vitest";
import { ReadingTranslationService } from "../../src/reading/ReadingTranslationService";
import type { ReadingTranslationConfig, ReadingTranslationJob } from "../../src/reading/types";
import { deferred, flushPromises } from "../helpers/reading";

const config: ReadingTranslationConfig = { engine: "google", sourceLang: "en", targetLang: "vi", endpointUrl: "https://example.test", apiKey: "", model: "gemini-flash-latest" };
const job = (text: string): ReadingTranslationJob => ({ blockId: text, text, cacheSeed: text, protectedTokens: [] });
const meta = (text: string) => ({ translation: text, detectedLang: "en" });

describe("reading translation service", () => {
  it("limits_google_to_two_requests_across_sessions", async () => {
    const gates: ReturnType<typeof deferred<ReturnType<typeof meta>>>[] = [];
    let active = 0, maxActive = 0;
    const google = { translateWithMeta: vi.fn(async () => {
      active++; maxActive = Math.max(maxActive, active);
      const gate = deferred<ReturnType<typeof meta>>(); gates.push(gate);
      const result = await gate.promise; active--; return result;
    }) };
    const service = new ReadingTranslationService({ google });
    const a = service.createSession(config), b = service.createSession(config);
    const pending = ["a", "b", "c", "d", "e", "f"].map((text, i) => (i % 2 ? a : b).enqueue(job(text)));
    await flushPromises();
    expect(gates).toHaveLength(2);
    for (let i = 0; i < 6; i++) { gates[i].resolve(meta("dịch " + i)); await flushPromises(); }
    expect((await Promise.all(pending)).every(r => r.status === "success")).toBe(true);
    expect(maxActive).toBe(2);
    expect(google.translateWithMeta).toHaveBeenCalledWith("a", "en", "vi", "https://example.test");
    service.dispose();
  });

  it("limits_gemini_to_one_batch_of_eight", async () => {
    const sizes: number[] = [], gates: ReturnType<typeof deferred<Map<number, string>>>[] = [];
    const gemini = { translateBatch: vi.fn(async (items: { id: number; text: string }[]) => {
      sizes.push(items.length); const gate = deferred<Map<number, string>>(); gates.push(gate);
      return gate.promise;
    }) };
    const service = new ReadingTranslationService({ gemini });
    const session = service.createSession({ ...config, engine: "gemini", apiKey: "offline-key" });
    const pending = Array.from({ length: 17 }, (_, i) => session.enqueue(job("block " + i)));
    await flushPromises(); expect(sizes).toEqual([8]);
    for (let i = 0; i < 3; i++) {
      const start = i * 8, count = Math.min(8, 17 - start);
      gates[i].resolve(new Map(Array.from({ length: count }, (_, id) => [id, "dịch " + (start + id)])));
      await flushPromises();
    }
    expect(sizes).toEqual([8, 8, 1]);
    expect((await Promise.all(pending))[16]).toEqual({ status: "success", text: "dịch 16" });
    service.dispose();
  });

  it("does_not_cache_or_publish_the_last_response_after_cancel", async () => {
    const gate = deferred<ReturnType<typeof meta>>();
    const google = { translateWithMeta: vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(meta("fresh")) };
    const service = new ReadingTranslationService({ google });
    const session = service.createSession(config);
    const pending = session.enqueue(job("same"));
    await flushPromises(); session.cancel();
    expect(await pending).toEqual({ status: "cancelled" });
    gate.resolve(meta("stale")); await flushPromises();
    expect(await service.createSession(config).enqueue(job("same"))).toEqual({ status: "success", text: "fresh" });
    expect(google.translateWithMeta).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it("retains_transport_slots_until_cancelled_http_settles", async () => {
    const gate = deferred<ReturnType<typeof meta>>();
    const google = { translateWithMeta: vi.fn(() => gate.promise) };
    const service = new ReadingTranslationService({ google });
    const a = service.createSession(config);
    const old = [a.enqueue(job("a")), a.enqueue(job("b"))];
    await flushPromises(); a.cancel();
    const current = service.createSession(config).enqueue(job("c"));
    await flushPromises(); expect(google.translateWithMeta).toHaveBeenCalledTimes(2);
    gate.resolve(meta("ok")); await Promise.all([...old, current]);
    expect(google.translateWithMeta).toHaveBeenCalledTimes(3);
    service.dispose();
  });

  it("separates_source_target_engine_context_and_protected_content", async () => {
    const google = { translateWithMeta: vi.fn(async () => meta("Google result")) };
    const gemini = { translateBatch: vi.fn(async () => new Map([[0, "Gemini result"]])) };
    const service = new ReadingTranslationService({ google, gemini });
    await service.createSession(config).enqueue(job("pain"));
    await service.createSession(config).enqueue(job("pain"));
    expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
    await service.createSession({ ...config, sourceLang: "fr" }).enqueue(job("pain"));
    await service.createSession({ ...config, targetLang: "ja" }).enqueue(job("pain"));
    await service.createSession({ ...config, endpointUrl: "https://other.test" }).enqueue(job("pain"));
    await service.createSession(config).enqueue({ ...job("pain"), cacheSeed: "different inline" });
    expect(google.translateWithMeta).toHaveBeenCalledTimes(5);
    const ai = service.createSession({ ...config, engine: "gemini", apiKey: "offline-key" });
    await ai.enqueue({ ...job("pain"), context: { noteTitle: "Medicine" } });
    await ai.enqueue({ ...job("pain"), context: { noteTitle: "Cooking" } });
    expect(gemini.translateBatch).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it("evicts_after_200_successes_and_clear_cache_refetches", async () => {
    const google = { translateWithMeta: vi.fn(async () => meta("ok")) };
    const service = new ReadingTranslationService({ google });
    const session = service.createSession(config);
    for (let i = 0; i <= 200; i++) await session.enqueue(job("word " + i));
    await session.enqueue(job("word 200"));
    expect(google.translateWithMeta).toHaveBeenCalledTimes(201);
    await session.enqueue(job("word 0"));
    expect(google.translateWithMeta).toHaveBeenCalledTimes(202);
    service.clearCache(); await session.enqueue(job("word 0"));
    expect(google.translateWithMeta).toHaveBeenCalledTimes(203);
    service.dispose();
  });

  it("reports_errors_without_caching_or_replacing_them_with_original_text", async () => {
    const google = { translateWithMeta: vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(meta("bad tokens")).mockResolvedValueOnce(meta("real translation")) };
    const service = new ReadingTranslationService({ google });
    const session = service.createSession(config);
    expect(await session.enqueue(job("original"))).toEqual({ status: "error", code: "empty" });
    expect(await session.enqueue(job("original"))).toEqual({ status: "error", code: "provider" });
    expect(await session.enqueue({ ...job("Use ⟦PG0_0⟧"), protectedTokens: ["⟦PG0_0⟧"] })).toEqual({ status: "error", code: "invalid-tokens" });
    expect(await session.enqueue(job("original"))).toEqual({ status: "success", text: "real translation" });
    service.dispose();
  });

  it("fails_only_missing_batch_items_and_does_not_fallback_without_a_key", async () => {
    const gemini = { translateBatch: vi.fn(async () => new Map([[0, "translated"]])) };
    const google = { translateWithMeta: vi.fn() };
    const service = new ReadingTranslationService({ gemini, google });
    expect(await service.createSession({ ...config, engine: "gemini" }).enqueue(job("a"))).toEqual({ status: "error", code: "missing-key" });
    expect(gemini.translateBatch).not.toHaveBeenCalled(); expect(google.translateWithMeta).not.toHaveBeenCalled();
    const session = service.createSession({ ...config, engine: "gemini", apiKey: "offline-key" });
    expect(await Promise.all([session.enqueue(job("a")), session.enqueue(job("b"))])).toEqual([{ status: "success", text: "translated" }, { status: "error", code: "empty" }]);
    service.dispose();
  });

  it("normalizes_collapsed_multiple_choice_lines", async () => {
    const service = new ReadingTranslationService({ google: { translateWithMeta: async () => meta("A. Một B. Hai C. Ba") } });
    expect(await service.createSession(config).enqueue(job("A. One\nB. Two\nC. Three"))).toEqual({ status: "success", text: "A. Một\nB. Hai\nC. Ba" });
    service.dispose();
  });

  it("dispose_settles_queued_and_future_jobs_without_starting_requests", async () => {
    const google = { translateWithMeta: vi.fn() };
    const service = new ReadingTranslationService({ google });
    const session = service.createSession(config);
    const pending = session.enqueue(job("a"));
    service.dispose();
    expect(await pending).toEqual({ status: "cancelled" });
    expect(await session.enqueue(job("b"))).toEqual({ status: "cancelled" });
    expect(google.translateWithMeta).not.toHaveBeenCalled();
  });
});
