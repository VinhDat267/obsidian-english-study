import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { FreeDictService, FreeDictResult } from "../../src/services/provider/FreeDictService";

describe("FreeDictService", () => {
  let service: FreeDictService;

  beforeEach(() => {
    vi.mocked(requestUrl).mockReset();
    vi.clearAllMocks();
    service = new FreeDictService();
  });

  describe("lookup - successful responses", () => {
    it("should parse full dictionary entry with IPA, audio, and definitions", async () => {
      const mockResponse = [
        {
          word: "hello",
          phonetic: "/həˈloʊ/",
          phonetics: [
            {
              text: "/həˈloʊ/",
              audio: "https://api.dictionaryapi.dev/media/pronunciations/en/hello-au.mp3",
            },
            {
              text: "/hɛˈloʊ/",
              audio: "https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3",
            },
            {
              text: "/hɛˈloʊ/",
              audio: "https://api.dictionaryapi.dev/media/pronunciations/en/hello-us.mp3",
            },
          ],
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [
                {
                  definition: "A greeting or greeting word.",
                  example: "She gave a friendly hello.",
                },
              ],
            },
            {
              partOfSpeech: "verb",
              definitions: [
                {
                  definition: "To greet with 'hello'.",
                },
              ],
            },
          ],
        },
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const result = await service.lookup("hello");

      expect(result).not.toBeNull();
      expect(result?.word).toBe("hello");
      expect(result?.phonetic).toBe("/həˈloʊ/");
      expect(result?.audioUrl).toBe("https://api.dictionaryapi.dev/media/pronunciations/en/hello-us.mp3");
      expect(result?.definitions).toHaveLength(2);
      expect(result?.definitions[0]).toEqual({
        partOfSpeech: "noun",
        meaningEn: "A greeting or greeting word.",
        example: "She gave a friendly hello.",
      });
      expect(result?.definitions[1]).toEqual({
        partOfSpeech: "verb",
        meaningEn: "To greet with 'hello'.",
      });
      expect(result?.isStemFallback).toBeFalsy();
    });

    it("should prioritize UK audio when preferredAccent is 'uk'", async () => {
      const ukService = new FreeDictService("uk");
      const mockResponse = [
        {
          word: "water",
          phonetics: [
            { audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-us.mp3" },
            { audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-uk.mp3" },
          ],
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A liquid" }],
            },
          ],
        },
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const result = await ukService.lookup("water");
      expect(result?.audioUrl).toBe("https://api.dictionaryapi.dev/media/pronunciations/en/water-uk.mp3");
    });

    it("should prioritize accent provided as argument over constructor accent", async () => {
      const defaultService = new FreeDictService("us");
      const mockResponse = [
        {
          word: "water",
          phonetics: [
            { audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-us.mp3" },
            { audio: "https://api.dictionaryapi.dev/media/pronunciations/en/water-uk.mp3" },
          ],
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A liquid" }],
            },
          ],
        },
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const result = await defaultService.lookup("water", "uk");
      expect(result?.audioUrl).toBe("https://api.dictionaryapi.dev/media/pronunciations/en/water-uk.mp3");
    });

    it("should fallback to phonetic text in phonetics array if entry.phonetic is missing", async () => {
      const mockResponse = [
        {
          word: "test",
          phonetics: [
            { text: "/tɛst/", audio: "" },
          ],
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A procedure" }],
            },
          ],
        },
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const result = await service.lookup("test");
      expect(result?.phonetic).toBe("/tɛst/");
    });

    it("should fallback to any mp3 audio if no -us or -uk suffix is found", async () => {
      const mockResponse = [
        {
          word: "g'day",
          phonetics: [
            { audio: "https://api.dictionaryapi.dev/media/pronunciations/en/gday-au.mp3" },
          ],
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "Greeting" }],
            },
          ],
        },
      ];

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const result = await service.lookup("g'day");
      expect(result?.audioUrl).toBe("https://api.dictionaryapi.dev/media/pronunciations/en/gday-au.mp3");
    });
  });

  describe("lookup - Inflection / Stemming fallback (404)", () => {
    it("should enrich phonetic and audio from stem candidate when 200 OK has empty phonetic", async () => {
      const facilitates200 = [
        {
          word: "facilitates",
          phonetics: [],
          meanings: [
            {
              partOfSpeech: "verb",
              definitions: [{ definition: "To make easy or easier." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: facilitates200,
        text: JSON.stringify(facilitates200),
      });

      const facilitateStem200 = [
        {
          word: "facilitate",
          phonetic: "/fəˈsɪl.ɪ.teɪt/",
          phonetics: [
            {
              text: "/fəˈsɪl.ɪ.teɪt/",
              audio: "https://api.dictionaryapi.dev/media/pronunciations/en/facilitate-us.mp3",
            },
          ],
          meanings: [],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: facilitateStem200,
        text: JSON.stringify(facilitateStem200),
      });

      const result = await service.lookup("facilitates");
      expect(requestUrl).toHaveBeenCalledTimes(2);
      expect(result).not.toBeNull();
      expect(result?.word).toBe("facilitates");
      expect(result?.phonetic).toBe("/fəˈsɪl.ɪ.teɪt/");
      expect(result?.audioUrl).toBe("https://api.dictionaryapi.dev/media/pronunciations/en/facilitate-us.mp3");
      expect(result?.definitions.length).toBe(1);
    });

    it("should fallback from 'running' (-ing) to 'run' when running returns 404", async () => {
      // 1st call for 'running' returns 404
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { title: "No Definitions Found" },
        text: "404 Not Found",
      });

      // 2nd call for 'run' returns 200
      const runResponse = [
        {
          word: "run",
          phonetic: "/rʌn/",
          meanings: [
            {
              partOfSpeech: "verb",
              definitions: [{ definition: "To move swiftly on foot." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: runResponse,
        text: JSON.stringify(runResponse),
      });

      const result = await service.lookup("running");

      expect(requestUrl).toHaveBeenCalledTimes(2);
      expect(result).not.toBeNull();
      expect(result?.word).toBe("run");
      expect(result?.isStemFallback).toBe(true);
      expect(result?.originalQuery).toBe("running");
      expect(result?.definitions[0].meaningEn).toBe("To move swiftly on foot.");
    });

    it("should fallback from 'validated' (-ed) to 'validate'", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "404",
      });

      const validateResponse = [
        {
          word: "validate",
          meanings: [
            {
              partOfSpeech: "verb",
              definitions: [{ definition: "To check or prove the validity of." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: validateResponse,
        text: JSON.stringify(validateResponse),
      });

      const result = await service.lookup("validated");
      expect(result?.word).toBe("validate");
      expect(result?.isStemFallback).toBe(true);
      expect(result?.originalQuery).toBe("validated");
    });

    it("should fallback from 'hypotheses' (-ses) to 'hypothesis'", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "404",
      });

      const hypothesisResponse = [
        {
          word: "hypothesis",
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A proposed explanation." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: hypothesisResponse,
        text: JSON.stringify(hypothesisResponse),
      });

      const result = await service.lookup("hypotheses");
      expect(result?.word).toBe("hypothesis");
      expect(result?.isStemFallback).toBe(true);
      expect(result?.originalQuery).toBe("hypotheses");
    });

    it("should fallback from 'apples' (-s) to 'apple'", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "404",
      });

      const appleResponse = [
        {
          word: "apple",
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A round fruit." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: appleResponse,
        text: JSON.stringify(appleResponse),
      });

      const result = await service.lookup("apples");
      expect(result?.word).toBe("apple");
      expect(result?.isStemFallback).toBe(true);
      expect(result?.originalQuery).toBe("apples");
    });

    it("should fallback from 'varieties' (-ies) to 'variety'", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "404",
      });

      const varietyResponse = [
        {
          word: "variety",
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A number or range of things." }],
            },
          ],
        },
      ];
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: varietyResponse,
        text: JSON.stringify(varietyResponse),
      });

      const result = await service.lookup("varieties");
      expect(result?.word).toBe("variety");
      expect(result?.isStemFallback).toBe(true);
      expect(result?.originalQuery).toBe("varieties");
    });
  });

  describe("lookup - errors and edge cases", () => {
    it("should return null when 404 and all fallbacks also return 404", async () => {
      vi.mocked(requestUrl).mockResolvedValue({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: null,
        text: "404",
      });

      const result = await service.lookup("xyzabcnotaword");
      expect(result).toBeNull();
    });

    it("should return null gracefully on network failure", async () => {
      vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Network connection lost"));

      const result = await service.lookup("connectionerror");
      expect(result).toBeNull();
    });

    it("should return null when input is empty or whitespace", async () => {
      const res1 = await service.lookup("");
      const res2 = await service.lookup("   ");

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(requestUrl).not.toHaveBeenCalled();
    });
  });
});
