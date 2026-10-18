import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { GoogleTranslate } from "../../src/services/provider/GoogleTranslate";

describe("GoogleTranslate", () => {
  let translator: GoogleTranslate;

  beforeEach(() => {
    vi.clearAllMocks();
    translator = new GoogleTranslate();
  });

  describe("translate - primary endpoint", () => {
    it("should translate text to Vietnamese using primary Google Translate endpoint", async () => {
      // Mock Google Translate multi-chunk response
      const mockGoogleData = [
        [
          ["Xin chào thế giới. ", "Hello world. ", null, null, 1],
          ["Bạn khỏe không?", "How are you?", null, null, 1],
        ],
        null,
        "en",
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockGoogleData,
        text: JSON.stringify(mockGoogleData),
      });

      const result = await translator.translate("Hello world. How are you?");

      expect(requestUrl).toHaveBeenCalledTimes(1);
      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("translate.googleapis.com"),
          throw: false,
        })
      );
      expect(result).toBe("Xin chào thế giới. Bạn khỏe không?");
    });

    it("should support custom target language", async () => {
      const mockFrenchData = [
        [["Bonjour le monde", "Hello world", null, null, 1]],
        null,
        "en",
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockFrenchData,
        text: JSON.stringify(mockFrenchData),
      });

      const result = await translator.translate("Hello world", "fr");

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("tl=fr"),
        })
      );
      expect(result).toBe("Bonjour le monde");
    });

    it("should support custom endpoint URL", async () => {
      const mockData = [
        [["Xin chào", "Hello", null, null, 1]],
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockData,
        text: JSON.stringify(mockData),
      });

      const result = await translator.translate("Hello", "vi", "https://custom-gtx-proxy.example.com");

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("https://custom-gtx-proxy.example.com"),
        })
      );
      expect(result).toBe("Xin chào");
    });
  });

  describe("translate - fallback mirror (Rate limit 429 & errors)", () => {
    it("should fallback to Lingva mirror when primary endpoint returns 429", async () => {
      // 1st call returns 429 Rate Limit
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 429,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Too Many Requests",
      });

      // 2nd call to lingva.ml mirror returns 200
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { translation: "Xin chào từ mirror", info: {} },
        text: JSON.stringify({ translation: "Xin chào từ mirror" }),
      });

      const result = await translator.translate("Hello from mirror");

      expect(requestUrl).toHaveBeenCalledTimes(2);
      expect(requestUrl).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: expect.stringContaining("translate.googleapis.com"),
        })
      );
      expect(requestUrl).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          url: expect.stringContaining("lingva.ml/api/v1/auto/vi"),
        })
      );
      expect(result).toBe("Xin chào từ mirror");
    });

    it("should fallback to Lingva mirror when primary endpoint fails with status 500", async () => {
      // 1st call returns 500 Server Error
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 500,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Internal Server Error",
      });

      // 2nd call to mirror returns 200
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { translation: "Bản dịch dự phòng" },
        text: JSON.stringify({ translation: "Bản dịch dự phòng" }),
      });

      const result = await translator.translate("Server error test");
      expect(result).toBe("Bản dịch dự phòng");
    });
  });

  describe("translate - failures and edge cases", () => {
    it("should return null if both primary and fallback mirror fail", async () => {
      // 1st call returns 429
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 429,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Too Many Requests",
      });

      // 2nd call mirror also returns 500
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 500,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Mirror Down",
      });

      const result = await translator.translate("Both failed");
      expect(result).toBeNull();
    });

    it("should return null gracefully on complete network failure", async () => {
      vi.mocked(requestUrl).mockRejectedValue(new Error("Network is completely down"));

      const result = await translator.translate("Network failure");
      expect(result).toBeNull();
    });

    it("should return null when input text is empty or whitespace", async () => {
      const res1 = await translator.translate("");
      const res2 = await translator.translate("   ");

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(requestUrl).not.toHaveBeenCalled();
    });
  });

  describe("translateWithMeta - Multilingual & Transliteration (dt=rm)", () => {
    it("should extract translation, detectedLang, and Romaji transliteration for Japanese", async () => {
      const mockGoogleData = [
        [
          ["xin chào", "こんにちは", null, null, 1],
          [null, null, "Konnichiwa", "Konnichiwa"],
        ],
        null,
        "ja",
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockGoogleData,
        text: JSON.stringify(mockGoogleData),
      });

      const result = await (translator as any).translateWithMeta("こんにちは", "auto", "vi");

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("dt=rm"),
        })
      );
      expect(result).not.toBeNull();
      expect(result.translation).toBe("xin chào");
      expect(result.detectedLang).toBe("ja");
      expect(result.transliteration).toBe("Konnichiwa");
    });

    it("should extract translation, detectedLang, and Pinyin transliteration for Chinese", async () => {
      const mockGoogleData = [
        [
          ["xin chào", "你好", null, null, 1],
          [null, null, "Nǐ hǎo", "Nǐ hǎo"],
        ],
        null,
        "zh-CN",
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockGoogleData,
        text: JSON.stringify(mockGoogleData),
      });

      const result = await (translator as any).translateWithMeta("你好", "auto", "vi");

      expect(result).not.toBeNull();
      expect(result.translation).toBe("xin chào");
      expect(result.detectedLang).toBe("zh-CN");
      expect(result.transliteration).toBe("Nǐ hǎo");
    });

    it("should extract meta from Lingva mirror fallback when primary endpoint fails", async () => {
      // 1st call primary fails
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 500,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "Error",
      });

      // 2nd call mirror Lingva returns pronunciation
      const mockLingvaData = {
        translation: "xin chào",
        info: {
          detectedSource: "ja",
          pronunciation: {
            query: "Konnichiwa",
          },
        },
      };

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockLingvaData,
        text: JSON.stringify(mockLingvaData),
      });

      const result = await (translator as any).translateWithMeta("こんにちは", "auto", "vi");

      expect(result).not.toBeNull();
      expect(result.translation).toBe("xin chào");
      expect(result.detectedLang).toBe("ja");
      expect(result.transliteration).toBe("Konnichiwa");
    });
  });
});
