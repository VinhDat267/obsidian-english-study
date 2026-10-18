import { describe, it, expect, vi, beforeEach } from "vitest";
import { BilingualTranslationService } from "../../src/services/translation/BilingualTranslationService";
import { MarkdownBlock } from "../../src/types";

describe("BilingualTranslationService", () => {
  let service: BilingualTranslationService;
  let mockGoogleTranslate: any;
  let mockGeminiService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleTranslate = {
      translate: vi.fn(),
    };
    mockGeminiService = {
      translateBatch: vi.fn(),
    };
    service = new BilingualTranslationService(mockGoogleTranslate, mockGeminiService);
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
    expect(mockGoogleTranslate.translate).not.toHaveBeenCalled();
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

    mockGoogleTranslate.translate
      .mockResolvedValueOnce("Xin chào thế giới.")
      .mockResolvedValueOnce("A. Lựa chọn A");

    const progressUpdates: any[] = [];
    const result = await service.translateBlocks(blocks, {
      engine: "google",
      targetLang: "vi",
      delayMs: 0,
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(mockGoogleTranslate.translate).toHaveBeenCalledTimes(2);
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

    mockGoogleTranslate.translate.mockImplementation(async () => {
      controller.abort();
      return "Bản dịch 1";
    });

    await expect(
      service.translateBlocks(blocks, {
        engine: "google",
        delayMs: 0,
        signal: controller.signal,
      })
    ).rejects.toThrow("Translation aborted by user");

    expect(mockGoogleTranslate.translate).toHaveBeenCalledTimes(1);
  });

  it("should gracefully recover if a block translation fails, preserving original text", async () => {
    const blocks: MarkdownBlock[] = [
      { id: "1", type: "paragraph", rawText: "Good text", translatableText: "Good text", skipTranslation: false },
      { id: "2", type: "paragraph", rawText: "Failing text", translatableText: "Failing text", skipTranslation: false },
      { id: "3", type: "paragraph", rawText: "Another text", translatableText: "Another text", skipTranslation: false },
    ];

    mockGoogleTranslate.translate
      .mockResolvedValueOnce("Văn bản tốt")
      .mockResolvedValueOnce(null) // API failed
      .mockResolvedValueOnce("Văn bản khác");

    const result = await service.translateBlocks(blocks, {
      engine: "google",
      delayMs: 0,
    });

    expect(result[0].translatedText).toBe("Văn bản tốt");
    expect(result[1].translatedText).toBe("Failing text"); // Fallback to translatableText
    expect(result[2].translatedText).toBe("Văn bản khác");
  });
});
