import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { ProviderManager } from "../../src/services/provider/ProviderManager";
import { LRUCache } from "../../src/utils/lruCache";
import { DEFAULT_SETTINGS, LookupResult } from "../../src/types";

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

      // Second lookup of the same word (case-insensitive)
      vi.clearAllMocks();
      const res2 = await manager.lookup(
        "Hypothesis",
        "Another sentence with hypothesis."
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

  describe("cancelPending", () => {
    it("should abort active controller without throwing errors", () => {
      expect(() => manager.cancelPending()).not.toThrow();
    });
  });
});
