import {
  TutorChatMessage,
  TutorSession,
  QuickPromptChip,
  DocumentContextMeta,
} from "../../types";
import { getLanguageMeta } from "../../utils/languageHelper";

export class AiTutorChatService {
  private sessions: Map<string, TutorSession> = new Map();

  /**
   * Creates and registers a new multi-turn tutor session.
   */
  createSession(params: {
    query: string;
    contextSentence: string;
    docContext?: DocumentContextMeta;
    sourceLang?: string;
    targetLang?: string;
    id?: string;
  }): TutorSession {
    const id =
      params.id ||
      `tutor_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const session: TutorSession = {
      id,
      query: params.query,
      contextSentence: params.contextSentence,
      docContext: params.docContext,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Retrieves an active session by its ID.
   */
  getSession(sessionId: string): TutorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Appends a user or model message to the session history.
   */
  addMessage(
    sessionId: string,
    role: "user" | "model",
    content: string
  ): TutorChatMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    const message: TutorChatMessage = {
      id: `msg_${now}_${Math.random().toString(36).substring(2, 7)}`,
      role,
      content,
      timestamp: now,
    };

    session.messages.push(message);
    session.updatedAt = now;
    return message;
  }

  /**
   * Clears the messages in a session while maintaining its metadata.
   */
  clearSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.messages = [];
    session.updatedAt = Date.now();
    return true;
  }

  /**
   * Deletes a session completely from the internal store.
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clears all sessions from the internal store.
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Retrieves up to `limit` recent messages for context window management.
   */
  getRecentMessages(sessionId: string, limit: number = 10): TutorChatMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    if (limit <= 0) return [];

    if (session.messages.length <= limit) {
      return [...session.messages];
    }
    return session.messages.slice(-limit);
  }

  /**
   * Returns standard quick prompt chips for common language learning actions.
   */
  getQuickPromptChips(): QuickPromptChip[] {
    return [
      {
        id: "mcq-analysis",
        icon: "help-circle",
        label: "Giải thích câu trắc nghiệm MCQ",
        promptTemplate: (query: string, contextSentence: string) => {
          const context = contextSentence || query;
          return `Hãy phân tích chi tiết câu hỏi trắc nghiệm sau: "${context}". Từ/Lựa chọn: "${query}". 1) Giải thích vì sao đáp án đúng là chính xác. 2) Chỉ ra các bẫy ngữ pháp/từ vựng và lý do vì sao các đáp án còn lại bị loại trừ.`;
        },
      },
      {
        id: "synonym-nuance",
        icon: "split",
        label: "Phân biệt từ đồng nghĩa & sắc thái",
        promptTemplate: (query: string, _contextSentence: string) => {
          return `Hãy phân biệt "${query}" với các từ/cụm từ đồng nghĩa phổ biến trong cùng lĩnh vực, chỉ ra sắc thái ngữ cảnh (formal/informal/technical) và cho ví dụ so sánh.`;
        },
      },
      {
        id: "deep-grammar",
        icon: "code",
        label: "Phân tích ngữ pháp sâu",
        promptTemplate: (query: string, contextSentence: string) => {
          const target = contextSentence || query;
          return `Hãy bóc tách cấu trúc ngữ pháp chuyên sâu của câu "${target}", làm rõ các mệnh đề, liên từ, biến thể tương đương và lưu ý khi sử dụng.`;
        },
      },
      {
        id: "collocations-examples",
        icon: "pencil",
        label: "Collocations & 3 câu ví dụ",
        promptTemplate: (query: string, _contextSentence: string) => {
          return `Hãy liệt kê các collocations/cụm từ cố định thường gặp nhất với "${query}" và đặt 3 câu ví dụ thực tế trong đời sống/học thuật kèm dịch nghĩa.`;
        },
      },
    ];
  }

  /**
   * Formats a system instruction prompt incorporating the tutor persona,
   * document metadata, reading context, and targeted output rules.
   */
  buildSystemInstruction(session: TutorSession): string {
    const doc = session.docContext;
    const noteTitle = doc?.noteTitle || "Không xác định";
    const heading = doc?.heading || "Không xác định";
    const tags =
      doc?.tags && doc.tags.length > 0 ? doc.tags.join(", ") : "Chung";
    const contextSentence = session.contextSentence || "Không có";
    const query = session.query || "Không có";

    const targetLangName = session.targetLang
      ? getLanguageMeta(session.targetLang).nameVi || session.targetLang
      : "Tiếng Việt";

    return `Bạn là "Polyglot AI Tutor" - một gia sư học thuật và chuyên gia khảo thí ngôn ngữ xuất sắc.
Nhiệm vụ của bạn là hỗ trợ người học phân tích sâu về từ vựng, ngữ pháp, bài đọc và đặc biệt là các câu hỏi trắc nghiệm (MCQ).

Ngữ cảnh hiện tại của bài đọc:
- Tiêu đề ghi chú/bài viết: "${noteTitle}"
- Đề mục/Chương: "${heading}"
- Thẻ lĩnh vực/Tags: "${tags}"
- Đoạn văn/Câu ngữ cảnh: "${contextSentence}"
- Từ/Cụm từ trọng tâm: "${query}"

Quy tắc ứng xử & phản hồi:
1. Trả lời bằng ngôn ngữ đích (${targetLangName}), định dạng chuẩn Markdown (sử dụng in đậm, danh sách gạch đầu dòng, khối code hoặc bảng khi cần thiết).
2. Khi giải thích câu trắc nghiệm: luôn giải thích cặn kẽ tại sao đáp án đúng được chọn và vạch trần bẫy của các phương án sai.
3. Câu trả lời súc tích, đi thẳng vào trọng tâm học thuật, không rườm rà khách sáo.`;
  }
}
