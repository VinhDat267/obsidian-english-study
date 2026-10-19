// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FloatingPopover,
  FloatingPopoverOptions,
  PopoverCallbacks,
} from "../../src/ui/FloatingPopover";
import { AiTutorChatService } from "../../src/services/ai/AiTutorChatService";
import { GeminiService } from "../../src/services/provider/GeminiService";
import { LookupResult, TutorSession } from "../../src/types";
import { PopoverChatDrawer } from "../../src/ui/PopoverChatDrawer";

describe("FloatingPopover - PopoverChatDrawer Integration", () => {
  let popover: FloatingPopover;
  let chatService: AiTutorChatService;
  let geminiService: GeminiService;
  let callbacks: PopoverCallbacks;
  const apiKey = "test-api-key";

  const mockRect = {
    left: 100,
    right: 200,
    top: 150,
    bottom: 180,
    width: 100,
    height: 30,
  };

  const mockResult: LookupResult = {
    query: "serendipity",
    type: "word",
    contextSentence: "Finding this book was pure serendipity.",
    contextSentenceClean: "Finding this book was pure serendipity.",
    phonetic: "ˌser.ənˈdɪp.ə.ti",
    vietnameseTranslation: "sự tình cờ may mắn",
    definitions: [
      {
        partOfSpeech: "noun",
        meaningEn:
          "the occurrence and development of events by chance in a happy or beneficial way",
        example: "A fortunate stroke of serendipity.",
      },
    ],
    docContext: {
      noteTitle: "Literature Notes",
      heading: "Serendipity in Poetry",
      tags: ["reading", "english"],
    },
    timestamp: Date.now(),
    sourceLang: "en",
    targetLang: "vi",
  };

  beforeEach(() => {
    chatService = new AiTutorChatService();
    geminiService = new GeminiService();
    vi.spyOn(geminiService, "chatWithTutor").mockResolvedValue(
      "Giải thích từ serendipity..."
    );

    callbacks = {
      onSave: vi.fn(),
      onPinToSidebar: vi.fn(),
      onClose: vi.fn(),
      onPinToSidebarChat: vi.fn(),
    };

    popover = new FloatingPopover();
  });

  afterEach(() => {
    popover.hide();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("1. popover renders without drawer if chatService or apiKey is not supplied", () => {
    popover.show(mockRect, mockResult, callbacks, {});

    const popoverEl = document.querySelector(".english-study-popover");
    expect(popoverEl).not.toBeNull();

    const drawerEl = document.querySelector(".popover-chat-drawer");
    expect(drawerEl).toBeNull();
    expect(popover.getChatDrawer()).toBeNull();
  });

  it("2. popover renders drawer when chatService, geminiService, and apiKey are provided via options", () => {
    const options: FloatingPopoverOptions = {
      chatService,
      geminiService,
      apiKey,
    };

    popover.show(mockRect, mockResult, callbacks, options);

    const drawerEl = document.querySelector(".popover-chat-drawer");
    expect(drawerEl).not.toBeNull();

    const drawerInstance = popover.getChatDrawer();
    expect(drawerInstance).not.toBeNull();
    expect(drawerInstance).toBeInstanceOf(PopoverChatDrawer);

    // Toggle button should be rendered
    const toggleBtn = drawerEl?.querySelector(".drawer-toggle-btn");
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn?.textContent).toContain("Hỏi sâu Gia sư AI");
  });

  it("3. popover renders drawer when tutor dependencies are set via setTutorDependencies", () => {
    popover.setTutorDependencies(chatService, geminiService, apiKey);
    popover.show(mockRect, mockResult, callbacks);

    const drawerEl = document.querySelector(".popover-chat-drawer");
    expect(drawerEl).not.toBeNull();
    expect(popover.getChatDrawer()).not.toBeNull();
  });

  it("4. toggling drawer triggers onResize and adjustBounds to recalculate maxHeight", () => {
    popover.show(mockRect, mockResult, callbacks, {
      chatService,
      geminiService,
      apiKey,
    });

    const adjustBoundsSpy = vi.spyOn(popover, "adjustBounds");
    const drawerInstance = popover.getChatDrawer();
    expect(drawerInstance).not.toBeNull();

    const toggleBtn = document.querySelector(".drawer-toggle-btn") as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    // Toggle expand
    toggleBtn.click();

    expect(drawerInstance?.isExpanded()).toBe(true);
    expect(adjustBoundsSpy).toHaveBeenCalled();

    const popoverEl = popover.getElement();
    expect(popoverEl).not.toBeNull();
    expect(popoverEl?.style.maxHeight).toMatch(/\d+px/);
  });

  it("5. drawer's pin button triggers callbacks.onPinToSidebarChat(session)", () => {
    popover.show(mockRect, mockResult, callbacks, {
      chatService,
      geminiService,
      apiKey,
    });

    const drawerInstance = popover.getChatDrawer();
    expect(drawerInstance).not.toBeNull();

    // Expand drawer first to reveal toolbar
    drawerInstance?.toggle(true);

    const pinBtn = document.querySelector(".btn-pin-sidebar") as HTMLButtonElement;
    expect(pinBtn).not.toBeNull();

    pinBtn.click();

    expect(callbacks.onPinToSidebarChat).toHaveBeenCalledTimes(1);
    const sessionArg = (callbacks.onPinToSidebarChat as any).mock.calls[0][0] as TutorSession;
    expect(sessionArg.query).toBe("serendipity");
    expect(sessionArg.contextSentence).toBe("Finding this book was pure serendipity.");
    expect(sessionArg.docContext?.noteTitle).toBe("Literature Notes");
  });

  it("6. calling hide() cleans up the drawer and resets references", () => {
    popover.show(mockRect, mockResult, callbacks, {
      chatService,
      geminiService,
      apiKey,
    });

    const drawerInstance = popover.getChatDrawer();
    expect(drawerInstance).not.toBeNull();
    const destroySpy = vi.spyOn(drawerInstance!, "destroy");

    popover.hide();

    expect(destroySpy).toHaveBeenCalled();
    expect(popover.getChatDrawer()).toBeNull();
    expect(document.querySelector(".popover-chat-drawer")).toBeNull();
  });

  it("7. calling show() successively destroys previous drawer and creates a fresh session", () => {
    popover.show(mockRect, mockResult, callbacks, {
      chatService,
      geminiService,
      apiKey,
    });

    const drawer1 = popover.getChatDrawer();
    expect(drawer1).not.toBeNull();
    const destroySpy = vi.spyOn(drawer1!, "destroy");

    const secondResult: LookupResult = {
      ...mockResult,
      query: "resilience",
      contextSentence: "She showed great resilience in the face of adversity.",
    };

    popover.show(mockRect, secondResult, callbacks, {
      chatService,
      geminiService,
      apiKey,
    });

    expect(destroySpy).toHaveBeenCalled();
    const drawer2 = popover.getChatDrawer();
    expect(drawer2).not.toBeNull();
    expect(drawer2).not.toBe(drawer1);

    // Pinning from new drawer passes new session
    drawer2?.toggle(true);
    const pinBtn = document.querySelector(".btn-pin-sidebar") as HTMLButtonElement;
    pinBtn.click();

    expect(callbacks.onPinToSidebarChat).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "resilience",
        contextSentence: "She showed great resilience in the face of adversity.",
      })
    );
  });
});
