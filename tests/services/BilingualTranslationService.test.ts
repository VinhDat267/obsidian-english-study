import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BilingualTranslationService } from "../../src/services/translation/BilingualTranslationService";
import { GoogleTranslate } from "../../src/services/provider/GoogleTranslate";
import { MarkdownBlock } from "../../src/types";

describe("BilingualTranslationService", () => {
  let service: BilingualTranslationService;
  let mockGoogleTranslate: any;
  let mockGeminiService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleTranslate = new GoogleTranslate();
    vi.spyOn(mockGoogleTranslate, "translateWithMeta");
    mockGeminiService = {
      translateBatch: vi.fn(),
    };
    service = new BilingualTranslationService(mockGoogleTranslate, mockGeminiService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should return blocks immediately if all blocks have skipTranslation: true", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "code_block", rawText: "console.log('hi')", skipTranslation: true },
      { id: "2", type: "blank_line", rawText: "", skipTranslation: true },
    ];

    const progressSpy = vi.fn();
    const result = await service.translateBlocks(blocks, {
      engine: "google",
      onProgress: progressSpy,
    });

    expect(result).toHaveLength(2);
    expect(mockGoogleTranslate.translateWithMeta).not.toHaveBeenCalled();
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ current: 2, total: 2, percent: 100 })
    );
  });

  it("should translate blocks using Google Translate engine and report progress", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "paragraph", rawText: "Hello world.", translatableText: "Hello world.", skipTranslation: false },
      { id: "2", type: "code_block", rawText: "```js\ncode\n```", skipTranslation: true },
      { id: "3", type: "multiple_choice", rawText: "A. Option A", translatableText: "A. Option A", skipTranslation: false },
    ];

    mockGoogleTranslate.translateWithMeta
      .mockResolvedValueOnce({ translation: "Xin chào thế giới.", detectedLang: "en" })
      .mockResolvedValueOnce({ translation: "A. Lựa chọn A", detectedLang: "en" });

    const progressUpdates: any[] = [];
    const result = await service.translateBlocks(blocks, {
      engine: "google",
      targetLang: "vi",
      delayMs: 0,
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(mockGoogleTranslate.translateWithMeta).toHaveBeenCalledTimes(2);
    expect(result[0].translatedText).toBe("Xin chào thế giới.");
    expect(result[1].translatedText).toBeUndefined();
    expect(result[2].translatedText).toBe("A. Lựa chọn A");

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates[progressUpdates.length - 1].percent).toBe(100);
  });

  it("should translate blocks using Gemini AI engine with batching", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "paragraph", rawText: "Block 1", translatableText: "Block 1", skipTranslation: false },
      { id: "2", type: "paragraph", rawText: "Block 2", translatableText: "Block 2", skipTranslation: false },
      { id: "3", type: "paragraph", rawText: "Block 3", translatableText: "Block 3", skipTranslation: false },
    ];

    const resultMap = new Map<number, string>();
    resultMap.set(0, "Khối 1");
    resultMap.set(1, "Khối 2");
    resultMap.set(2, "Khối 3");

    mockGeminiService.translateBatch.mockResolvedValueOnce(resultMap);

    const progressSpy = vi.fn();
    const result = await service.translateBlocks(blocks, {
      engine: "gemini",
      apiKey: "test-api-key",
      batchSize: 5,
      delayMs: 0,
      onProgress: progressSpy,
    });

    expect(mockGeminiService.translateBatch).toHaveBeenCalledTimes(1);
    expect(result[0].translatedText).toBe("Khối 1");
    expect(result[1].translatedText).toBe("Khối 2");
    expect(result[2].translatedText).toBe("Khối 3");
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 100, current: 3, total: 3 })
    );
  });

  it("should abort immediately when AbortSignal is triggered", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "paragraph", rawText: "Text 1", translatableText: "Text 1", skipTranslation: false },
      { id: "2", type: "paragraph", rawText: "Text 2", translatableText: "Text 2", skipTranslation: false },
      { id: "3", type: "paragraph", rawText: "Text 3", translatableText: "Text 3", skipTranslation: false },
    ];

    const controller = new AbortController();

    mockGoogleTranslate.translateWithMeta.mockImplementation(async () => {
      controller.abort();
      return { translation: "Bản dịch 1", detectedLang: "en" };
    });

    await expect(
      service.translateBlocks(blocks, {
        engine: "google",
        delayMs: 0,
        signal: controller.signal,
      })
    ).rejects.toThrow("Translation aborted by user");

    expect(mockGoogleTranslate.translateWithMeta).toHaveBeenCalledTimes(1);
  });

  it("rejects a partial Google export and preserves the original blocks", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "paragraph", rawText: "Good text", translatableText: "Good text", skipTranslation: false },
      { id: "2", type: "paragraph", rawText: "Failing text", translatableText: "Failing text", skipTranslation: false },
      { id: "3", type: "paragraph", rawText: "Another text", translatableText: "Another text", skipTranslation: false },
    ];

    mockGoogleTranslate.translateWithMeta
      .mockResolvedValueOnce({ translation: "Văn bản tốt", detectedLang: "en" })
      .mockResolvedValueOnce(null) // API failed
      .mockResolvedValueOnce({ translation: "Văn bản khác", detectedLang: "en" });

    await expect(service.translateBlocks(blocks, {
      engine: "google",
      delayMs: 0,
    })).rejects.toThrow(/Google.*block 2.*retry/i);

    expect(blocks.every((block) => block.translatedText === undefined)).toBe(true);
  });

  const paragraph = (): MarkdownBlock => ({
    id: "1", type: "paragraph", rawText: "Original source.",
    translatableText: "Original source.", skipTranslation: false,
  });

  it.each(["google", "gemini"] as const)("rejects cancellation during the final %s response", async (engine) => {
    const controller = new AbortController();
    mockGoogleTranslate.translateWithMeta.mockImplementation(async () => {
      controller.abort();
      return { translation: "Bản dịch", detectedLang: "en" };
    });
    mockGeminiService.translateBatch.mockImplementation(async () => {
      controller.abort();
      return new Map([[0, "Bản dịch"]]);
    });
    const progress = vi.fn();

    await expect(service.translateBlocks([paragraph()], {
      engine, apiKey: "offline-key", delayMs: 0, signal: controller.signal, onProgress: progress,
    })).rejects.toThrow(/aborted/i);
    expect(progress).not.toHaveBeenCalled();
  });

  it.each(["google", "gemini"] as const)("rejects cancellation during the final %s delay", async (engine) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mockGoogleTranslate.translateWithMeta.mockResolvedValue({ translation: "Bản dịch", detectedLang: "en" });
    mockGeminiService.translateBatch.mockResolvedValue(new Map([[0, "Bản dịch"]]));
    setTimeout(() => controller.abort(), 10);
    const result = service.translateBlocks([paragraph()], {
      engine, apiKey: "offline-key", delayMs: 100, signal: controller.signal,
    });
    await Promise.all([
      expect(result).rejects.toThrow(/aborted/i),
      vi.runAllTimersAsync(),
    ]);
  });

  it("rejects a pre-cancelled empty translation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(service.translateBlocks([], { engine: "google", signal: controller.signal })).rejects.toThrow(/aborted/i);
  });

  it.each([null, "", "   "])("rejects an empty Google result (%s)", async (translation) => {
    mockGoogleTranslate.translateWithMeta.mockResolvedValue(translation === null ? null : { translation, detectedLang: "en" });
    await expect(service.translateBlocks([paragraph()], { engine: "google", delayMs: 0 })).rejects.toThrow(/Google.*block 1.*retry/i);
  });

  it("rejects a thrown Google request", async () => {
    mockGoogleTranslate.translateWithMeta.mockRejectedValue(new Error("offline network failure"));
    await expect(service.translateBlocks([paragraph()], { engine: "google", delayMs: 0 })).rejects.toThrow(/Google.*block 1.*retry/i);
  });

  it.each([
    ["null response", null],
    ["missing block ID", new Map([[0, "First translated"]])],
    ["blank translation", new Map([[0, "First translated"], [1, "   "]])],
  ])("rejects Gemini %s instead of substituting source text", async (_reason, response) => {
    mockGeminiService.translateBatch.mockResolvedValue(response);
    const blocks = [paragraph(), { ...paragraph(), id: "2" }];
    await expect(service.translateBlocks(blocks, { engine: "gemini", apiKey: "offline-key", delayMs: 0 })).rejects.toThrow(/Gemini.*retry/i);
    expect(blocks.every((block) => block.translatedText === undefined)).toBe(true);
  });

  it("rejects a thrown Gemini request", async () => {
    mockGeminiService.translateBatch.mockRejectedValue(new Error("offline network failure"));
    await expect(service.translateBlocks([paragraph()], { engine: "gemini", apiKey: "offline-key", delayMs: 0 })).rejects.toThrow(/Gemini.*retry/i);
  });

  it("requires a Gemini API key before translating", async () => {
    await expect(service.translateBlocks([paragraph()], { engine: "gemini", delayMs: 0 })).rejects.toThrow(/Gemini.*API key/i);
    expect(mockGeminiService.translateBatch).not.toHaveBeenCalled();
  });

  it("uses the selected Google source and target languages", async () => {
    mockGoogleTranslate.translateWithMeta.mockResolvedValue({ translation: "Translation", detectedLang: "ja" });
    await service.translateBlocks([paragraph()], { engine: "google", sourceLang: "ja", targetLang: "en", customEndpointUrl: "https://offline.test", delayMs: 0 });
    expect(mockGoogleTranslate.translateWithMeta).toHaveBeenCalledWith("Original source.", "ja", "en", "https://offline.test");
  });

  it("uses the selected Gemini source and target languages", async () => {
    mockGeminiService.translateBatch.mockResolvedValue(new Map([[0, "Translation"]]));
    await service.translateBlocks([paragraph()], { engine: "gemini", sourceLang: "ja", targetLang: "en", apiKey: "offline-key", customModel: "custom-model", delayMs: 0 });
    expect(mockGeminiService.translateBatch).toHaveBeenCalledWith([{ id: 0, text: "Original source." }], "offline-key", undefined, "en", "custom-model", "ja");
  });
});
