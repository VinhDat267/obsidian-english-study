import { describe, it, expect, beforeEach } from "vitest";
import { AiTutorChatService } from "../../src/services/ai/AiTutorChatService";
import type { TutorSession, DocumentContextMeta } from "../../src/types";

describe("AiTutorChatService", () => {
  let service: AiTutorChatService;

  beforeEach(() => {
    service = new AiTutorChatService();
  });

  describe("Session Lifecycle (create, get, clear, delete)", () => {
    it("should create a new session with unique ID, initialized messages and timestamps", () => {
      const session = service.createSession({
        query: "perseverance",
        contextSentence: "Through perseverance and hard work, she achieved her goals.",
        sourceLang: "en",
        targetLang: "vi",
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^tutor_\d+_[a-z0-9]+$/i);
      expect(session.query).toBe("perseverance");
      expect(session.contextSentence).toBe("Through perseverance and hard work, she achieved her goals.");
      expect(session.sourceLang).toBe("en");
      expect(session.targetLang).toBe("vi");
      expect(session.messages).toEqual([]);
      expect(typeof session.createdAt).toBe("number");
      expect(typeof session.updatedAt).toBe("number");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.updatedAt).toBe(session.createdAt);
    });

    it("should create session with docContext if provided", () => {
      const docContext: DocumentContextMeta = {
        noteTitle: "IELTS Reading 2026",
        heading: "Section 3: Academic Reading",
        tags: ["#ielts", "#reading"],
      };

      const session = service.createSession({
        query: "mitigate",
        contextSentence: "Measures to mitigate global warming are urgently needed.",
        docContext,
      });

      expect(session.docContext).toEqual(docContext);
    });

    it("should retrieve an existing session by ID or return null if not found", () => {
      const session = service.createSession({
        query: "ubiquitous",
        contextSentence: "Smartphones have become ubiquitous in modern society.",
      });

      const retrieved = service.getSession(session.id);
      expect(retrieved).toBe(session);

      const nonExistent = service.getSession("non-existent-id");
      expect(nonExistent).toBeNull();
    });

    it("should clear session messages and update updatedAt timestamp", () => {
      const session = service.createSession({
        query: "lucid",
        contextSentence: "She gave a lucid explanation of the concept.",
      });

      service.addMessage(session.id, "user", "Giải thích nghĩa của từ này");
      service.addMessage(session.id, "model", "Từ này có nghĩa là rõ ràng, dễ hiểu.");
      expect(session.messages.length).toBe(2);

      const clearResult = service.clearSession(session.id);
      expect(clearResult).toBe(true);

      const retrieved = service.getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages).toEqual([]);
      expect(retrieved?.updatedAt).toBeGreaterThanOrEqual(session.createdAt);

      const invalidClear = service.clearSession("unknown-id");
      expect(invalidClear).toBe(false);
    });

    it("should delete session completely from cache", () => {
      const session = service.createSession({
        query: "ephemeral",
        contextSentence: "Beauty is ephemeral.",
      });

      const deleted = service.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(service.getSession(session.id)).toBeNull();

      expect(service.deleteSession("unknown-id")).toBe(false);
    });
  });

  describe("addMessage & getRecentMessages", () => {
    it("should add messages to a session with unique ID and role", () => {
      const session = service.createSession({
        query: "candid",
        contextSentence: "He was candid about his mistakes.",
      });

      const userMsg = service.addMessage(session.id, "user", "Candid đi với giới từ gì?");
      expect(userMsg).not.toBeNull();
      expect(userMsg?.id).toMatch(/^msg_\d+_[a-z0-9]+$/i);
      expect(userMsg?.role).toBe("user");
      expect(userMsg?.content).toBe("Candid đi với giới từ gì?");
      expect(typeof userMsg?.timestamp).toBe("number");

      const modelMsg = service.addMessage(
        session.id,
        "model",
        "Candid thường đi với giới từ 'about' hoặc 'with': candid about something, candid with someone."
      );
      expect(modelMsg).not.toBeNull();
      expect(modelMsg?.role).toBe("model");
      expect(modelMsg?.content).toContain("candid about something");

      expect(session.messages.length).toBe(2);
      expect(session.messages[0]).toBe(userMsg);
      expect(session.messages[1]).toBe(modelMsg);
      expect(session.updatedAt).toBeGreaterThanOrEqual(userMsg!.timestamp);
    });

    it("should return null when adding a message to a non-existent session", () => {
      const result = service.addMessage("unknown-id", "user", "Hello?");
      expect(result).toBeNull();
    });

    it("should retrieve recent messages up to limit in chronological order", () => {
      const session = service.createSession({
        query: "test",
        contextSentence: "This is a test sentence.",
      });

      for (let i = 1; i <= 15; i++) {
        service.addMessage(session.id, i % 2 === 1 ? "user" : "model", `Message ${i}`);
      }

      // Default limit is 10
      const defaultRecent = service.getRecentMessages(session.id);
      expect(defaultRecent.length).toBe(10);
      expect(defaultRecent[0].content).toBe("Message 6");
      expect(defaultRecent[9].content).toBe("Message 15");

      // Custom limit
      const customRecent = service.getRecentMessages(session.id, 5);
      expect(customRecent.length).toBe(5);
      expect(customRecent[0].content).toBe("Message 11");
      expect(customRecent[4].content).toBe("Message 15");

      // Requesting more messages than total returns all
      const allRecent = service.getRecentMessages(session.id, 20);
      expect(allRecent.length).toBe(15);
      expect(allRecent[0].content).toBe("Message 1");

      // Non-existent session returns empty array
      expect(service.getRecentMessages("unknown-id")).toEqual([]);
    });

    it("should return a clone so caller mutations do not alter session messages", () => {
      const session = service.createSession({
        query: "test",
        contextSentence: "Sample sentence.",
      });
      service.addMessage(session.id, "user", "Original message");

      const recent = service.getRecentMessages(session.id);
      recent.pop();

      expect(session.messages.length).toBe(1);
    });
  });

  describe("QuickPromptChips", () => {
    it("should provide exactly 4 standardized prompt chips", () => {
      const chips = service.getQuickPromptChips();
      expect(chips.length).toBe(4);

      const [mcq, synonym, grammar, collocations] = chips;

      // 1. MCQ Analysis
      expect(mcq.id).toBe("mcq-analysis");
      expect(mcq.icon).toBe("help-circle");
      expect(mcq.label).toBe("Giải thích câu trắc nghiệm MCQ");

      // 2. Synonym & Nuance
      expect(synonym.id).toBe("synonym-nuance");
      expect(synonym.icon).toBe("split");
      expect(synonym.label).toBe("Phân biệt từ đồng nghĩa & sắc thái");

      // 3. Deep Grammar
      expect(grammar.id).toBe("deep-grammar");
      expect(grammar.icon).toBe("code");
      expect(grammar.label).toBe("Phân tích ngữ pháp sâu");

      // 4. Collocations & Examples
      expect(collocations.id).toBe("collocations-examples");
      expect(collocations.icon).toBe("pencil");
      expect(collocations.label).toBe("Collocations & 3 câu ví dụ");
    });

    it("should generate structured prompts via promptTemplate", () => {
      const [mcq, synonym, grammar, collocations] = service.getQuickPromptChips();

      const query = "exacerbate";
      const sentence = "The pollution will exacerbate existing respiratory problems.";

      // MCQ Prompt
      const mcqPrompt = mcq.promptTemplate(query, sentence);
      expect(mcqPrompt).toContain("phân tích chi tiết câu hỏi trắc nghiệm");
      expect(mcqPrompt).toContain("đáp án đúng");
      expect(mcqPrompt).toContain("bẫy");
      expect(mcqPrompt).toContain(query);

      // Synonym Prompt
      const synonymPrompt = synonym.promptTemplate(query, sentence);
      expect(synonymPrompt).toContain("phân biệt");
      expect(synonymPrompt).toContain("đồng nghĩa");
      expect(synonymPrompt).toContain("sắc thái");
      expect(synonymPrompt).toContain(query);

      // Deep Grammar Prompt
      const grammarPrompt = grammar.promptTemplate(query, sentence);
      expect(grammarPrompt).toContain("ngữ pháp");
      expect(grammarPrompt).toContain("mệnh đề");
      expect(grammarPrompt).toContain(sentence);

      // Collocations Prompt
      const collocationsPrompt = collocations.promptTemplate(query, sentence);
      expect(collocationsPrompt).toContain("collocations");
      expect(collocationsPrompt).toContain("3 câu ví dụ");
      expect(collocationsPrompt).toContain(query);
    });
  });

  describe("buildSystemInstruction", () => {
    it("should build comprehensive instruction with persona, document context, target text, and guidelines", () => {
      const session: TutorSession = {
        id: "tutor-spec",
        query: "paradigm shift",
        contextSentence: "The discovery caused a profound paradigm shift in modern physics.",
        sourceLang: "en",
        targetLang: "vi",
        docContext: {
          noteTitle: "Physics Innovations 2026",
          heading: "Chapter 4: Quantum Mechanics",
          tags: ["#physics", "#quantum", "#science"],
        },
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const instruction = service.buildSystemInstruction(session);

      // Persona
      expect(instruction).toContain("Polyglot AI Tutor");
      expect(instruction).toContain("gia sư học thuật");

      // Document Context
      expect(instruction).toContain("Physics Innovations 2026");
      expect(instruction).toContain("Chapter 4: Quantum Mechanics");
      expect(instruction).toContain("#physics, #quantum, #science");

      // Query & Context Sentence
      expect(instruction).toContain("paradigm shift");
      expect(instruction).toContain("The discovery caused a profound paradigm shift in modern physics.");

      // Output guidelines & language
      expect(instruction).toContain("Tiếng Việt");
      expect(instruction).toContain("Markdown");
      expect(instruction).toContain("trắc nghiệm");
    });

    it("should handle session without docContext gracefully using defaults", () => {
      const session: TutorSession = {
        id: "tutor-minimal",
        query: "reluctant",
        contextSentence: "He was reluctant to commit to the project.",
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const instruction = service.buildSystemInstruction(session);

      expect(instruction).toContain("Polyglot AI Tutor");
      expect(instruction).toContain("reluctant");
      expect(instruction).toContain("He was reluctant to commit to the project.");
      expect(instruction).toContain("Không xác định");
      expect(instruction).toContain("Tiếng Việt");
    });

    it("should adapt target language in instruction when targetLang is specified", () => {
      const session: TutorSession = {
        id: "tutor-lang",
        query: "bonjour",
        contextSentence: "Bonjour à tous!",
        targetLang: "en",
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const instruction = service.buildSystemInstruction(session);
      expect(instruction).toContain("Tiếng Anh");
    });
  });

  describe("Session Synchronization (getOrCreateSession, getLatestSession, getSessionForQuery)", () => {
    it("should retrieve existing session if query matches case-insensitively, preserving messages", () => {
      const session1 = service.getOrCreateSession({
        query: "Photosynthesis",
        contextSentence: "Plants use photosynthesis to make food.",
      });

      service.addMessage(session1.id, "user", "Giải thích cơ chế?");
      service.addMessage(session1.id, "model", "Quang hợp gồm pha sáng và pha tối.");

      const session2 = service.getOrCreateSession({
        query: "photosynthesis",
        contextSentence: "Plants use photosynthesis to make food.",
      });

      expect(session2.id).toBe(session1.id);
      expect(session2.messages.length).toBe(2);
      expect(session2.messages[0].content).toBe("Giải thích cơ chế?");
    });

    it("should create new session if query is different", () => {
      const session1 = service.getOrCreateSession({
        query: "mitochondria",
        contextSentence: "Powerhouse of the cell.",
      });

      const session2 = service.getOrCreateSession({
        query: "ribosome",
        contextSentence: "Protein factory of the cell.",
      });

      expect(session1.id).not.toBe(session2.id);
      expect(service.getLatestSession()?.id).toBe(session2.id);
    });

    it("should return the latest active session via getLatestSession()", () => {
      expect(service.getLatestSession()).toBeNull();

      const sessionA = service.createSession({ query: "wordA", contextSentence: "Sentence A" });
      expect(service.getLatestSession()?.id).toBe(sessionA.id);

      const sessionB = service.createSession({ query: "wordB", contextSentence: "Sentence B" });
      expect(service.getLatestSession()?.id).toBe(sessionB.id);
    });

    it("should lookup session by query via getSessionForQuery()", () => {
      service.createSession({ query: "Epiphany", contextSentence: "He had an epiphany." });

      const found = service.getSessionForQuery("epiphany");
      expect(found).not.toBeNull();
      expect(found?.query).toBe("Epiphany");

      expect(service.getSessionForQuery("unknown")).toBeNull();
    });
  });
});
