import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { ProviderManager } from "../../src/services/provider/ProviderManager";
import { FreeDictService } from "../../src/services/provider/FreeDictService";
import { GoogleTranslate, GoogleTranslationMeta } from "../../src/services/provider/GoogleTranslate";
import { GeminiService } from "../../src/services/provider/GeminiService";
import { LRUCache } from "../../src/utils/lruCache";
import { DEFAULT_SETTINGS, LookupResult, PluginSettings } from "../../src/types";

describe("ProviderManager", () => {
  let manager: ProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ProviderManager();
  });

  describe("classify", () => {
    it("should classify 1-word inputs as 'word'", () => {
      expect(manager.classify("apple")).toBe("word");
      expect(manager.classify("hypothesis")).toBe("word");
      expect(manager.classify("  serendipity   ")).toBe("word");
    });

    it("should classify inputs <= 4 words without sentence punctuation as 'phrase'", () => {
      expect(manager.classify("give up")).toBe("phrase");
      expect(manager.classify("take care of")).toBe("phrase");
      expect(manager.classify("out of the blue")).toBe("phrase");
    });

    it("should classify inputs > 4 words as 'sentence'", () => {
      expect(manager.classify("this is a longer sentence here")).toBe("sentence");
      expect(manager.classify("one two three four five")).toBe("sentence");
    });

    it("should classify inputs with sentence-ending punctuation (. ! ?) as 'sentence'", () => {
      expect(manager.classify("Wait.")).toBe("sentence");
      expect(manager.classify("Stop!")).toBe("sentence");
      expect(manager.classify("Why not?")).toBe("sentence");
      expect(manager.classify("The experiment succeeded.")).toBe("sentence");
    });

    it("should classify CJK text adaptively without whitespace", () => {
      // 1 - 2 CJK characters -> word
      expect(manager.classify("猫")).toBe("word");
      expect(manager.classify("勉強")).toBe("word");
      expect(manager.classify("你好")).toBe("word");

      // 3 - 6 CJK characters -> phrase
      expect(manager.classify("いい天気")).toBe("phrase");
      expect(manager.classify("人工智能")).toBe("phrase");

      // > 6 CJK characters -> sentence
      expect(manager.classify("今日はとてもいい天気ですね")).toBe("sentence");
      expect(manager.classify("机器学习正在改变软件工程")).toBe("sentence");

      // CJK sentence punctuation (。 ！？ …)
      expect(manager.classify("待って。")).toBe("sentence");
      expect(manager.classify("こんにちは！")).toBe("sentence");
      expect(manager.classify("本当？")).toBe("sentence");
    });
  });

  describe("cache management", () => {
    it("should return the LRUCache instance via getCache()", () => {
      const cache = manager.getCache();
      expect(cache).toBeInstanceOf(LRUCache);
    });

    it("should return cached result on second lookup without calling network", async () => {
      // Mock FreeDict response
      const freeDictData = [
        {
          word: "hypothesis",
          phonetic: "/haɪˈpɑː.θə.sɪs/",
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "a proposed explanation" }],
            },
          ],
        },
      ];

      // Mock Google Translate response
      const gtData = [[["giả thuyết", "hypothesis"]]];

      vi.mocked(requestUrl).mockImplementation(async (param: any) => {
        if (param.url.includes("dictionaryapi.dev")) {
          return {
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: freeDictData,
            text: JSON.stringify(freeDictData),
          };
        }
        if (param.url.includes("translate.googleapis.com")) {
          return {
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            json: gtData,
            text: JSON.stringify(gtData),
          };
        }
        return {
          status: 404,
          headers: {},
          arrayBuffer: new ArrayBuffer(0),
          json: null,
          text: "",
        };
      });

      // First lookup
      const res1 = await manager.lookup(
        "hypothesis",
        "The scientist proposed a bold hypothesis."
      );

      expect(res1.query).toBe("hypothesis");
      expect(res1.vietnameseTranslation).toBe("giả thuyết");
      expect(res1.phonetic).toBe("/haɪˈpɑː.θə.sɪs/");
      expect(requestUrl).toHaveBeenCalledTimes(2); // FreeDict + GoogleTranslate

      const initialTimestamp = res1.timestamp;

      // The same query and context can reuse its completed result
      vi.clearAllMocks();
      const res2 = await manager.lookup(
        "hypothesis",
        "The scientist proposed a bold hypothesis."
      );

      // Should return from cache without network calls
      expect(requestUrl).not.toHaveBeenCalled();
      expect(res2.query).toBe("hypothesis");
      expect(res2.vietnameseTranslation).toBe("giả thuyết");
      expect(res2.timestamp).toBeGreaterThanOrEqual(initialTimestamp);
    });
  });

  describe("lookup: 3-Tier Execution", () => {
    describe("Tier 1: 'word'", () => {
      it("should execute FreeDict and GoogleTranslate in parallel and assemble result", async () => {
        const freeDictData = [
          {
            word: "crucial",
            phonetic: "/ˈkruː.ʃəl/",
            phonetics: [{ audio: "https://example.com/crucial-us.mp3" }],
            meanings: [
              {
                partOfSpeech: "adjective",
                definitions: [
                  {
                    definition: "extremely important",
                    example: "Negotiations are at a crucial stage.",
                  },
                ],
              },
            ],
          },
        ];
        const gtData = [[["quan trọng", "crucial"]]];

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("dictionaryapi.dev")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: freeDictData,
              text: JSON.stringify(freeDictData),
            };
          }
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const res = await manager.lookup(
          "crucial",
          "This is a crucial moment for science."
        );

        expect(res.type).toBe("word");
        expect(res.query).toBe("crucial");
        expect(res.phonetic).toBe("/ˈkruː.ʃəl/");
        expect(res.audioUrl).toBe("https://example.com/crucial-us.mp3");
        expect(res.vietnameseTranslation).toBe("quan trọng");
        expect(res.definitions).toHaveLength(1);
        expect(res.definitions?.[0]).toEqual({
          partOfSpeech: "adjective",
          meaningEn: "extremely important",
          example: "Negotiations are at a crucial stage.",
        });
        expect(res.contextSentence).toContain("**crucial**");
        expect(res.contextSentenceClean).toBe("This is a crucial moment for science.");
      });

      it("should call GeminiService when enableAiGrammar is true and apiKey is provided", async () => {
        const freeDictData = [
          {
            word: "ephemeral",
            phonetics: [],
            meanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "short-lived" }] }],
          },
        ];
        const gtData = [[["phù du", "ephemeral"]]];
        const geminiData = {
          candidates: [
            {
              content: {
                parts: [{ text: "Từ này mô tả tính chất ngắn ngủi, thoáng qua." }],
              },
            },
          ],
        };

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("dictionaryapi.dev")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: freeDictData,
              text: JSON.stringify(freeDictData),
            };
          }
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          if (param.url.includes("generativelanguage.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: geminiData,
              text: JSON.stringify(geminiData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const customSettings = {
          ...DEFAULT_SETTINGS,
          enableAiGrammar: true,
          geminiApiKey: "test-api-key",
        };

        const res = await manager.lookup(
          "ephemeral",
          "Fame is ephemeral in modern society.",
          undefined,
          customSettings
        );

        expect(res.type).toBe("word");
        expect(res.vietnameseTranslation).toBe("phù du");
        expect(res.aiGrammarNote).toBe("Từ này mô tả tính chất ngắn ngủi, thoáng qua.");
        expect(requestUrl).toHaveBeenCalledTimes(3);
      });

      it("should fallback to GoogleTranslate when FreeDict returns 404", async () => {
        const gtData = [[["từ không xác định", "unknownword"]]];

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("dictionaryapi.dev")) {
            return {
              status: 404,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: { title: "No Definitions Found" },
              text: "{}",
            };
          }
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const res = await manager.lookup(
          "unknownword",
          "This is an unknownword in a test."
        );

        expect(res.type).toBe("word");
        expect(res.vietnameseTranslation).toBe("từ không xác định");
        expect(res.definitions).toBeUndefined();
        expect(res.phonetic).toBeUndefined();
      });
    });

    describe("Tier 2: 'phrase'", () => {
      it("should lookup phrase in FreeDict and GoogleTranslate", async () => {
        // FreeDict returns 404 for idioms usually, treated as translation phrase
        const gtData = [[["chăm sóc", "take care of"]]];

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("dictionaryapi.dev")) {
            return {
              status: 404,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: null,
              text: "",
            };
          }
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const res = await manager.lookup(
          "take care of",
          "Please take care of the child."
        );

        expect(res.type).toBe("phrase");
        expect(res.query).toBe("take care of");
        expect(res.vietnameseTranslation).toBe("chăm sóc");
        expect(res.definitions).toBeUndefined();
      });
    });

    describe("Tier 3: 'sentence'", () => {
      it("should translate sentence via GoogleTranslate when Gemini is disabled", async () => {
        const gtData = [[["Đây là một câu hoàn chỉnh.", "This is a complete sentence."]]];

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const res = await manager.lookup(
          "This is a complete sentence.",
          "This is a complete sentence. And here is more."
        );

        expect(res.type).toBe("sentence");
        expect(res.vietnameseTranslation).toBe("Đây là một câu hoàn chỉnh.");
        // Does not call FreeDict for sentences
        expect(requestUrl).toHaveBeenCalledTimes(1);
        const calledUrl = vi.mocked(requestUrl).mock.calls[0][0] as any;
        expect(calledUrl.url).toContain("translate.googleapis.com");
      });

      it("should analyze and translate sentence via Gemini when enabled", async () => {
        const geminiData = {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "Dịch: Khoa học đã chứng minh điều này. Cấu trúc hiện tại hoàn thành 'has proven'.",
                  },
                ],
              },
            },
          ],
        };

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("generativelanguage.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: geminiData,
              text: JSON.stringify(geminiData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const customSettings = {
          ...DEFAULT_SETTINGS,
          enableAiGrammar: true,
          geminiApiKey: "gemini-key",
        };

        const res = await manager.lookup(
          "Science has proven this phenomenon.",
          "Science has proven this phenomenon in multiple experiments.",
          undefined,
          customSettings
        );

        expect(res.type).toBe("sentence");
        expect(res.vietnameseTranslation).toContain("Khoa học đã chứng minh điều này");
        expect(res.aiGrammarNote).toContain("Cấu trúc hiện tại hoàn thành");
        expect(requestUrl).toHaveBeenCalledTimes(1);
        const calledUrl = vi.mocked(requestUrl).mock.calls[0][0] as any;
        expect(calledUrl.url).toContain("generativelanguage.googleapis.com");
      });

      it("should fallback to GoogleTranslate if Gemini fails for a sentence", async () => {
        const gtData = [[["Dịch fallback từ Google", "Science has proven this."]]];

        vi.mocked(requestUrl).mockImplementation(async (param: any) => {
          if (param.url.includes("generativelanguage.googleapis.com")) {
            return {
              status: 500,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: { error: "Internal Error" },
              text: "error",
            };
          }
          if (param.url.includes("translate.googleapis.com")) {
            return {
              status: 200,
              headers: {},
              arrayBuffer: new ArrayBuffer(0),
              json: gtData,
              text: JSON.stringify(gtData),
            };
          }
          return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text: "" };
        });

        const customSettings = {
          ...DEFAULT_SETTINGS,
          enableAiGrammar: true,
          geminiApiKey: "failing-gemini-key",
        };

        const res = await manager.lookup(
          "Science has definitely proven this phenomenon.",
          "Science has definitely proven this phenomenon.",
          undefined,
          customSettings
        );

        expect(res.type).toBe("sentence");
        expect(res.vietnameseTranslation).toBe("Dịch fallback từ Google");
      });
    });
  });

  describe("cancelPending and AbortController", () => {
    it("should abort active controller without throwing errors when idle", () => {
      expect(() => manager.cancelPending()).not.toThrow();
    });

    it("should cause an in-flight lookup to reject with AbortError when cancelPending is called", async () => {
      let resolveRequest: any;
      const deferredPromise = new Promise<any>((resolve) => {
        resolveRequest = resolve;
      });

      vi.mocked(requestUrl).mockImplementation(async () => {
        return deferredPromise;
      });

      const lookupPromise = manager.lookup("slowword", "This is a slowword in context.");

      // Cancel while in-flight
      manager.cancelPending();

      // Resolve the network call
      resolveRequest({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: [],
        text: "[]",
      });

      await expect(lookupPromise).rejects.toThrow("The lookup operation was aborted");
      await expect(lookupPromise).rejects.toMatchObject({ name: "AbortError" });
    });

    it("should pass effective preferredAccent to FreeDictService.lookup", async () => {
      const freeDictSpy = vi.spyOn(manager["freeDict"], "lookup");
      vi.mocked(requestUrl).mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: [],
        text: "[]",
      });

      const customSettings = {
        ...DEFAULT_SETTINGS,
        preferredAccent: "uk" as const,
      };

      await manager.lookup("colour", "The colour was red.", undefined, customSettings);

      expect(freeDictSpy).toHaveBeenCalledWith("colour", "uk");
    });

    it("should bypass FreeDict when CJK text is detected and populate sourceLang & transliteration", async () => {
      const freeDictSpy = vi.spyOn(manager["freeDict"], "lookup");
      const gtSpy = vi.spyOn(manager["googleTranslate"], "translateWithMeta").mockResolvedValue({
        translation: "xin chào",
        detectedLang: "ja",
        transliteration: "Konnichiwa",
      });

      const result = await manager.lookup("こんにちは", "こんにちは世界");

      // FreeDict must NOT be called for CJK text
      expect(freeDictSpy).not.toHaveBeenCalled();
      expect(gtSpy).toHaveBeenCalledWith("こんにちは", "auto", "vi", expect.any(String));

      expect(result.sourceLang).toBe("ja");
      expect(result.transliteration).toBe("Konnichiwa");
      expect(result.vietnameseTranslation).toBe("xin chào");
    });

    it("should isolate cache entries by targetLanguage", async () => {
      const gtSpy = vi.spyOn(manager["googleTranslate"], "translateWithMeta");

      // 1st lookup: targetLang = "vi"
      gtSpy.mockResolvedValueOnce({
        translation: "xin chào",
        detectedLang: "ja",
        transliteration: "Konnichiwa",
      });
      const resVi = await manager.lookup("こんにちは", "こんにちは", undefined, {
        ...DEFAULT_SETTINGS,
        targetLanguage: "vi",
      });
      expect(resVi.vietnameseTranslation).toBe("xin chào");
      expect(gtSpy).toHaveBeenCalledTimes(1);

      // 2nd lookup: targetLang = "en" -> must not return cached Vietnamese result
      gtSpy.mockResolvedValueOnce({
        translation: "hello",
        detectedLang: "ja",
        transliteration: "Konnichiwa",
      });
      const resEn = await manager.lookup("こんにちは", "こんにちは", undefined, {
        ...DEFAULT_SETTINGS,
        targetLanguage: "en",
      });
      expect(resEn.vietnameseTranslation).toBe("hello");
      expect(gtSpy).toHaveBeenCalledTimes(2);
    });

    it("should support Progressive Loading with onAiUpdate callback", async () => {
      const freeDictSpy = vi.spyOn((manager as any).freeDict, "lookup").mockResolvedValueOnce({
        word: "qualifies",
        phonetic: "/kwɑːlɪfaɪz/",
        definitions: [{ partOfSpeech: "verb", meaningEn: "be entitled to" }],
      });
      const gtSpy = vi.spyOn((manager as any).googleTranslate, "translateWithMeta").mockResolvedValueOnce({
        translation: "đủ điều kiện",
        detectedLang: "en",
      });
      const aiTransSpy = vi.spyOn((manager as any).geminiService, "translateContext").mockResolvedValueOnce(
        "Đủ tiêu chuẩn cấu thành một dự án."
      );
      const aiGrammarSpy = vi.spyOn((manager as any).geminiService, "analyzeGrammar").mockResolvedValueOnce(
        "• **Cấu trúc:** `qualify as + Noun`"
      );

      const onAiUpdate = vi.fn();
      const settings = {
        ...DEFAULT_SETTINGS,
        geminiApiKey: "valid-key",
        enableAiTranslation: true,
        enableAiGrammar: true,
      };

      const res = await manager.lookup(
        "qualifies",
        "It qualifies as a project rather than routine operations.",
        0,
        settings,
        { noteTitle: "IT Software Project Management" },
        onAiUpdate
      );

      // Immediately returned base result
      expect(res.aiLoading).toBe(true);
      expect(res.vietnameseTranslation).toBe("đủ điều kiện");
      expect(res.phonetic).toBe("/kwɑːlɪfaɪz/");

      // Allow background microtask to finish
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onAiUpdate).toHaveBeenCalledTimes(1);
      const updatedResult = onAiUpdate.mock.calls[0][0];
      expect(updatedResult.aiLoading).toBe(false);
      expect(updatedResult.aiTranslation).toBe("Đủ tiêu chuẩn cấu thành một dự án.");
      expect(updatedResult.vietnameseTranslation).toBe("Đủ tiêu chuẩn cấu thành một dự án.");
      expect(updatedResult.aiGrammarNote).toBe("• **Cấu trúc:** `qualify as + Noun`");
    });

    it("should unpack { docContext, onAiUpdate } when passed as the 5th argument and enable progressive loading", async () => {
      vi.spyOn((manager as any).freeDict, "lookup").mockResolvedValueOnce({
        word: "sprint",
        phonetic: "/sprɪnt/",
        definitions: [{ partOfSpeech: "noun", definition: "A fast run" }],
      });
      vi.spyOn((manager as any).googleTranslate, "translateWithMeta").mockResolvedValueOnce({
        translation: "chạy nước rút",
      });
      const translateSpy = vi.spyOn((manager as any).geminiService, "translateContext").mockResolvedValueOnce(
        "Giai đoạn nước rút trong Agile."
      );
      vi.spyOn((manager as any).geminiService, "analyzeGrammar").mockResolvedValueOnce(
        "• **Từ loại:** Danh từ"
      );

      const onAiUpdate = vi.fn();
      const settings = {
        ...DEFAULT_SETTINGS,
        geminiApiKey: "valid-key",
        enableAiTranslation: true,
        enableAiGrammar: true,
      };

      const docContextMeta = {
        noteTitle: "Scrum Methodology",
        heading: "Sprint Planning",
        tags: ["agile", "scrum"],
      };

      // Gọi theo kiểu wrapper { docContext, onAiUpdate }
      const res = await manager.lookup(
        "sprint",
        "The team conducted sprint planning.",
        0,
        settings,
        {
          docContext: docContextMeta,
          onAiUpdate,
        } as any
      );

      // Trả về base result ngay lập tức
      expect(res.aiLoading).toBe(true);
      expect(res.vietnameseTranslation).toBe("chạy nước rút");
      expect(res.docContext).toEqual(docContextMeta);

      // Chờ microtask AI chạy ngầm xong
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(translateSpy).toHaveBeenCalledWith(
        "sprint",
        expect.any(String),
        "valid-key",
        docContextMeta,
        expect.any(String),
        "vi"
      );
      expect(onAiUpdate).toHaveBeenCalledTimes(1);
      const updated = onAiUpdate.mock.calls[0][0];
      expect(updated.aiLoading).toBe(false);
      expect(updated.aiTranslation).toBe("Giai đoạn nước rút trong Agile.");
    });

    it("should only call translateContext when enableAiTranslation is true and enableAiGrammar is false", async () => {
      vi.spyOn((manager as any).freeDict, "lookup").mockResolvedValueOnce(null);
      vi.spyOn((manager as any).googleTranslate, "translateWithMeta").mockResolvedValueOnce({
        translation: "đủ điều kiện",
      });
      const aiTransSpy = vi.spyOn((manager as any).geminiService, "translateContext").mockResolvedValueOnce(
        "Bản dịch chuyên ngành chuẩn."
      );
      const aiGrammarSpy = vi.spyOn((manager as any).geminiService, "analyzeGrammar").mockResolvedValueOnce(
        "Ngữ pháp"
      );

      const settings = {
        ...DEFAULT_SETTINGS,
        geminiApiKey: "valid-key",
        enableAiTranslation: true,
        enableAiGrammar: false,
      };

      const res = await manager.lookup("word", "context sentence", 0, settings);

      expect(aiTransSpy).toHaveBeenCalled();
      expect(aiGrammarSpy).not.toHaveBeenCalled();
      expect(res.aiTranslation).toBe("Bản dịch chuyên ngành chuẩn.");
      expect(res.vietnameseTranslation).toBe("Bản dịch chuyên ngành chuẩn.");
      expect(res.aiGrammarNote).toBeUndefined();
    });

    it("should format multiple choice options onto separate lines in vietnameseTranslation and aiTranslation", async () => {
      vi.spyOn((manager as any).freeDict, "lookup").mockResolvedValueOnce(null);
      vi.spyOn((manager as any).googleTranslate, "translateWithMeta").mockResolvedValueOnce({
        translation: "Câu hỏi? A. Đáp án 1 B. Đáp án 2 C. Đáp án 3 D. Đáp án 4",
      });
      vi.spyOn((manager as any).geminiService, "translateContext").mockResolvedValueOnce(
        "Câu hỏi chuyên ngành? A. Lựa chọn 1 B. Lựa chọn 2 C. Lựa chọn 3 D. Lựa chọn 4"
      );

      const settings = {
        ...DEFAULT_SETTINGS,
        geminiApiKey: "valid-key",
        enableAiTranslation: true,
      };

      const res = await manager.lookup(
        "Question? A. Choice 1 B. Choice 2",
        "Full context",
        0,
        settings
      );

      expect(res.vietnameseTranslation).toBe(
        "Câu hỏi chuyên ngành?\nA. Lựa chọn 1\nB. Lựa chọn 2\nC. Lựa chọn 3\nD. Lựa chọn 4"
      );
      expect(res.aiTranslation).toBe(
        "Câu hỏi chuyên ngành?\nA. Lựa chọn 1\nB. Lựa chọn 2\nC. Lựa chọn 3\nD. Lựa chọn 4"
      );
    });
  });
});

