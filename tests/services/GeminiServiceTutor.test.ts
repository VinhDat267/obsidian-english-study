import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl } from "obsidian";
import { GeminiService } from "../../src/services/provider/GeminiService";
import { TutorSession } from "../../src/types";

describe("GeminiService - chatWithTutor", () => {
  let service: GeminiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GeminiService();
  });

  const createSampleSession = (overrides?: Partial<TutorSession>): TutorSession => ({
    id: "tutor_session_1",
    query: "ubiquitous",
    contextSentence: "Smartphones are ubiquitous in modern life.",
    sourceLang: "en",
    targetLang: "vi",
    docContext: {
      noteTitle: "Technology and Society",
      heading: "Mobile Era",
      tags: ["tech", "sociology"],
    },
    messages: [
      {
        id: "msg_1",
        role: "user",
        content: "What does ubiquitous mean in this context?",
        timestamp: 1000,
      },
      {
        id: "msg_2",
        role: "model",
        content: "It means present, appearing, or found everywhere.",
        timestamp: 2000,
      },
      {
        id: "msg_3",
        role: "user",
        content: "Can you give another real-world example?",
        timestamp: 3000,
      },
    ],
    createdAt: 1000,
    updatedAt: 3000,
    ...overrides,
  });

  it("1. Successful multi-turn request and text extraction", async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Here is an example: WiFi is practically ubiquitous in cafes today.",
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

    const session = createSampleSession();
    const result = await service.chatWithTutor(session, "test-api-key");

    expect(result).toBe("Here is an example: WiFi is practically ubiquitous in cafes today.");
    expect(requestUrl).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
    expect(callArgs.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=test-api-key"
    );
    expect(callArgs.method).toBe("POST");

    const payload = JSON.parse(callArgs.body);
    expect(payload.contents).toHaveLength(3);
    expect(payload.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "What does ubiquitous mean in this context?" }],
    });
    expect(payload.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "It means present, appearing, or found everywhere." }],
    });
    expect(payload.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Can you give another real-world example?" }],
    });
  });

  it("2. Empty API key returns null", async () => {
    const session = createSampleSession();

    const res1 = await service.chatWithTutor(session, "");
    const res2 = await service.chatWithTutor(session, "   ");
    const res3 = await service.chatWithTutor(session, null as any);

    expect(res1).toBeNull();
    expect(res2).toBeNull();
    expect(res3).toBeNull();
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("3. Empty messages returns null", async () => {
    const sessionEmpty = createSampleSession({ messages: [] });
    const resEmpty = await service.chatWithTutor(sessionEmpty, "valid-key");
    expect(resEmpty).toBeNull();

    const sessionWhitespace = createSampleSession({
      messages: [
        { id: "m1", role: "user", content: "   ", timestamp: 1 },
      ],
    });
    const resWhitespace = await service.chatWithTutor(sessionWhitespace, "valid-key");
    expect(resWhitespace).toBeNull();

    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("4. Correct inclusion of systemInstruction and generationConfig", async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Tutor response text" }],
            role: "model",
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

    const session = createSampleSession();
    const customPrompt = "You are an expert Cambridge English examiner.";

    await service.chatWithTutor(
      session,
      "valid-key",
      "gemini-flash-latest",
      customPrompt
    );

    const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
    const payload = JSON.parse(callArgs.body);

    expect(payload.systemInstruction).toEqual({
      parts: [{ text: customPrompt }],
    });
    expect(payload.generationConfig).toEqual({
      temperature: 0.3,
      topP: 0.85,
    });
  });

  it("4b. Fallback systemInstruction when systemInstructionText is omitted", async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Tutor response text" }],
            role: "model",
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

    const session = createSampleSession();
    await service.chatWithTutor(session, "valid-key");

    const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
    const payload = JSON.parse(callArgs.body);

    expect(payload.systemInstruction).toBeDefined();
    expect(payload.systemInstruction.parts[0].text).toContain("Technology and Society");
    expect(payload.systemInstruction.parts[0].text).toContain("Mobile Era");
  });

  it("5. Automatic fallback to gemini-flash-lite-latest on HTTP 429", async () => {
    // Attempt 1: 429 Too Many Requests
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 429,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: { error: { code: 429, message: "Resource exhausted" } },
      text: JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }),
    });

    // Attempt 2: 200 OK from fallback model
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: {
        candidates: [
          {
            content: {
              parts: [{ text: "Response from fallback flash-lite" }],
              role: "model",
            },
          },
        ],
      },
      text: "{}",
    });

    const session = createSampleSession();
    const result = await service.chatWithTutor(session, "valid-key");

    expect(result).toBe("Response from fallback flash-lite");
    expect(requestUrl).toHaveBeenCalledTimes(2);

    const call1 = vi.mocked(requestUrl).mock.calls[0][0] as any;
    expect(call1.url).toContain("gemini-flash-latest");

    const call2 = vi.mocked(requestUrl).mock.calls[1][0] as any;
    expect(call2.url).toContain("gemini-flash-lite-latest");

    // Subsequent call should directly use gemini-flash-lite-latest
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: {
        candidates: [
          {
            content: {
              parts: [{ text: "Direct response from flash-lite" }],
            },
          },
        ],
      },
      text: "{}",
    });

    const subsequentResult = await service.chatWithTutor(session, "valid-key");
    expect(subsequentResult).toBe("Direct response from flash-lite");
    expect(requestUrl).toHaveBeenCalledTimes(3);

    const call3 = vi.mocked(requestUrl).mock.calls[2][0] as any;
    expect(call3.url).toContain("gemini-flash-lite-latest");
  });

  it("6. Network error / status 500 returns null gracefully without throwing", async () => {
    // Sub-case A: HTTP 500
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 500,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: { error: { message: "Internal Server Error" } },
      text: "Internal Server Error",
    });

    const session = createSampleSession();
    const res500 = await service.chatWithTutor(session, "valid-key");
    expect(res500).toBeNull();

    // Sub-case B: Network rejection
    vi.mocked(requestUrl).mockRejectedValueOnce(new Error("Network connection dropped"));
    const resNetwork = await service.chatWithTutor(session, "valid-key");
    expect(resNetwork).toBeNull();

    // Sub-case C: Empty candidates
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: { candidates: [] },
      text: JSON.stringify({ candidates: [] }),
    });
    const resEmptyCandidates = await service.chatWithTutor(session, "valid-key");
    expect(resEmptyCandidates).toBeNull();
  });

  it("7. Ensures consecutive messages of the same role conform to Gemini alternating format", async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Combined response" }],
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

    const sessionWithConsecutiveUserMsgs = createSampleSession({
      messages: [
        { id: "1", role: "user", content: "First user part", timestamp: 1 },
        { id: "2", role: "user", content: "Second user part", timestamp: 2 },
        { id: "3", role: "model", content: "Model answer", timestamp: 3 },
      ],
    });

    const result = await service.chatWithTutor(sessionWithConsecutiveUserMsgs, "valid-key");
    expect(result).toBe("Combined response");

    const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
    const payload = JSON.parse(callArgs.body);

    expect(payload.contents).toHaveLength(2);
    expect(payload.contents[0].role).toBe("user");
    expect(payload.contents[0].parts).toEqual([
      { text: "First user part" },
      { text: "Second user part" },
    ]);
    expect(payload.contents[1].role).toBe("model");
    expect(payload.contents[1].parts).toEqual([{ text: "Model answer" }]);
  });
});
