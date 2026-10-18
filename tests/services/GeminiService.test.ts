import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { GeminiService } from "../../src/services/provider/GeminiService";

describe("GeminiService", () => {
  let service: GeminiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GeminiService();
  });

  describe("analyzeContext", () => {
    it("should return null if apiKey is empty or whitespace", async () => {
      const res1 = await service.analyzeContext("target", "sentence", "");
      const res2 = await service.analyzeContext("target", "sentence", "   ");
      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it("should return null if targetText is empty or whitespace", async () => {
      const res1 = await service.analyzeContext("", "sentence", "valid-key");
      const res2 = await service.analyzeContext("   ", "sentence", "valid-key");
      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it("should send POST request with default model 'gemini-flash-latest' and extract analysis text", async () => {
      const mockGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Trong câu này, 'hypothesis' có nghĩa là 'giả thuyết'. Cấu trúc: propose a hypothesis.",
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      };

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockGeminiResponse,
        text: JSON.stringify(mockGeminiResponse),
      });

      const res = await service.analyzeContext(
        "hypothesis",
        "The scientist proposed a bold hypothesis.",
        "my-gemini-key"
      );

      expect(res).toBe(
        "Trong câu này, 'hypothesis' có nghĩa là 'giả thuyết'. Cấu trúc: propose a hypothesis."
      );

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=my-gemini-key",
          method: "POST",
          throw: false,
        })
      );

      const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
      const body = JSON.parse(callArgs.body);
      expect(body.contents[0].parts[0].text).toContain("hypothesis");
      expect(body.contents[0].parts[0].text).toContain("The scientist proposed a bold hypothesis.");
    });

    it("should allow specifying a custom model", async () => {
      const mockGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Custom model output" }],
            },
          },
        ],
      };

      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockGeminiResponse,
        text: JSON.stringify(mockGeminiResponse),
      });

      const res = await service.analyzeContext(
        "breakthrough",
        "A major breakthrough.",
        "api-key-123",
        "gemini-1.5-pro"
      );

      expect(res).toBe("Custom model output");
      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=api-key-123",
        })
      );
    });

    it("should return null when API returns non-200 status", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 400,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { error: { message: "Bad Request" } },
        text: JSON.stringify({ error: { message: "Bad Request" } }),
      });

      const res = await service.analyzeContext("word", "sentence", "invalid-key");
      expect(res).toBeNull();
    });

    it("should return null when network request fails", async () => {
      vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Network Error"));

      const res = await service.analyzeContext("word", "sentence", "my-key");
      expect(res).toBeNull();
    });

    it("should return null when candidates array is empty or malformed", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { candidates: [] },
        text: JSON.stringify({ candidates: [] }),
      });

      const res = await service.analyzeContext("word", "sentence", "my-key");
      expect(res).toBeNull();
    });
  });

  describe("testConnection", () => {
    it("should return false if apiKey is empty or whitespace", async () => {
      expect(await service.testConnection("")).toBe(false);
      expect(await service.testConnection("   ")).toBe(false);
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it("should return true when API returns status 200", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { candidates: [{ content: { parts: [{ text: "Hello" }] } }] },
        text: "{}",
      });

      const result = await service.testConnection("valid-api-key");
      expect(result).toBe(true);
      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=valid-api-key",
          method: "POST",
          throw: false,
        })
      );
    });

    it("should return false when API returns status 400 (Bad Request)", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 400,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { error: { code: 400, message: "API key not valid" } },
        text: "error",
      });

      const result = await service.testConnection("bad-api-key");
      expect(result).toBe(false);
    });

    it("should return false when API returns status 403 (Forbidden)", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 403,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { error: { code: 403, message: "Permission denied" } },
        text: "error",
      });

      const result = await service.testConnection("forbidden-key");
      expect(result).toBe(false);
    });

    it("should return false when requestUrl throws network error", async () => {
      vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Connection refused"));

      const result = await service.testConnection("any-key");
      expect(result).toBe(false);
    });

    it("should auto-upgrade deprecated gemini-2.0-flash to gemini-flash-latest", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { candidates: [{ content: { parts: [{ text: "Analysis" }] } }] },
        text: "{}",
      });

      await service.analyzeContext("target", "sentence", "key", "gemini-2.0-flash");
      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=key",
        })
      );
    });

    it("should return detailed error message with testConnectionDetailed on 400", async () => {
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 400,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: { error: { message: "API key not valid" } },
        text: JSON.stringify({ error: { message: "API key not valid" } }),
      });

      const res = await service.testConnectionDetailed("bad-key");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("API key not valid");
    });
  });

  describe("translateContext", () => {
    it("should return null if apiKey or targetText is empty", async () => {
      expect(await service.translateContext("", "sentence", "key")).toBeNull();
      expect(await service.translateContext("word", "sentence", "")).toBeNull();
    });

    it("should inject domain context metadata (noteTitle, heading, tags) into prompt and return 1-sentence translation", async () => {
      const mockResponse = {
        candidates: [{ content: { parts: [{ text: "Đủ tiêu chuẩn cấu thành một dự án." }] } }],
      };
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const res = await service.translateContext(
        "qualifies",
        "It qualifies as a project rather than routine operations.",
        "valid-key",
        {
          noteTitle: "IT Software Project Management",
          heading: "Project Qualification",
          tags: ["it", "project-management"],
        }
      );

      expect(res).toBe("Đủ tiêu chuẩn cấu thành một dự án.");
      const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
      const body = JSON.parse(callArgs.body);
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).toContain("IT Software Project Management");
      expect(prompt).toContain("Project Qualification");
      expect(prompt).toContain("project-management");
      expect(prompt).toContain("qualifies");
    });

    it("should accept alias fields fileTitle and headingContext in docContext", async () => {
      const mockResponse = {
        candidates: [{ content: { parts: [{ text: "Dịch chuẩn theo bệnh lý." }] } }],
      };
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      await service.translateContext(
        "arrhythmia",
        "Patient exhibits sinus arrhythmia.",
        "valid-key",
        {
          fileTitle: "Medical Pathology Note",
          headingContext: "Cardiology Symptoms",
          tags: ["medicine", "cardiology"],
        }
      );

      const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
      const body = JSON.parse(callArgs.body);
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).toContain("Medical Pathology Note");
      expect(prompt).toContain("Cardiology Symptoms");
      expect(prompt).toContain("medicine");
      expect(prompt).toContain("arrhythmia");
    });
  });

  describe("analyzeGrammar", () => {
    it("should return null if apiKey or targetText is empty", async () => {
      expect(await service.analyzeGrammar("", "sentence", "key")).toBeNull();
      expect(await service.analyzeGrammar("word", "sentence", "")).toBeNull();
    });

    it("should request max 2 bullet points and return structured grammar markdown", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "• **Cấu trúc:** `qualify as + Noun`\n• **Lưu ý:** Nội động từ." }],
            },
          },
        ],
      };
      vi.mocked(requestUrl).mockResolvedValueOnce({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: mockResponse,
        text: JSON.stringify(mockResponse),
      });

      const res = await service.analyzeGrammar(
        "qualifies",
        "It qualifies as a project rather than routine operations.",
        "valid-key",
        { noteTitle: "IT Software Project Management" }
      );

      expect(res).toBe("• **Cấu trúc:** `qualify as + Noun`\n• **Lưu ý:** Nội động từ.");
      const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
      const body = JSON.parse(callArgs.body);
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).toContain("IT Software Project Management");
      expect(prompt).toContain("ngữ pháp");
    });
  });
});
describe("reading batch language and token contract", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each([["zh", "tiếng Trung"], ["ja", "tiếng Nhật"]])("honors target %s and explicit source", async (target, name) => {
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0),
      json: { candidates: [{ content: { parts: [{ text: '[{"id":0,"translation":"ok"}]' }] } }] }, text: "",
    });
    await new GeminiService().translateBatch([{ id: 0, text: "Use ⟦PG0_0⟧" }], "offline-key", { noteTitle: "Memory" }, target, "gemini-flash-latest", "en");
    const request = vi.mocked(requestUrl).mock.calls[0][0] as any;
    const prompt = JSON.parse(request.body).contents[0].parts[0].text;
    expect(prompt).toContain(name);
    expect(prompt).toContain('Nguồn: en');
    expect(prompt).toContain('Giữ nguyên');
    expect(prompt).toContain('⟦PG');
  });
});
