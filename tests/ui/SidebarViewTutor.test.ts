import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkspaceLeaf } from "obsidian";
import { EnglishStudySidebar } from "../../src/ui/SidebarView";
import { AiTutorChatService } from "../../src/services/ai/AiTutorChatService";
import { GeminiService } from "../../src/services/provider/GeminiService";
import { TutorSession } from "../../src/types";

function clickElement(el: any) {
  if (!el) throw new Error("Element is null");
  if (typeof el.click === "function") {
    el.click();
  } else if (typeof el.dispatchEvent === "function") {
    el.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
  }
}

describe("EnglishStudySidebar - AI Tutor Tab & Session Handoff", () => {
  let leaf: WorkspaceLeaf;
  let sidebar: EnglishStudySidebar;
  let chatService: AiTutorChatService;
  let geminiService: GeminiService;
  let session: TutorSession;
  const apiKey = "test-gemini-key";

  beforeEach(() => {
    leaf = new WorkspaceLeaf();
    sidebar = new EnglishStudySidebar(leaf);
    chatService = new AiTutorChatService();
    geminiService = new GeminiService();

    vi.spyOn(geminiService, "chatWithTutor").mockResolvedValue(
      "**Đáp án đúng là A** vì cấu trúc đảo ngữ với *Rarely*."
    );

    session = chatService.createSession({
      query: "ephemeral",
      contextSentence: "The beauty of cherry blossoms is ephemeral.",
      sourceLang: "en",
      targetLang: "vi",
      docContext: {
        noteTitle: "Nature Essay",
        heading: "Spring Bloom",
        tags: ["nature", "botany"],
      },
    });

    sidebar.setTutorDependencies(chatService, geminiService, apiKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. nav bar displays 3 tabs including 'Gia sư AI 💬'", () => {
    sidebar.render();

    const tabButtons = sidebar.contentEl.querySelectorAll(".sidebar-tab-btn");
    expect(tabButtons.length).toBe(3);

    const tutorBtn = sidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    expect(tutorBtn).not.toBeNull();
    expect(tutorBtn.textContent).toContain("Gia sư AI 💬");

    const deepDiveBtn = sidebar.contentEl.querySelector(".tab-btn-deep-dive");
    expect(deepDiveBtn).not.toBeNull();

    const historyBtn = sidebar.contentEl.querySelector(".tab-btn-history");
    expect(historyBtn).not.toBeNull();
  });

  it("2. switching to 'ai-tutor' tab shows empty state when no session is active", () => {
    sidebar.render();

    const tutorBtn = sidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    clickElement(tutorBtn);

    const activeTutorBtn = sidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    expect(activeTutorBtn.classList.contains("active")).toBe(true);

    const emptyState = sidebar.contentEl.querySelector(".sidebar-tutor-empty");
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain("Chưa có phiên học Gia sư AI");
  });

  it("3. calling openTutorSession(session) switches active tab to 'ai-tutor' and renders session messages", () => {
    chatService.addMessage(session.id, "user", "Giải thích giúp tôi từ này.");
    chatService.addMessage(
      session.id,
      "model",
      "**Ephemeral** nghĩa là *chóng tàn*, thường gặp trong văn học miêu tả thiên nhiên."
    );

    sidebar.openTutorSession(session);

    expect(sidebar.getActiveTutorSession()).toBe(session);

    const tutorBtn = sidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    expect(tutorBtn.classList.contains("active")).toBe(true);

    const queryEl = sidebar.contentEl.querySelector(".sidebar-tutor-query");
    expect(queryEl).not.toBeNull();
    expect(queryEl.textContent).toBe("ephemeral");

    const contextEl = sidebar.contentEl.querySelector(".sidebar-tutor-context");
    expect(contextEl).not.toBeNull();
    expect(contextEl.textContent).toContain("The beauty of cherry blossoms is ephemeral.");

    const userMsg = sidebar.contentEl.querySelector(".tutor-message-user");
    expect(userMsg).not.toBeNull();
    expect(userMsg.textContent).toBe("Giải thích giúp tôi từ này.");

    const modelMsg = sidebar.contentEl.querySelector(".tutor-message-model");
    expect(modelMsg).not.toBeNull();
    expect(modelMsg.innerHTML).toContain("<strong>Ephemeral</strong>");
    expect(modelMsg.innerHTML).toContain("<em>chóng tàn</em>");
  });

  it("4. clicking a prompt chip sends message and generates model response", async () => {
    sidebar.openTutorSession(session);

    const chipBtn = sidebar.contentEl.querySelector(".sidebar-tutor-chip");
    expect(chipBtn).not.toBeNull();

    clickElement(chipBtn);

    // Allow promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(geminiService.chatWithTutor).toHaveBeenCalledTimes(1);

    const messages = sidebar.contentEl.querySelectorAll(".tutor-message-user");
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const modelBubbles = sidebar.contentEl.querySelectorAll(".tutor-message-model");
    expect(modelBubbles.length).toBeGreaterThanOrEqual(1);
    expect(modelBubbles[0].innerHTML).toContain("<strong>Đáp án đúng là A</strong>");

    // Check chat service history updated
    const sessionHistory = chatService.getSession(session.id);
    expect(sessionHistory?.messages.length).toBe(2);
    expect(sessionHistory?.messages[0].role).toBe("user");
    expect(sessionHistory?.messages[1].role).toBe("model");
  });

  it("5. typing in textarea and submitting sends message and updates history", async () => {
    sidebar.openTutorSession(session);

    const textarea = sidebar.contentEl.querySelector(".sidebar-tutor-textarea");
    const sendBtn = sidebar.contentEl.querySelector(".sidebar-tutor-send-btn");
    expect(textarea).not.toBeNull();
    expect(sendBtn).not.toBeNull();

    textarea.value = "Từ này có đồng nghĩa với transient không?";
    clickElement(sendBtn);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(geminiService.chatWithTutor).toHaveBeenCalledTimes(1);

    const sessionHistory = chatService.getSession(session.id);
    expect(sessionHistory?.messages.length).toBe(2);
    expect(sessionHistory?.messages[0].content).toBe(
      "Từ này có đồng nghĩa với transient không?"
    );
    expect(textarea.value).toBe("");

    // Test sending via Enter key
    textarea.value = "Cho thêm một ví dụ nữa.";
    textarea.dispatchEvent({
      type: "keydown",
      key: "Enter",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(geminiService.chatWithTutor).toHaveBeenCalledTimes(2);
    expect(sessionHistory?.messages.length).toBe(4);
  });

  it("6. clear chat button resets messages", () => {
    chatService.addMessage(session.id, "user", "Tin nhắn trước đó");
    chatService.addMessage(session.id, "model", "Câu trả lời trước đó");

    sidebar.openTutorSession(session);

    let userMsg = sidebar.contentEl.querySelector(".tutor-message-user");
    expect(userMsg).not.toBeNull();

    const clearBtn = sidebar.contentEl.querySelector(".sidebar-tutor-clear-btn");
    expect(clearBtn).not.toBeNull();

    clickElement(clearBtn);

    const emptyUserMsg = sidebar.contentEl.querySelector(".tutor-message-user");
    expect(emptyUserMsg).toBeNull();

    const sessionHistory = chatService.getSession(session.id);
    expect(sessionHistory?.messages.length).toBe(0);
  });

  it("7. automatically synchronizes active tutor session when setResult is called or query was already looked up", () => {
    // Simulate user looking up a word in popover and chatting with AI
    const result = {
      query: "ubiquitous",
      type: "word" as const,
      contextSentence: "Smartphones are ubiquitous in modern life.",
      contextSentenceClean: "Smartphones are ubiquitous in modern life.",
      vietnameseTranslation: "phổ biến, có mặt khắp nơi",
      timestamp: Date.now(),
    };

    // User chats in popover (which uses getOrCreateSession)
    const popoverSession = chatService.getOrCreateSession({
      query: result.query,
      contextSentence: result.contextSentence,
    });
    chatService.addMessage(popoverSession.id, "user", "Tại sao lại dùng từ này?");
    chatService.addMessage(popoverSession.id, "model", "Vì nó mang sắc thái phổ biến ở khắp mọi nơi.");

    // Sidebar receives setResult
    sidebar.setResult(result);

    // User now switches to 'ai-tutor' tab in the sidebar
    const tutorBtn = sidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    clickElement(tutorBtn);

    // Sidebar should NOT show empty state; it should show the conversation from popover!
    const emptyState = sidebar.contentEl.querySelector(".sidebar-tutor-empty");
    expect(emptyState).toBeNull();

    const queryEl = sidebar.contentEl.querySelector(".sidebar-tutor-query");
    expect(queryEl?.textContent).toBe("ubiquitous");

    const messages = sidebar.contentEl.querySelectorAll(".tutor-message-user, .tutor-message-model");
    expect(messages.length).toBe(2);
    expect(messages[0].textContent).toContain("Tại sao lại dùng từ này?");
  });

  it("8. automatically falls back to latest active session when switching to 'ai-tutor' tab even if currentResult was not set", () => {
    // New sidebar without currentResult
    const newSidebar = new EnglishStudySidebar(leaf);
    newSidebar.setTutorDependencies(chatService, geminiService, apiKey);
    newSidebar.render();

    // Latest session exists in chatService (session 'ephemeral')
    chatService.addMessage(session.id, "user", "Giải thích giúp tôi");

    // Click 'ai-tutor' tab
    const tutorBtn = newSidebar.contentEl.querySelector(".tab-btn-ai-tutor");
    clickElement(tutorBtn);

    const emptyState = newSidebar.contentEl.querySelector(".sidebar-tutor-empty");
    expect(emptyState).toBeNull();

    const queryEl = newSidebar.contentEl.querySelector(".sidebar-tutor-query");
    expect(queryEl?.textContent).toBe("ephemeral");
  });
});
