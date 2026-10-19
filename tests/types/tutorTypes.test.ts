import { describe, it, expect, vi } from "vitest";
import {
  isTutorChatMessage,
  isTutorSession,
  type TutorChatMessage,
  type TutorSession,
  type QuickPromptChip,
  type PopoverCallbacks as TypesPopoverCallbacks,
  type DocumentContextMeta,
} from "../../src/types";
import type { PopoverCallbacks as UiPopoverCallbacks } from "../../src/ui/FloatingPopover";

describe("Tutor Types & Interfaces", () => {
  describe("TutorChatMessage", () => {
    it("should allow creating valid user and model chat messages", () => {
      const userMsg: TutorChatMessage = {
        id: "msg-1",
        role: "user",
        content: "Tại sao câu này chọn đáp án B?",
        timestamp: 1729350000000,
      };

      const modelMsg: TutorChatMessage = {
        id: "msg-2",
        role: "model",
        content: "Vì mệnh đề quan hệ cần đại từ quan hệ thay thế cho tân ngữ chỉ vật...",
        timestamp: 1729350005000,
      };

      expect(userMsg.role).toBe("user");
      expect(userMsg.content).toContain("đáp án B");
      expect(modelMsg.role).toBe("model");
      expect(modelMsg.timestamp).toBeGreaterThan(userMsg.timestamp);

      expect(isTutorChatMessage(userMsg)).toBe(true);
      expect(isTutorChatMessage(modelMsg)).toBe(true);
      expect(isTutorChatMessage({ role: "invalid" })).toBe(false);
      expect(isTutorChatMessage(null)).toBe(false);
    });
  });

  describe("TutorSession", () => {
    it("should allow creating a minimal valid session", () => {
      const session: TutorSession = {
        id: "session-1",
        query: "sophisticated",
        contextSentence: "She has sophisticated tastes in literature.",
        messages: [],
        createdAt: 1729350000000,
        updatedAt: 1729350000000,
      };

      expect(session.id).toBe("session-1");
      expect(session.query).toBe("sophisticated");
      expect(session.contextSentence).toBe("She has sophisticated tastes in literature.");
      expect(session.messages).toEqual([]);
      expect(session.sourceLang).toBeUndefined();
      expect(session.targetLang).toBeUndefined();
      expect(session.docContext).toBeUndefined();

      expect(isTutorSession(session)).toBe(true);
      expect(isTutorSession({ id: "1" })).toBe(false);
      expect(isTutorSession(null)).toBe(false);
    });

    it("should support a comprehensive session with multilingual and document context", () => {
      const docContext: DocumentContextMeta = {
        noteTitle: "IELTS Reading Passage 1",
        fileTitle: "IELTS Reading Passage 1.md",
        folderPath: "Study/IELTS",
        heading: "Paragraph B",
        tags: ["#ielts", "#reading"],
      };

      const messages: TutorChatMessage[] = [
        {
          id: "m1",
          role: "user",
          content: "Giải thích ngữ cảnh của từ này trong đoạn văn",
          timestamp: 1729350001000,
        },
        {
          id: "m2",
          role: "model",
          content: "Trong đoạn văn, từ này mang nghĩa...",
          timestamp: 1729350006000,
        },
      ];

      const session: TutorSession = {
        id: "session-2",
        query: "pragmatic",
        contextSentence: "A pragmatic approach to solving the energy crisis is essential.",
        sourceLang: "en",
        targetLang: "vi",
        docContext,
        messages,
        createdAt: 1729350000000,
        updatedAt: 1729350006000,
      };

      expect(session.sourceLang).toBe("en");
      expect(session.targetLang).toBe("vi");
      expect(session.docContext?.noteTitle).toBe("IELTS Reading Passage 1");
      expect(session.docContext?.tags).toContain("#ielts");
      expect(session.messages.length).toBe(2);
      expect(session.messages[1].role).toBe("model");
    });
  });

  describe("QuickPromptChip", () => {
    it("should format prompts accurately via promptTemplate", () => {
      const mcqChip: QuickPromptChip = {
        id: "explain-mcq",
        icon: "help-circle",
        label: "Giải thích câu trắc nghiệm",
        promptTemplate: (query, contextSentence) =>
          `Giải thích câu hỏi trắc nghiệm sau:\nTừ/câu hỏi: "${query}"\nNgữ cảnh: "${contextSentence}"\nChỉ rõ tại sao đáp án đúng được chọn và phân tích bẫy ở các phương án khác.`,
      };

      const formatted = mcqChip.promptTemplate(
        "Which of the following best describes...",
        "Paragraph 2 discusses economic ramifications..."
      );

      expect(mcqChip.id).toBe("explain-mcq");
      expect(mcqChip.icon).toBe("help-circle");
      expect(formatted).toContain('Từ/câu hỏi: "Which of the following best describes..."');
      expect(formatted).toContain("phân tích bẫy");
    });
  });

  describe("PopoverCallbacks extension", () => {
    it("should allow onPinToSidebarChat callback with TutorSession across types and UI definitions", () => {
      const mockSession: TutorSession = {
        id: "session-test",
        query: "ephemeral",
        contextSentence: "Fashions are ephemeral, changing with every season.",
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      let capturedTypesSession: TutorSession | null = null;
      const typesCallbacks: TypesPopoverCallbacks = {
        onSave: vi.fn(),
        onPinToSidebarChat: (session) => {
          capturedTypesSession = session;
        },
      };

      let capturedUiSession: TutorSession | null = null;
      const uiCallbacks: UiPopoverCallbacks = {
        onSave: vi.fn(),
        onPinToSidebarChat: (session) => {
          capturedUiSession = session;
        },
      };

      typesCallbacks.onPinToSidebarChat?.(mockSession);
      uiCallbacks.onPinToSidebarChat?.(mockSession);

      expect(capturedTypesSession).toBe(mockSession);
      expect(capturedUiSession).toBe(mockSession);
    });
  });
});