describe("lookup cache isolation and lifetime", () => {
  const offline = { ...DEFAULT_SETTINGS, enableAiTranslation: false, enableAiGrammar: false };
  const aiSettings = { ...offline, geminiApiKey: "offline-key", enableAiTranslation: true };
  const ticks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(yes => { resolve = yes; });
    return { promise, resolve };
  }
  function setup(settings: PluginSettings = offline) {
    const manager = new ProviderManager(settings);
    const providers = manager as unknown as {
      freeDict: FreeDictService; googleTranslate: GoogleTranslate; geminiService: GeminiService;
    };
    const dictionary = vi.spyOn(providers.freeDict, "lookup").mockResolvedValue({
      word: "bank", phonetic: "/bank/", definitions: [{ partOfSpeech: "noun", meaningEn: "a financial institution" }],
    });
    const google = vi.spyOn(providers.googleTranslate, "translateWithMeta").mockResolvedValue({
      translation: "Google", detectedLang: "en",
    });
    const translate = vi.spyOn(providers.geminiService, "translateContext").mockResolvedValue("AI");
    const grammar = vi.spyOn(providers.geminiService, "analyzeGrammar").mockResolvedValue("Grammar");
    const legacy = vi.spyOn(providers.geminiService, "analyzeContext").mockResolvedValue("Legacy grammar");
    return { manager, dictionary, google, translate, grammar, legacy };
  }

  it("isolates source language and preserves the requested document metadata", async () => {
    const { manager, google } = setup();
    google.mockImplementation(async (_text, source = "auto") => ({
      translation: source === "de" ? "thuốc độc" : "quà tặng", detectedLang: source,
    }));
    await manager.lookup("Gift", "Gift", 0, { sourceLanguage: "en" }, { noteTitle: "English" });
    const result = await manager.lookup("Gift", "Gift", 0, { sourceLanguage: "de" }, { noteTitle: "German" });
    expect(result).toMatchObject({ vietnameseTranslation: "thuốc độc", sourceLang: "de", docContext: { noteTitle: "German" } });
  });

  it("keeps case-sensitive queries distinct", async () => {
    const { manager, google } = setup();
    google.mockImplementation(async query => ({ translation: query === "Polish" ? "tiếng Ba Lan" : "đánh bóng", detectedLang: "en" }));
    await manager.lookup("Polish", "Polish", 0);
    const result = await manager.lookup("polish", "polish", 0);
    expect(result).toMatchObject({ query: "polish", vietnameseTranslation: "đánh bóng" });
  });

  it("recomputes contextual AI when the selected sentence changes", async () => {
    const { manager, translate } = setup(aiSettings);
    translate.mockImplementation(async (_text, context) => context.includes("river") ? "bờ sông" : "ngân hàng");
    await manager.lookup("bank", "At the bank.", 0);
    const result = await manager.lookup("bank", "By the river bank.", 0);
    expect(result).toMatchObject({ aiTranslation: "bờ sông", contextSentenceClean: "By the river bank." });
  });

  it("recomputes contextual AI when only document metadata changes", async () => {
    const { manager, translate } = setup(aiSettings);
    translate.mockImplementation(async (_text, _context, _key, doc) => doc?.noteTitle || "");
    await manager.lookup("bank", "bank", 0, undefined, { noteTitle: "Finance", heading: "Accounts", tags: ["money"] });
    const result = await manager.lookup("bank", "bank", 0, undefined, { noteTitle: "Geography", heading: "River", tags: ["water"] });
    expect(result).toMatchObject({ aiTranslation: "Geography", docContext: { noteTitle: "Geography", heading: "River", tags: ["water"] } });
  });

  it.each([
    [{ translateEndpointUrl: "https://offline.invalid/new" }, "new endpoint"],
    [{ preferredAccent: "uk" as const }, "new accent"],
  ])("isolates result-affecting provider settings %j", async (changed, expected) => {
    const { manager, google, dictionary } = setup();
    google.mockImplementation(async (_text, _source, _target, endpoint) => ({
      translation: endpoint === "https://offline.invalid/new" ? "new endpoint" : "Google", detectedLang: "en",
    }));
    dictionary.mockImplementation(async (_text, accent) => ({ word: "bank", definitions: [], phonetic: accent === "uk" ? "new accent" : "/bank/" }));
    await manager.lookup("bank", "bank", 0);
    const result = await manager.lookup("bank", "bank", 0, changed);
    expect("preferredAccent" in changed ? result.phonetic : result.vietnameseTranslation).toBe(expected);
  });

  it("runs newly enabled AI instead of returning an earlier non-AI result", async () => {
    const { manager } = setup();
    await manager.lookup("bank", "bank", 0);
    const result = await manager.lookup("bank", "bank", 0, aiSettings);
    expect(result).toMatchObject({ aiTranslation: "AI", vietnameseTranslation: "AI", aiLoading: false });
  });

  it("does not reuse translation or grammar after their feature flags change", async () => {
    const { manager } = setup(aiSettings);
    await manager.lookup("bank", "bank", 0);
    const result = await manager.lookup("bank", "bank", 0, { enableAiTranslation: false, enableAiGrammar: true });
    expect(result.aiTranslation).toBeUndefined();
    expect(result).toMatchObject({ vietnameseTranslation: "Google", aiGrammarNote: "Grammar", aiLoading: false });
  });

  it("invalidates credential changes without exposing credentials in cache keys", async () => {
    const { manager, translate } = setup(aiSettings);
    translate.mockImplementation(async (_text, _context, key) => key === "replacement-secret" ? "new credentials" : "old credentials");
    await manager.lookup("bank", "bank", 0);
    const result = await manager.lookup("bank", "bank", 0, { geminiApiKey: "replacement-secret" });
    expect(result.aiTranslation).toBe("new credentials");
    expect(manager.getCache().keys().join(" ")).not.toMatch(/offline-key|replacement-secret/);
  });

  it("isolates credentials when separate managers share an injected cache", async () => {
    const cache = new LRUCache<LookupResult>();
    const first = new ProviderManager(aiSettings, cache);
    const second = new ProviderManager({ ...aiSettings, geminiApiKey: "second-offline-key" }, cache);
    for (const [manager, translation] of [[first, "First account"], [second, "Second account"]] as const) {
      vi.spyOn((manager as any).freeDict, "lookup").mockResolvedValue(null);
      vi.spyOn((manager as any).googleTranslate, "translateWithMeta").mockResolvedValue({ translation: "Google" });
      vi.spyOn((manager as any).geminiService, "translateContext").mockResolvedValue(translation);
    }
    await first.lookup("bank", "bank");
    await second.lookup("bank", "bank");
    const result = await first.lookup("bank", "bank");
    expect(result.aiTranslation).toBe("First account");
    expect(cache.keys().join(" ")).not.toMatch(/offline-key|second-offline-key/);
  });

  it("distinguishes an explicit empty document context from no document context", async () => {
    const { manager } = setup();
    await manager.lookup("bank", "bank");
    const result = await manager.lookup("bank", "bank", 0, undefined, {});
    expect(result.docContext).toEqual({});
  });

  it("returns independent snapshots and captures document tags before awaiting providers", async () => {
    const { manager, google } = setup();
    const gate = deferred<GoogleTranslationMeta>();
    google.mockReturnValueOnce(gate.promise);
    const doc = { noteTitle: "Finance", tags: ["money"] };
    const pending = manager.lookup("bank", "bank", 0, undefined, doc);
    doc.tags[0] = "mutated during request";
    gate.resolve({ translation: "Google", detectedLang: "en" });
    const first = await pending;
    expect(first.docContext?.tags).toEqual(["money"]);
    first.docContext!.tags![0] = "mutated result";
    first.definitions![0].meaningEn = "mutated definition";
    first.vietnameseTranslation = "mutated translation";
    const second = await manager.lookup("bank", "bank", 0, undefined, { noteTitle: "Finance", tags: ["money"] });
    expect(second).toMatchObject({ vietnameseTranslation: "Google", docContext: { tags: ["money"] }, definitions: [{ meaningEn: "a financial institution" }] });
    expect(second).not.toBe(first);
    expect(google).toHaveBeenCalledTimes(1);
  });

  it("keeps progressive base, AI callback and cached snapshots independent", async () => {
    const { manager, translate } = setup(aiSettings);
    const gate = deferred<string>();
    translate.mockReturnValueOnce(gate.promise);
    const updates: LookupResult[] = [];
    const base = await manager.lookup("bank", "bank", 0, undefined, undefined, value => updates.push(value));
    expect(base).toMatchObject({ vietnameseTranslation: "Google", aiLoading: true });
    gate.resolve("AI");
    await ticks();
    expect(updates[0]).toMatchObject({ aiTranslation: "AI", aiLoading: false });
    expect(base).toMatchObject({ vietnameseTranslation: "Google", aiLoading: true });
    updates[0].vietnameseTranslation = "mutated callback";
    const cached = await manager.lookup("bank", "bank", 0, undefined, undefined, () => {});
    expect(cached.vietnameseTranslation).toBe("AI");
  });

  it("cancels pending AI and clears old results when runtime settings update", async () => {
    const { manager, translate } = setup(aiSettings);
    const gate = deferred<string>();
    translate.mockReturnValueOnce(gate.promise);
    const update = vi.fn();
    await manager.lookup("bank", "bank", 0, undefined, undefined, update);
    manager.updateSettings({ geminiApiKey: "replacement-secret" });
    gate.resolve("stale AI");
    await ticks();
    expect(update).not.toHaveBeenCalled();
    expect(manager.getCache().size).toBe(0);
    const next = await manager.lookup("bank", "bank", 0);
    expect(next.aiTranslation).toBe("AI");
  });

  it("does not publish or cache an AI fallback that finishes after cancellation", async () => {
    const { manager, grammar, legacy } = setup({ ...aiSettings, enableAiTranslation: false, enableAiGrammar: true });
    grammar.mockResolvedValueOnce(null);
    const gate = deferred<string>();
    legacy.mockReturnValueOnce(gate.promise);
    const update = vi.fn();
    await manager.lookup("bank", "bank", 0, undefined, undefined, update);
    await ticks();
    manager.cancelPending();
    gate.resolve("stale fallback");
    await ticks();
    expect(update).not.toHaveBeenCalled();
    expect(manager.getCache().size).toBe(0);
  });

  it("rejects cancellation while a legacy sentence falls back to Google", async () => {
    const { manager, legacy, google } = setup({ ...offline, enableAiGrammar: true, geminiApiKey: "offline-key" });
    legacy.mockResolvedValueOnce(null);
    const gate = deferred<GoogleTranslationMeta>();
    google.mockReturnValueOnce(gate.promise);
    const pending = manager.lookup("This is a full sentence.", "This is a full sentence.");
    await ticks();
    manager.cancelPending();
    gate.resolve({ translation: "stale Google", detectedLang: "en" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(manager.getCache().size).toBe(0);
  });

  it("uses progressive sentence grammar with the wrapper callback", async () => {
    const { manager, legacy, grammar } = setup({ ...offline, enableAiGrammar: true, geminiApiKey: "offline-key" });
    const gate = deferred<string>();
    grammar.mockReturnValueOnce(gate.promise);
    const update = vi.fn();
    const base = await manager.lookup("This is a full sentence.", "This is a full sentence.", 0, undefined, { onAiUpdate: update });
    expect(base).toMatchObject({ vietnameseTranslation: "Google", aiLoading: true });
    expect(legacy).not.toHaveBeenCalled();
    gate.resolve("Grammar");
    await ticks();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ aiGrammarNote: "Grammar", aiLoading: false }));
  });
});

