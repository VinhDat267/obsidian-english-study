// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PopoverChatDrawer, PopoverChatDrawerCallbacks } from "../../src/ui/PopoverChatDrawer";
import { AiTutorChatService } from "../../src/services/ai/AiTutorChatService";
import { GeminiService } from "../../src/services/provider/GeminiService";
import { TutorSession } from "../../src/types";

describe("PopoverChatDrawer", () => {
  let chatService: AiTutorChatService;
  let geminiService: GeminiService;
  let callbacks: PopoverChatDrawerCallbacks;
  let drawer: PopoverChatDrawer;
  let session: TutorSession;
  const apiKey = "test-gemini-api-key";

  beforeEach(() => {
    chatService = new AiTutorChatService();
    geminiService = new GeminiService();
    // Stub chatWithTutor
    vi.spyOn(geminiService, "chatWithTutor").mockResolvedValue(
      "**Đáp án A đúng** vì cấu trúc đảo ngữ với *Rarely*."
    );

    callbacks = {
      onResize: vi.fn(),
      onPinToSidebar: vi.fn(),
    };

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

    drawer = new PopoverChatDrawer(chatService, geminiService, apiKey, callbacks);
    drawer.setSession(session);
  });

  afterEach(() => {
    drawer.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("1. initial render is collapsed with toggle button", () => {
    const el = drawer.render();
    document.body.appendChild(el);

    expect(el.classList.contains("popover-chat-drawer")).toBe(true);

    const toggleBtn = el.querySelector(".drawer-toggle-btn") as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.textContent).toContain("Hỏi sâu Gia sư AI");

    expect(drawer.isExpanded()).toBe(false);

    const drawerBody = el.querySelector(".drawer-body") as HTMLElement;
    expect(drawerBody).not.toBeNull();
    expect(drawerBody.classList.contains("expanded")).toBe(false);
    expect(drawerBody.style.display).toBe("none");
  });

  it("2. clicking toggle expands drawer and invokes onResize", () => {
    const el = drawer.render();
    document.body.appendChild(el);

    const toggleBtn = el.querySelector(".drawer-toggle-btn") as HTMLButtonElement;
    const drawerBody = el.querySelector(".drawer-body") as HTMLElement;

    // Toggle expand
    toggleBtn.click();

    expect(drawer.isExpanded()).toBe(true);
    expect(drawerBody.classList.contains("expanded")).toBe(true);
    expect(drawerBody.style.display).toBe("block");
    expect(callbacks.onResize).toHaveBeenCalledTimes(1);

    // Toggle collapse
    toggleBtn.click();

    expect(drawer.isExpanded()).toBe(false);
    expect(drawerBody.classList.contains("expanded")).toBe(false);
    expect(drawerBody.style.display).toBe("none");
    expect(callbacks.onResize).toHaveBeenCalledTimes(2);

    // Programmatic toggle(true) and toggle(false)
    drawer.toggle(true);
    expect(drawer.isExpanded()).toBe(true);
    expect(callbacks.onResize).toHaveBeenCalledTimes(3);

    drawer.toggle(false);
    expect(drawer.isExpanded()).toBe(false);
    expect(callbacks.onResize).toHaveBeenCalledTimes(4);
  });

  it("3. renders 4 prompt chips; clicking a chip dispatches user message and calls chatWithTutor", async () => {
    const el = drawer.render();
    document.body.appendChild(el);
    drawer.toggle(true);

    const chipsContainer = el.querySelector(".drawer-quick-chips") as HTMLElement;
    expect(chipsContainer).not.toBeNull();

    const chips = chipsContainer.querySelectorAll("button");
    expect(chips.length).toBe(4);

    // First chip is MCQ analysis
    const firstChip = chips[0] as HTMLButtonElement;
    expect(firstChip.textContent).toContain("Giải thích câu trắc nghiệm MCQ");

    firstChip.click();

    // Verify chatWithTutor called
    expect(geminiService.chatWithTutor).toHaveBeenCalledWith(
      session,
      apiKey,
      "gemini-flash-latest",
      expect.stringContaining("Polyglot AI Tutor")
    );

    // Allow async execution to resolve
    await vi.waitFor(() => {
      const messages = el.querySelectorAll(".drawer-messages-list > div");
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    const userMsg = el.querySelector(".tutor-message-user") as HTMLElement;
    expect(userMsg).not.toBeNull();
    expect(userMsg.textContent).toContain("Hãy phân tích chi tiết câu hỏi trắc nghiệm");

    const modelMsg = el.querySelector(".tutor-message-model") as HTMLElement;
    expect(modelMsg).not.toBeNull();
    // Rendered markdown should format **Đáp án A đúng** as bold
    expect(modelMsg.innerHTML).toContain("<strong>Đáp án A đúng</strong>");
  });

  it("4. typing in textarea and pressing Enter submits message", async () => {
    const el = drawer.render();
    document.body.appendChild(el);
    drawer.toggle(true);

    const textarea = el.querySelector(".drawer-input-textarea") as HTMLTextAreaElement;
    const sendBtn = el.querySelector(".drawer-send-btn") as HTMLButtonElement;

    expect(textarea).not.toBeNull();
    expect(sendBtn).not.toBeNull();
    expect(textarea.placeholder).toContain("Hỏi thêm gia sư AI... (Enter để gửi)");

    // Shift+Enter does not submit
    textarea.value = "New line question";
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })
    );
    expect(geminiService.chatWithTutor).not.toHaveBeenCalled();
    expect(textarea.value).toBe("New line question");

    // Regular Enter submits
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, bubbles: true })
    );

    expect(geminiService.chatWithTutor).toHaveBeenCalled();
    expect(textarea.value).toBe("");

    await vi.waitFor(() => {
      const userMsg = el.querySelector(".tutor-message-user") as HTMLElement;
      expect(userMsg).not.toBeNull();
      expect(userMsg.textContent).toBe("New line question");
    });
  });

  it("5. displays loading state while request is in flight and handles errors", async () => {
    let resolvePromise: (val: string | null) => void;
    const pendingPromise = new Promise<string | null>((res) => {
      resolvePromise = res;
    });

    vi.spyOn(geminiService, "chatWithTutor").mockReturnValue(pendingPromise);

    const el = drawer.render();
    document.body.appendChild(el);
    drawer.toggle(true);

    const textarea = el.querySelector(".drawer-input-textarea") as HTMLTextAreaElement;
    const sendBtn = el.querySelector(".drawer-send-btn") as HTMLButtonElement;

    textarea.value = "Câu hỏi cần suy nghĩ lâu";
    sendBtn.click();

    // In flight
    const loadingEl = el.querySelector(".tutor-message-loading");
    expect(loadingEl).not.toBeNull();
    expect(textarea.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);

    // Resolve with failure / null
    resolvePromise!(null);

    await vi.waitFor(() => {
      expect(el.querySelector(".tutor-message-loading")).toBeNull();
      expect(textarea.disabled).toBe(false);
      expect(sendBtn.disabled).toBe(false);
    });

    const errorBubble = el.querySelector(".tutor-message-error, .tutor-message-model") as HTMLElement;
    expect(errorBubble).not.toBeNull();
    expect(errorBubble.textContent).toContain("Không thể kết nối đến Gemini AI");
  });

  it("6. pin button calls onPinToSidebar callback with current session", () => {
    const el = drawer.render();
    document.body.appendChild(el);
    drawer.toggle(true);

    const pinBtn = el.querySelector(".btn-pin-sidebar") as HTMLButtonElement;
    expect(pinBtn).not.toBeNull();

    pinBtn.click();
    expect(callbacks.onPinToSidebar).toHaveBeenCalledWith(session);
  });

  it("7. clear button resets messages and calls clearSession", async () => {
    chatService.addMessage(session.id, "user", "Tin nhắn trước đó");
    chatService.addMessage(session.id, "model", "Câu trả lời trước đó");

    const el = drawer.render();
    document.body.appendChild(el);
    drawer.toggle(true);

    expect(el.querySelectorAll(".tutor-message-user, .tutor-message-model").length).toBe(2);

    const clearBtn = el.querySelector(".btn-clear-chat") as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();

    clearBtn.click();

    expect(session.messages.length).toBe(0);
    expect(el.querySelectorAll(".tutor-message-user, .tutor-message-model").length).toBe(0);
    expect(callbacks.onResize).toHaveBeenCalled();
  });

  it("8. setSession updates session and renders existing messages", () => {
    const el = drawer.render();
    document.body.appendChild(el);

    const newSession = chatService.createSession({
      query: "serendipity",
      contextSentence: "A lucky accident.",
    });
    chatService.addMessage(newSession.id, "user", "Giải thích serendipity");
    chatService.addMessage(newSession.id, "model", "**Sự may mắn bất ngờ**");

    drawer.setSession(newSession);

    const userMsgs = el.querySelectorAll(".tutor-message-user");
    const modelMsgs = el.querySelectorAll(".tutor-message-model");

    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0].textContent).toBe("Giải thích serendipity");
    expect(modelMsgs.length).toBe(1);
    expect(modelMsgs[0].innerHTML).toContain("<strong>Sự may mắn bất ngờ</strong>");
  });

  it("9. destroy removes DOM elements cleanly", () => {
    const el = drawer.render();
    document.body.appendChild(el);

    expect(document.body.contains(el)).toBe(true);
    drawer.destroy();
    expect(document.body.contains(el)).toBe(false);
  });
});
