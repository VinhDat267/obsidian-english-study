import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, Editor, MarkdownView, WorkspaceLeaf, Notice, createMockObsidianElement } from "obsidian";
import EnglishStudyPlugin from "../main";
import { DEFAULT_SETTINGS, LookupResult } from "../src/types";
import { VIEW_TYPE_ENGLISH_STUDY } from "../src/ui/SidebarView";

describe("EnglishStudyPlugin Integration (main.ts)", () => {
  let app: App;
  let plugin: EnglishStudyPlugin;
  let originalDocument: any;
  let originalWindow: any;
  let originalNode: any;
  let originalMouseEvent: any;
  let mockBody: any;
  let docListeners: Record<string, ((...args: any[]) => void)[]>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalDocument = (global as any).document;
    originalWindow = (global as any).window;
    originalNode = (global as any).Node;
    originalMouseEvent = (global as any).MouseEvent;

    class MockNode {
      static TEXT_NODE = 3;
      static ELEMENT_NODE = 1;
      static DOCUMENT_POSITION_FOLLOWING = 4;
    }
    (global as any).Node = MockNode;

    class MockMouseEvent {
      public button: number = 0;
      public buttons: number = 0;
      public clientX: number = 0;
      public clientY: number = 0;
      public target: any = null;
      constructor(public type: string, init: any = {}) {
        Object.assign(this, init);
      }
      preventDefault = vi.fn();
      stopPropagation = vi.fn();
    }
    (global as any).MouseEvent = MockMouseEvent;

    docListeners = {};
    mockBody = createMockObsidianElement("body");

    (global as any).document = {
      createElement: vi.fn((tag: string) => createMockObsidianElement(tag)),
      createRange: vi.fn(() => ({
        setStart: vi.fn(),
        setEnd: vi.fn(),
        cloneRange: vi.fn(() => ({} as Range)),
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 120,
          left: 100,
          right: 200,
          width: 100,
          height: 20,
        }),
      })),
      body: mockBody,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: any) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      }),
      dispatchEvent: vi.fn(),
    };

    (global as any).window = {
      innerWidth: 1024,
      innerHeight: 768,
      getSelection: vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            top: 100,
            bottom: 120,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
        }),
      })),
    };

    app = new App();
    plugin = new EnglishStudyPlugin(app, {
      id: "obsidian-english-study",
      name: "English Study",
      version: "1.0.0",
    } as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    (global as any).document = originalDocument;
    (global as any).window = originalWindow;
    (global as any).Node = originalNode;
    (global as any).MouseEvent = originalMouseEvent;
  });

  describe("Lifecycle & Registrations (onload / onunload)", () => {
    it("should load settings and initialize all services in onload()", async () => {
      await plugin.onload();

      expect(plugin.settings).toBeDefined();
      expect(plugin.settings.triggerMode).toBe(DEFAULT_SETTINGS.triggerMode);
      expect(plugin.providerManager).toBeDefined();
      expect(plugin.vocabService).toBeDefined();
      expect(plugin.geminiService).toBeDefined();
      expect(plugin.bilingualTranslationService).toBeDefined();
      expect(plugin.floatingTrigger).toBeDefined();
      expect(plugin.floatingPopover).toBeDefined();
    });

    it("should register sidebar view, ribbon icon, commands, events and settings tab", async () => {
      await plugin.onload();

      // View registration
      expect(plugin.views.has(VIEW_TYPE_ENGLISH_STUDY)).toBe(true);

      // Ribbon icons (Sidebar & Highlighter Pen Mode)
      expect(plugin.ribbonIcons.length).toBe(2);
      expect(plugin.ribbonIcons[0].icon).toBe("book-open");
      expect(plugin.ribbonIcons[0].title).toBe("Mở Polyglot Study Panel");
      expect(plugin.ribbonIcons[1].icon).toBe("highlighter");
      expect(plugin.ribbonIcons[1].title).toBe("Bật/Tắt chế độ bút dạ quang (Reading)");

      // Commands (14 commands)
      expect(plugin.commands.length).toBe(14);
      const commandIds = plugin.commands.map((c) => c.id);
      expect(commandIds).toContain("lookup-selected-text");
      expect(commandIds).toContain("save-to-vocabulary");
      expect(commandIds).toContain("open-sidebar-view");
      expect(commandIds).toContain("toggle-ai-grammar");
      expect(commandIds).toContain("toggle-ai-translation");
      expect(commandIds).toContain("toggle-auto-translate");
      expect(commandIds).toContain("toggle-highlighter-pen-mode");
      expect(commandIds).toContain("bilingual-translate-file");
      expect(commandIds).toContain("highlight-selection-yellow");
      expect(commandIds).toContain("clear-highlight-selection");
      expect(commandIds).toContain("clear-all-reading-highlights");
      expect(commandIds).toContain("undo-reading-highlight");
      expect(commandIds).toContain("redo-reading-highlight");

      // DOM events (mousedown, mousemove, contextmenu, mouseup, keyup, keydown, scroll)
      expect(plugin.domEvents.length).toBe(7);
      const eventTypes = plugin.domEvents.map((e) => e.type);
      expect(eventTypes).toContain("mousedown");
      expect(eventTypes).toContain("mousemove");
      expect(eventTypes).toContain("contextmenu");
      expect(eventTypes).toContain("mouseup");
      expect(eventTypes).toContain("keyup");
      expect(eventTypes).toContain("keydown");
      expect(eventTypes).toContain("scroll");

      const scrollEvent = plugin.domEvents.find((e) => e.type === "scroll");
      expect(scrollEvent?.options).toBe(true);

      // Workspace events plus Vault rename/delete lifecycle.
      expect(plugin.events.length).toBe(6);

      // Settings tab
      expect(plugin.settingTabs.length).toBe(1);
    });

    it("should dismiss floating UI on scroll event while preserving popover", async () => {
      await plugin.onload();
      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      const scrollEvent = plugin.domEvents.find((e) => e.type === "scroll");
      expect(scrollEvent).toBeDefined();

      scrollEvent!.callback();
      expect(dismissSpy).toHaveBeenCalledWith(true, true);
      expect(popoverHideSpy).not.toHaveBeenCalled();
    });

    it("should NOT dismiss floating UI on scroll event originating from inside popover", async () => {
      await plugin.onload();
      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");

      const mockChild: any = {};
      const mockPopoverElement: any = {
        contains: vi.fn((target: any) => target === mockChild),
      };
      vi.spyOn(plugin.floatingPopover, "getElement").mockReturnValue(mockPopoverElement);

      const scrollEvent = plugin.domEvents.find((e) => e.type === "scroll");
      expect(scrollEvent).toBeDefined();

      // Cuộn bên trong popover -> KHÔNG được dismiss
      scrollEvent!.callback({ target: mockChild });
      expect(dismissSpy).not.toHaveBeenCalled();

      // Cuộn bên ngoài popover -> dismiss bình thường
      scrollEvent!.callback({ target: {} });
      expect(dismissSpy).toHaveBeenCalled();
    });

    it("should clean up timers and hide UI on onunload()", async () => {
      await plugin.onload();
      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");

      plugin.onunload();

      expect(dismissSpy).toHaveBeenCalled();
    });
  });

  describe("Settings Management (loadSettings / saveSettings)", () => {
    it("should merge saved data with DEFAULT_SETTINGS in loadSettings()", async () => {
      vi.spyOn(plugin, "loadData").mockResolvedValue({
        triggerMode: "hotkey-only",
        geminiApiKey: "custom-api-key",
      });

      await plugin.loadSettings();

      expect(plugin.settings.triggerMode).toBe("hotkey-only");
      expect(plugin.settings.geminiApiKey).toBe("custom-api-key");
      expect(plugin.settings.vocabFilePath).toBe(DEFAULT_SETTINGS.vocabFilePath);
    });

    it("should persist settings and update vocabService in saveSettings()", async () => {
      await plugin.onload();
      const saveDataSpy = vi.spyOn(plugin, "saveData").mockResolvedValue(undefined);
      const updateSettingsSpy = vi.spyOn(plugin.vocabService, "updateSettings");

      plugin.settings.preferredAccent = "uk";
      await plugin.saveSettings();

      expect(saveDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({ preferredAccent: "uk" })
      );
      expect(updateSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ preferredAccent: "uk" })
      );
    });
  });

  describe("Sidebar View Activation (activateSidebarView)", () => {
    it("should reveal existing leaf if sidebar view is already open", async () => {
      await plugin.onload();
      const mockLeaf = new WorkspaceLeaf();
      vi.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([mockLeaf]);
      const revealSpy = vi.spyOn(app.workspace, "revealLeaf");

      await plugin.activateSidebarView();

      expect(revealSpy).toHaveBeenCalledWith(mockLeaf);
    });

    it("should create new right leaf and set view state if sidebar view does not exist", async () => {
      await plugin.onload();
      const mockLeaf = new WorkspaceLeaf();
      vi.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
      vi.spyOn(app.workspace, "getRightLeaf").mockReturnValue(mockLeaf);
      const setViewStateSpy = vi.spyOn(mockLeaf, "setViewState");
      const revealSpy = vi.spyOn(app.workspace, "revealLeaf");

      await plugin.activateSidebarView();

      expect(setViewStateSpy).toHaveBeenCalledWith({
        type: VIEW_TYPE_ENGLISH_STUDY,
        active: true,
      });
      expect(revealSpy).toHaveBeenCalledWith(mockLeaf);
    });
  });

  describe("performLookup()", () => {
    let editor: Editor;

    beforeEach(async () => {
      await plugin.onload();
      editor = new Editor("Artificial intelligence is transforming software engineering.\nIt boosts developer velocity.");
    });

    it("should return null and not trigger lookup if selection is empty", async () => {
      editor.setSelectionText("");
      const lookupSpy = vi.spyOn(plugin.providerManager, "lookup");

      const result = await plugin.performLookup(editor);

      expect(result).toBeNull();
      expect(lookupSpy).not.toHaveBeenCalled();
    });

    it("should hide floatingTrigger, invoke providerManager.lookup, store lastLookupResult, and show popover", async () => {
      editor.setSelectionText("intelligence");
      editor.setCursor({ line: 0, ch: 15 });

      const mockResult: LookupResult = {
        query: "intelligence",
        type: "word",
        contextSentence: "Artificial intelligence is transforming software engineering.",
        contextSentenceClean: "Artificial intelligence is transforming software engineering.",
        vietnameseTranslation: "Trí tuệ nhân tạo",
        timestamp: Date.now(),
      };

      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const popoverShowSpy = vi.spyOn(plugin.floatingPopover, "show");
      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);

      const result = await plugin.performLookup(editor);

      expect(triggerHideSpy).toHaveBeenCalled();
      expect(plugin.providerManager.lookup).toHaveBeenCalledWith(
        "intelligence",
        expect.stringContaining("Artificial intelligence is transforming software engineering."),
        expect.any(Number),
        plugin.settings,
        expect.any(Object),
        expect.any(Function)
      );
      expect(result).toEqual(mockResult);
      expect((plugin as any).lastLookupResult).toEqual(mockResult);
      expect(popoverShowSpy).toHaveBeenCalledWith(
        expect.any(Object),
        mockResult,
        expect.objectContaining({
          onSave: expect.any(Function),
          onPinToSidebar: expect.any(Function),
        }),
        expect.any(Object)
      );
    });

    it("should synchronize result to sidebarView if sidebar is already initialized", async () => {
      editor.setSelectionText("velocity");
      editor.setCursor({ line: 1, ch: 20 });

      const mockResult: LookupResult = {
        query: "velocity",
        type: "word",
        contextSentence: "It boosts developer velocity.",
        contextSentenceClean: "It boosts developer velocity.",
        vietnameseTranslation: "Tốc độ",
        timestamp: Date.now(),
      };

      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);

      plugin.sidebarView = {
        setResult: vi.fn(),
      } as any;

      await plugin.performLookup(editor);

      expect(plugin.sidebarView!.setResult).toHaveBeenCalledWith(mockResult);
    });

    it("popover onSave callback should invoke vocabService.saveVocab", async () => {
      editor.setSelectionText("developer");
      const mockResult: LookupResult = {
        query: "developer",
        type: "word",
        contextSentence: "It boosts developer velocity.",
        contextSentenceClean: "It boosts developer velocity.",
        vietnameseTranslation: "Lập trình viên",
        timestamp: Date.now(),
      };

      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);
      let capturedCallbacks: any = null;
      vi.spyOn(plugin.floatingPopover, "show").mockImplementation((rect, res, cb) => {
        capturedCallbacks = cb;
      });

      await plugin.performLookup(editor);

      const saveVocabSpy = vi.spyOn(plugin.vocabService, "saveVocab").mockResolvedValue({
        success: true,
        isDuplicate: false,
        filePath: "Vocabulary.md",
      });

      expect(capturedCallbacks).toBeDefined();
      await capturedCallbacks.onSave(mockResult);

      expect(saveVocabSpy).toHaveBeenCalledWith(mockResult, plugin.settings);
    });

    it("should return null gracefully if lookup is aborted (AbortError)", async () => {
      editor.setSelectionText("canceled");
      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      vi.spyOn(plugin.providerManager, "lookup").mockRejectedValue(abortError);

      const result = await plugin.performLookup(editor);

      expect(result).toBeNull();
    });

    it("popover onPinToSidebar callback should dismiss floating UI and activate sidebar", async () => {
      editor.setSelectionText("developer");
      const mockResult: LookupResult = {
        query: "developer",
        type: "word",
        contextSentence: "It boosts developer velocity.",
        contextSentenceClean: "It boosts developer velocity.",
        vietnameseTranslation: "Lập trình viên",
        timestamp: Date.now(),
      };

      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);
      let capturedCallbacks: any = null;
      vi.spyOn(plugin.floatingPopover, "show").mockImplementation((rect, res, cb) => {
        capturedCallbacks = cb;
      });

      await plugin.performLookup(editor);

      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");
      const activateSpy = vi.spyOn(plugin, "activateSidebarView").mockResolvedValue();

      expect(capturedCallbacks).toBeDefined();
      capturedCallbacks.onPinToSidebar(mockResult);

      expect(dismissSpy).toHaveBeenCalled();
      expect(activateSpy).toHaveBeenCalled();
    });
  });

  describe("handleSelectionDebounced() across 3 trigger modes", () => {
    let mockView: MarkdownView;
    let editor: Editor;

    beforeEach(async () => {
      await plugin.onload();
      const leaf = new WorkspaceLeaf();
      mockView = new MarkdownView(leaf);
      editor = mockView.editor;
      editor.setValue("Learning English with Obsidian plugins.");
      app.workspace.activeLeaf = leaf;
      vi.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(mockView);
    });

    it("should do nothing and hide trigger if selection is empty after debounce", () => {
      editor.setSelectionText("   ");
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(triggerHideSpy).toHaveBeenCalled();
    });

    it("mode 'hotkey-only': should hide trigger and NOT trigger lookup", () => {
      plugin.settings.triggerMode = "hotkey-only";
      editor.setSelectionText("Obsidian");
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const performLookupSpy = vi.spyOn(plugin, "performLookup");

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(triggerHideSpy).toHaveBeenCalled();
      expect(performLookupSpy).not.toHaveBeenCalled();
    });

    it("mode 'auto-popup': should directly trigger performLookup(editor)", () => {
      plugin.settings.triggerMode = "auto-popup";
      editor.setSelectionText("Obsidian");
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const performLookupSpy = vi.spyOn(plugin, "performLookup").mockResolvedValue(null);

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(triggerHideSpy).toHaveBeenCalled();
      expect(performLookupSpy).toHaveBeenCalledWith(editor);
    });

    it("auto-translate mode: should immediately show loading popover at selection rect before lookup finishes", async () => {
      plugin.settings.autoTranslateOnSelection = true;
      plugin.settings.triggerMode = "auto-popup";
      editor.setSelectionText("breakthrough");

      const showLoadingSpy = vi.spyOn(plugin.floatingPopover, "showLoading");
      const showSpy = vi.spyOn(plugin.floatingPopover, "show");

      let resolveLookup: any;
      const lookupPromise = new Promise<LookupResult>((resolve) => {
        resolveLookup = resolve;
      });
      vi.spyOn(plugin.providerManager, "lookup").mockReturnValue(lookupPromise);

      // Trigger selection debounce
      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      // showLoading must have been called immediately with selection rect and query
      expect(showLoadingSpy).toHaveBeenCalledWith(
        expect.any(Object),
        "breakthrough",
        expect.objectContaining({
          onClose: expect.any(Function),
        })
      );
      expect(showSpy).not.toHaveBeenCalled();

      // Resolve the lookup
      resolveLookup({
        query: "breakthrough",
        type: "word",
        contextSentence: "A major breakthrough.",
        contextSentenceClean: "A major breakthrough.",
        vietnameseTranslation: "Bước đột phá",
        timestamp: Date.now(),
      });
      await vi.runAllTimersAsync();

      // Now show has been called with result
      expect(showSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ query: "breakthrough" }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it("mode 'icon': should show floatingTrigger with onClick callback to performLookup", () => {
      plugin.settings.triggerMode = "icon";
      editor.setSelectionText("Obsidian");
      const triggerShowSpy = vi.spyOn(plugin.floatingTrigger, "show");
      const performLookupSpy = vi.spyOn(plugin, "performLookup").mockResolvedValue(null);

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(triggerShowSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Function)
      );

      // Trigger the click callback passed to floatingTrigger.show
      const onClickCb = triggerShowSpy.mock.calls[0][1];
      onClickCb({} as any);

      expect(performLookupSpy).toHaveBeenCalledWith(editor);
    });

    it("should NOT re-trigger lookup or reset popover when popover is being dragged or was just dragged", async () => {
      plugin.settings.autoTranslateOnSelection = true;
      plugin.settings.triggerMode = "auto-popup";
      editor.setSelectionText("authentication");

      const performLookupSpy = vi.spyOn(plugin, "performLookup").mockResolvedValue(null);

      // Initial selection lookup
      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);
      expect(performLookupSpy).toHaveBeenCalledTimes(1);

      performLookupSpy.mockClear();

      // Now simulate user dragging the popover
      vi.spyOn(plugin.floatingPopover, "wasJustDragged").mockReturnValue(true);

      // Mouseup fires when drag ends
      const mouseupEvent = plugin.domEvents.find((e) => e.type === "mouseup");
      expect(mouseupEvent).toBeDefined();
      mouseupEvent!.callback();

      vi.advanceTimersByTime(150);

      // performLookup must NOT have been called again!
      expect(performLookupSpy).not.toHaveBeenCalled();
    });

    it("should NOT re-trigger lookup if popover is already open and showing the current selected text", async () => {
      plugin.settings.autoTranslateOnSelection = true;
      plugin.settings.triggerMode = "auto-popup";
      editor.setSelectionText("authentication");

      const performLookupSpy = vi.spyOn(plugin, "performLookup").mockResolvedValue(null);

      // Initial lookup
      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);
      expect(performLookupSpy).toHaveBeenCalledTimes(1);

      performLookupSpy.mockClear();

      // Popover is currently visible and showing "authentication"
      vi.spyOn(plugin.floatingPopover, "isVisible").mockReturnValue(true);
      vi.spyOn(plugin.floatingPopover, "getCurrentQuery").mockReturnValue("authentication");

      // Another mouseup occurs (e.g. user clicked inside popover or on drag handle)
      const mouseupEvent = plugin.domEvents.find((e) => e.type === "mouseup");
      mouseupEvent!.callback();

      vi.advanceTimersByTime(150);

      // performLookup must NOT be triggered again
      expect(performLookupSpy).not.toHaveBeenCalled();
    });
  });


  describe("Commands Verification", () => {
    let editor: Editor;
    let mockView: MarkdownView;

    beforeEach(async () => {
      await plugin.onload();
      const leaf = new WorkspaceLeaf();
      mockView = new MarkdownView(leaf);
      leaf.view = mockView;
      app.workspace.activeLeaf = leaf;
      vi.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(mockView);
      editor = mockView.editor;
      editor.setValue("Exploring vocabulary integration.");
    });

    it("lookup-selected-text command: checks selection and executes performLookup", () => {
      const lookupCmd = plugin.commands.find((c) => c.id === "lookup-selected-text");
      expect(lookupCmd).toBeDefined();

      editor.setSelectionText("");
      expect(lookupCmd!.editorCheckCallback!(true, editor, mockView)).toBe(false);

      editor.setSelectionText("vocabulary");
      expect(lookupCmd!.editorCheckCallback!(true, editor, mockView)).toBe(true);

      const performLookupSpy = vi.spyOn(plugin, "performLookup").mockResolvedValue(null);
      lookupCmd!.editorCheckCallback!(false, editor, mockView);
      expect(performLookupSpy).toHaveBeenCalledWith(editor);
    });

    it("save-to-vocabulary command: checks lastLookupResult and invokes vocabService.saveVocab", () => {
      const saveCmd = plugin.commands.find((c) => c.id === "save-to-vocabulary");
      expect(saveCmd).toBeDefined();

      // No last lookup result -> check returns false
      (plugin as any).lastLookupResult = null;
      expect(saveCmd!.checkCallback!(true)).toBe(false);

      const mockResult: LookupResult = {
        query: "vocabulary",
        type: "word",
        contextSentence: "Exploring vocabulary integration.",
        contextSentenceClean: "Exploring vocabulary integration.",
        vietnameseTranslation: "Từ vựng",
        timestamp: Date.now(),
      };
      (plugin as any).lastLookupResult = mockResult;
      expect(saveCmd!.checkCallback!(true)).toBe(true);

      const saveVocabSpy = vi.spyOn(plugin.vocabService, "saveVocab").mockResolvedValue({
        success: true,
        isDuplicate: false,
        filePath: "Vocabulary.md",
      });

      saveCmd!.checkCallback!(false);
      expect(saveVocabSpy).toHaveBeenCalledWith(mockResult, plugin.settings);
    });

    it("open-sidebar-view command: executes activateSidebarView", () => {
      const openCmd = plugin.commands.find((c) => c.id === "open-sidebar-view");
      expect(openCmd).toBeDefined();

      const activateSpy = vi.spyOn(plugin, "activateSidebarView").mockResolvedValue();
      openCmd!.callback!();
      expect(activateSpy).toHaveBeenCalled();
    });

    it("highlight-selection-yellow command: checks for preview mode and applies non-destructive reading highlight", () => {
      const highlightCmd = plugin.commands.find((c) => c.id === "highlight-selection-yellow");
      expect(highlightCmd).toBeDefined();

      // In source/editor mode -> checkCallback returns false
      mockView.mode = "source";
      expect(highlightCmd!.checkCallback!(true)).toBe(false);

      // In preview/reading mode
      mockView.mode = "preview";
      mockView.contentEl.closest = vi.fn(() => null);
      const mockFile: any = { path: "Notes/Article.md" };
      mockView.file = mockFile;
      (global as any).window.getSelection = vi.fn(() => ({
        toString: () => "important phrase",
      }));

      expect(highlightCmd!.checkCallback!(true)).toBe(true);

      const rerenderSpy = vi.spyOn(mockView.previewMode, "rerender");
      highlightCmd!.checkCallback!(false);

      // Highlight was saved in readingHighlightService
      const highlights = plugin.readingHighlightService.getHighlights("Notes/Article.md");
      expect(highlights).toHaveLength(1);
      expect(highlights[0].text).toBe("important phrase");
      expect(highlights[0].color).toBe("yellow");
      // Zero-reload: previewMode.rerender is eliminated for smooth 60fps live DOM updates
      expect(rerenderSpy).not.toHaveBeenCalled();

      // Editor was NEVER modified (0 edits to markdown file)
      expect(editor.getValue()).not.toContain("==");
    });

    it("clear-highlight-selection command: checks for preview mode and removes reading highlight", () => {
      const clearCmd = plugin.commands.find((c) => c.id === "clear-highlight-selection");
      expect(clearCmd).toBeDefined();

      mockView.mode = "preview";
      const mockFile: any = { path: "Notes/Article.md" };
      mockView.file = mockFile;

      // Seed highlight
      plugin.readingHighlightService.addHighlight("Notes/Article.md", "important phrase", "yellow");
      expect(plugin.readingHighlightService.getHighlights("Notes/Article.md")).toHaveLength(1);

      (global as any).window.getSelection = vi.fn(() => ({
        toString: () => "important phrase",
      }));

      const rerenderSpy = vi.spyOn(mockView.previewMode, "rerender");
      clearCmd!.checkCallback!(false);

      // Highlight removed
      expect(plugin.readingHighlightService.getHighlights("Notes/Article.md")).toHaveLength(0);
      expect(rerenderSpy).not.toHaveBeenCalled();
      expect(editor.getValue()).not.toContain("==");
    });

    it("highlightSelection: does NOT modify markdown in edit mode", () => {
      mockView.mode = "source";
      editor.setSelectionText("green text");
      const result = plugin.highlightSelection("green", editor);
      expect(result).toBe(false);
      expect(editor.getValue()).not.toContain("<mark");
    });
  });

  describe("dismissFloatingUi()", () => {
    it("should dismiss both floating trigger and popover when unpinned and keepPopover is false", async () => {
      await plugin.onload();
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      plugin.dismissFloatingUi();

      expect(triggerHideSpy).toHaveBeenCalled();
      expect(popoverHideSpy).toHaveBeenCalled();
    });

    it("should keep popover visible when keepPopover is true", async () => {
      await plugin.onload();
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      plugin.dismissFloatingUi(true, true);

      expect(triggerHideSpy).toHaveBeenCalled();
      expect(popoverHideSpy).not.toHaveBeenCalled();
    });

    it("should NOT dismiss popover if popover is pinned", async () => {
      await plugin.onload();
      vi.spyOn(plugin.floatingPopover, "isPinnedPopover").mockReturnValue(true);
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      plugin.dismissFloatingUi(true, false);

      expect(popoverHideSpy).not.toHaveBeenCalled();
    });

    it("should dismiss popover if popover is NOT pinned", async () => {
      await plugin.onload();
      vi.spyOn(plugin.floatingPopover, "isPinnedPopover").mockReturnValue(false);
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      plugin.dismissFloatingUi(true, false);

      expect(popoverHideSpy).toHaveBeenCalled();
    });
  });

  describe("Reading Mode Support", () => {
    let mockView: MarkdownView;

    beforeEach(async () => {
      await plugin.onload();
      const leaf = new WorkspaceLeaf();
      mockView = new MarkdownView(leaf);
      mockView.editor.setValue("");
      mockView.editor.setSelectionText("");
      app.workspace.activeLeaf = leaf;
      vi.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(mockView);
    });

    it("should lookup text in Reading mode via performLookupFromReading", async () => {
      const mockResult: LookupResult = {
        query: "serendipity",
        type: "word",
        contextSentence: "Finding this book was sheer serendipity.",
        contextSentenceClean: "Finding this book was sheer serendipity.",
        vietnameseTranslation: "Sự tình cờ may mắn",
        timestamp: Date.now(),
      };

      const lookupSpy = vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);
      const popoverSpy = vi.spyOn(plugin.floatingPopover, "show");

      const res = await plugin.performLookupFromReading(
        "serendipity",
        "Finding this book was sheer serendipity.",
        28
      );

      expect(res).toEqual(mockResult);
      expect(lookupSpy).toHaveBeenCalledWith(
        "serendipity",
        "Finding this book was sheer serendipity.",
        28,
        plugin.settings,
        expect.any(Object),
        expect.any(Function)
      );
      expect(popoverSpy).toHaveBeenCalled();
    });

    it("should detect reading view selection in handleSelectionDebounced and show floatingHighlightToolbar", () => {
      plugin.settings.triggerMode = "icon";
      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "serendipity",
        anchorNode: mockView.contentEl,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
            parentElement: mockView.contentEl,
            closest: vi.fn(() => ({
              textContent: "Finding this book was sheer serendipity.",
            })),
          },
          getBoundingClientRect: () => ({
            top: 150,
            bottom: 170,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
          cloneRange: vi.fn(() => ({} as Range)),
        }),
      }));

      const toolbarShowSpy = vi.spyOn(plugin.floatingHighlightToolbar, "show");

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(toolbarShowSpy).toHaveBeenCalledWith(
        expect.anything(),
        "serendipity",
        expect.anything(),
        expect.objectContaining({
          onHighlight: expect.any(Function),
          onClear: expect.any(Function),
          onLookup: expect.any(Function),
        })
      );
    });

    it("should trigger performLookupFromReading when onLookup is called from floatingHighlightToolbar", () => {
      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "serendipity",
        anchorNode: mockView.contentEl,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
            parentElement: mockView.contentEl,
            closest: vi.fn(() => ({
              textContent: "Finding this book was sheer serendipity.",
            })),
          },
          getBoundingClientRect: () => ({
            top: 150,
            bottom: 170,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
          cloneRange: vi.fn(() => ({} as Range)),
        }),
      }));

      let capturedCallbacks: any;
      vi.spyOn(plugin.floatingHighlightToolbar, "show").mockImplementation(
        (_rect, _text, _range, callbacks) => {
          capturedCallbacks = callbacks;
        }
      );

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(capturedCallbacks).toBeDefined();

      const performSpy = vi.spyOn(plugin, "performLookupFromReading").mockResolvedValue(null);
      capturedCallbacks.onLookup();

      expect(performSpy).toHaveBeenCalledWith(
        "serendipity",
        "Finding this book was sheer serendipity.",
        expect.any(Number)
      );
    });

    it("should trigger applyLiveReadingHighlight when onHighlight is called from floatingHighlightToolbar", () => {
      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "serendipity",
        anchorNode: mockView.contentEl,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
            parentElement: mockView.contentEl,
            closest: vi.fn(() => ({
              textContent: "Finding this book was sheer serendipity.",
            })),
          },
          getBoundingClientRect: () => ({
            top: 150,
            bottom: 170,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
          cloneRange: vi.fn(() => ({} as Range)),
        }),
      }));

      let capturedCallbacks: any;
      vi.spyOn(plugin.floatingHighlightToolbar, "show").mockImplementation(
        (_rect, _text, _range, callbacks) => {
          capturedCallbacks = callbacks;
        }
      );

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(capturedCallbacks).toBeDefined();

      const highlightSpy = vi.spyOn(plugin, "applyLiveReadingHighlight");
      capturedCallbacks.onHighlight("yellow");

      expect(highlightSpy).toHaveBeenCalledWith(
        "yellow",
        "serendipity",
        expect.anything(),
        mockView
      );
    });

    it("should support checkCallback in lookup-selected-text command for Reading mode", () => {
      const lookupCmd = plugin.commands.find((c) => c.id === "lookup-selected-text");
      expect(lookupCmd).toBeDefined();

      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "ephemeral",
        anchorNode: mockView.contentEl,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
            closest: vi.fn(() => ({
              textContent: "The blossoms are ephemeral.",
            })),
          },
          getBoundingClientRect: () => ({
            top: 100,
            bottom: 120,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
        }),
      }));

      expect(lookupCmd!.checkCallback!(true)).toBe(true);

      const performSpy = vi.spyOn(plugin, "performLookupFromReading").mockResolvedValue(null);
      lookupCmd!.checkCallback!(false);
      expect(performSpy).toHaveBeenCalled();
    });

    it("should handle multilingual lookup and save to separate file when configured", async () => {
      plugin.settings.separateVocabFileByLanguage = true;
      plugin.settings.targetLanguage = "vi";
      plugin.vocabService.updateSettings(plugin.settings);

      const gtSpy = vi.spyOn((plugin.providerManager as any).googleTranslate, "translateWithMeta").mockResolvedValue({
        translation: "học tập",
        detectedLang: "ja",
        transliteration: "Benkyō",
      });

      const mockEditor: any = {
        getSelection: () => "勉強",
        getCursor: () => ({ line: 0, ch: 0 }),
        getLine: () => "日本語を勉強します",
      };

      await plugin.performLookup(mockEditor);

      expect(gtSpy).toHaveBeenCalledWith("勉強", "auto", "vi", expect.any(String));
      expect(plugin["lastLookupResult"]).toBeDefined();
      expect(plugin["lastLookupResult"]?.sourceLang).toBe("ja");
      expect(plugin["lastLookupResult"]?.transliteration).toBe("Benkyō");

      // Save via vocabService
      const saveRes = await plugin.vocabService.saveVocab(plugin["lastLookupResult"]!, plugin.settings);
      expect(saveRes.success).toBe(true);
      expect(saveRes.filePath).toBe("Vocabulary_ja.md");
    });
  });

  describe("Domain-Aware Context & Hotkey Toggles", () => {
    beforeEach(async () => {
      await plugin.onload();
    });

    it("should extract document context correctly from active file, headings, and tags", () => {
      const mockFile: any = {
        basename: "IT Software Project Management",
        name: "IT Software Project Management.md",
        parent: { path: "Projects/IT" },
      };
      (plugin.app.workspace as any).getActiveFile = () => mockFile;
      (plugin.app as any).metadataCache = {
        getFileCache: () => ({
          frontmatter: {
            tags: ["it", "project-management"],
          },
        }),
      };

      const mockEditor: any = {
        getCursor: () => ({ line: 5, ch: 0 }),
        getLine: (line: number) => {
          if (line === 3) return "## Agile Methodologies & Scrum";
          return "Some body paragraph text.";
        },
      };

      const context = plugin.extractDocumentContext(mockEditor);
      expect(context.fileTitle).toBe("IT Software Project Management");
      expect(context.folderPath).toBe("Projects/IT");
      expect(context.headingContext).toBe("Agile Methodologies & Scrum");
      expect(context.tags).toEqual(["it", "project-management"]);
    });

    it("should toggle enableAiGrammar and show Notice when toggle-ai-grammar command is executed", async () => {
      const cmd = plugin.commands.find((c) => c.id === "toggle-ai-grammar");
      expect(cmd).toBeDefined();

      plugin.settings.enableAiGrammar = false;
      await cmd!.callback!();
      expect(plugin.settings.enableAiGrammar).toBe(true);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Phân tích ngữ pháp AI: BẬT");

      await cmd!.callback!();
      expect(plugin.settings.enableAiGrammar).toBe(false);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Phân tích ngữ pháp AI: TẮT");
    });

    it("should toggle enableAiTranslation and show Notice when toggle-ai-translation command is executed", async () => {
      const cmd = plugin.commands.find((c) => c.id === "toggle-ai-translation");
      expect(cmd).toBeDefined();

      plugin.settings.enableAiTranslation = false;
      await cmd!.callback!();
      expect(plugin.settings.enableAiTranslation).toBe(true);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Dịch nghĩa với AI: BẬT");

      await cmd!.callback!();
      expect(plugin.settings.enableAiTranslation).toBe(false);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Dịch nghĩa với AI: TẮT");
    });

    it("should toggle autoTranslateOnSelection and show Notice when toggle-auto-translate command is executed", async () => {
      const cmd = plugin.commands.find((c) => c.id === "toggle-auto-translate");
      expect(cmd).toBeDefined();

      plugin.settings.autoTranslateOnSelection = false;
      await cmd!.callback!();
      expect(plugin.settings.autoTranslateOnSelection).toBe(true);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Tự động dịch khi bôi đen: BẬT");

      await cmd!.callback!();
      expect(plugin.settings.autoTranslateOnSelection).toBe(false);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("Tự động dịch khi bôi đen: TẮT");
    });

    it("should dispatch onAiUpdate to update popover and sidebar when background AI finishes", async () => {
      let registeredOnAiUpdate: ((result: LookupResult) => void) | undefined;
      vi.spyOn(plugin.providerManager, "lookup").mockImplementation(
        async (_q, _p, _o, _s, docContext, onAiUpdate) => {
          registeredOnAiUpdate = onAiUpdate ?? (docContext as any)?.onAiUpdate;
          return {
            query: "sprint",
            type: "word",
            contextSentence: "Sprint planning meeting.",
            contextSentenceClean: "Sprint planning meeting.",
            vietnameseTranslation: "chạy nước rút",
            aiLoading: true,
            timestamp: Date.now(),
          };
        }
      );

      const updateAiSpy = vi.spyOn(plugin.floatingPopover, "updateAiContent");
      plugin.sidebarView = {
        setResult: vi.fn(),
      } as any;

      const mockEditor: any = {
        getSelection: () => "sprint",
        getCursor: () => ({ line: 0, ch: 0 }),
        getLine: () => "Sprint planning meeting.",
      };

      await plugin.performLookup(mockEditor);

      expect(registeredOnAiUpdate).toBeDefined();

      // Simulate AI response finishing in background
      const aiUpdatedResult: LookupResult = {
        query: "sprint",
        type: "word",
        contextSentence: "Sprint planning meeting.",
        contextSentenceClean: "Sprint planning meeting.",
        vietnameseTranslation: "chạy nước rút",
        aiTranslation: "giai đoạn nước rút trong Agile",
        aiGrammarNote: "Danh từ kỹ thuật.",
        aiLoading: false,
        timestamp: Date.now(),
      };

      registeredOnAiUpdate!(aiUpdatedResult);

      expect(updateAiSpy).toHaveBeenCalledWith(
        aiUpdatedResult,
        expect.objectContaining({
          enableAiGrammar: plugin.settings.enableAiGrammar,
          enableAiTranslation: plugin.settings.enableAiTranslation,
        })
      );
      expect(plugin.sidebarView!.setResult).toHaveBeenCalledWith(aiUpdatedResult);
      expect((plugin as any).lastLookupResult).toEqual(aiUpdatedResult);
    });
  });

  describe("Bilingual File Translation Command & Integration", () => {
    it("should open bilingual translation modal when bilingual-translate-file is executed", async () => {
      await plugin.onload();
      const cmd = plugin.commands.find((c) => c.id === "bilingual-translate-file");
      expect(cmd).toBeDefined();

      const mockFile: any = {
        name: "Notes.md",
        basename: "Notes",
        extension: "md",
        path: "Notes.md",
      };

      vi.spyOn(app.workspace, "getActiveFile").mockReturnValue(mockFile);
      const modalSpy = vi.spyOn(plugin, "openBilingualTranslationModal").mockResolvedValue(undefined);

      const checkResult = cmd!.checkCallback!(true);
      expect(checkResult).toBe(true);

      cmd!.checkCallback!(false);
      expect(modalSpy).toHaveBeenCalledWith(mockFile, undefined);
    });

    it("should correctly handle inplace edit and new file creation callback", async () => {
      await plugin.onload();

      const mockFile: any = {
        name: "Guide.md",
        basename: "Guide",
        extension: "md",
        path: "Folder/Guide.md",
        parent: { path: "Folder" },
      };

      const mockEditor: any = {
        getValue: () => "Guide content",
        setValue: vi.fn(),
      };

      const modifySpy = vi.spyOn(app.vault, "modify").mockResolvedValue(undefined);
      const createSpy = vi.spyOn(app.vault, "create").mockResolvedValue({ path: "Folder/Guide (Bilingual).md" } as any);

      await plugin.openBilingualTranslationModal(mockFile, mockEditor);
    });
  });

  describe("Continuous Highlighter Pen Mode (Bút dạ quang)", () => {
    let mockView: MarkdownView;

    beforeEach(async () => {
      await plugin.onload();
      const leaf = new WorkspaceLeaf();
      mockView = new MarkdownView(leaf);
      mockView.editor.setValue("");
      mockView.editor.setSelectionText("");
      mockView.mode = "preview";
      app.workspace.activeLeaf = leaf;
      vi.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(mockView);
    });

    it("should toggle pen mode on toggle-highlighter-pen-mode command", async () => {
      const cmd = plugin.commands.find((c) => c.id === "toggle-highlighter-pen-mode");
      expect(cmd).toBeDefined();

      expect(plugin.isPenModeActive).toBe(false);
      const pillShowSpy = vi.spyOn(plugin.penPill, "show");
      const pillHideSpy = vi.spyOn(plugin.penPill, "hide");

      cmd!.callback!();
      expect(plugin.isPenModeActive).toBe(true);
      expect(pillShowSpy).toHaveBeenCalledWith("yellow", expect.any(Object));

      cmd!.callback!();
      expect(plugin.isPenModeActive).toBe(false);
      expect(pillHideSpy).toHaveBeenCalled();
    });

    it("should NOT auto-highlight on left-click selection in pen mode, but allow translation trigger", () => {
      plugin.togglePenMode(true);
      plugin.settings.highlighterPenColor = "green";
      plugin.currentPenAction = "green";

      const highlightSpy = vi.spyOn(plugin, "applyLiveReadingHighlight");
      const triggerShowSpy = vi.spyOn(plugin.floatingTrigger, "show");
      const toolbarShowSpy = vi.spyOn(plugin.floatingHighlightToolbar, "show");

      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "essential concept",
        anchorNode: mockView.contentEl,
        removeAllRanges: vi.fn(),
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
            parentElement: mockView.contentEl,
            closest: vi.fn(() => ({
              textContent: "An essential concept to learn.",
            })),
          },
          getBoundingClientRect: () => ({
            top: 150,
            bottom: 170,
            left: 100,
            right: 200,
            width: 100,
            height: 20,
          }),
          cloneRange: vi.fn(() => ({} as Range)),
        }),
      }));

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      // Left click should NOT highlight
      expect(highlightSpy).not.toHaveBeenCalled();
      expect(toolbarShowSpy).not.toHaveBeenCalled();
      // Should show translation trigger instead
      expect(triggerShowSpy).toHaveBeenCalled();
    });

    it("should automatically highlight on right-click drag when pen mode is active", () => {
      plugin.togglePenMode(true);
      plugin.settings.highlighterPenColor = "green";
      plugin.currentPenAction = "green";

      const highlightSpy = vi.spyOn(plugin, "applyLiveReadingHighlight");

      const p = document.createElement("p");
      p.textContent = "Right drag to highlight text";
      mockView.contentEl.appendChild(p);
      Object.assign(p, { nodeType: 1, closest: () => null });
      const previewRange: any = { ...document.createRange(), startContainer: p, endContainer: p,
        commonAncestorContainer: p, toString: () => "", cloneRange: () => previewRange };
      (document.createRange as any).mockReturnValue(previewRange);

      (document as any).caretRangeFromPoint = vi.fn(() => document.createRange());

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvent, "target", { value: p });
      plugin.rightClickPenHandler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 90, clientY: 10 });
      plugin.rightClickPenHandler.handleMouseMove(moveEvent);

      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "Right drag to highlight",
        getRangeAt: () => document.createRange(),
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
      }));

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 90, clientY: 10 });
      Object.defineProperty(upEvent, "target", { value: p });
      plugin.rightClickPenHandler.handleMouseUp(upEvent);

      expect(highlightSpy).toHaveBeenCalledWith("green", "Right drag to highlight", expect.anything(), mockView);
    });

    it("should automatically clear highlight on right-click drag when pen mode is set to eraser (clear)", () => {
      plugin.togglePenMode(true);
      plugin.currentPenAction = "clear";

      const clearSpy = vi.spyOn(plugin, "clearLiveReadingHighlight");

      const p = document.createElement("p");
      p.textContent = "Right drag to clear";
      mockView.contentEl.appendChild(p);
      Object.assign(p, { nodeType: 1, closest: () => null });
      const previewRange: any = { ...document.createRange(), startContainer: p, endContainer: p,
        commonAncestorContainer: p, toString: () => "", cloneRange: () => previewRange };
      (document.createRange as any).mockReturnValue(previewRange);

      (document as any).caretRangeFromPoint = vi.fn(() => document.createRange());

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvent, "target", { value: p });
      plugin.rightClickPenHandler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 90, clientY: 10 });
      plugin.rightClickPenHandler.handleMouseMove(moveEvent);

      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "Right drag to clear",
        getRangeAt: () => document.createRange(),
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
      }));

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 90, clientY: 10 });
      Object.defineProperty(upEvent, "target", { value: p });
      plugin.rightClickPenHandler.handleMouseUp(upEvent);

      expect(clearSpy).toHaveBeenCalledWith("Right drag to clear", mockView);
    });

    it("should exit pen mode when Escape key is pressed", () => {
      plugin.togglePenMode(true);
      expect(plugin.isPenModeActive).toBe(true);

      const keydownEvent = plugin.domEvents.find((e) => e.type === "keydown");
      expect(keydownEvent).toBeDefined();

      keydownEvent!.callback({ key: "Escape" });
      expect(plugin.isPenModeActive).toBe(false);
    });

    it("should clear all highlights in current note via clearAllReadingHighlights", () => {
      const mockFile: any = { path: "notes/sample.md" };
      mockView.file = mockFile;
      plugin.readingHighlightService.addHighlight("notes/sample.md", "concept", "yellow");

      expect(plugin.readingHighlightService.getHighlights("notes/sample.md")).toHaveLength(1);

      const result = plugin.clearAllReadingHighlights(mockView);
      expect(result).toBe(true);
      expect(plugin.readingHighlightService.getHighlights("notes/sample.md")).toHaveLength(0);
    });
  });

  describe("AI Tutor Chat Service Integration", () => {
    let mockEditor: Editor;

    beforeEach(async () => {
      plugin.settings.geminiApiKey = "test-gemini-key";
      await plugin.onload();
      mockEditor = new Editor("Mastering TypeScript requires deep practice with types.");
      mockEditor.setSelectionText("TypeScript");
      mockEditor.setCursor({ line: 0, ch: 10 });
    });

    it("should instantiate aiTutorChatService in onload", () => {
      expect((plugin as any).aiTutorChatService).toBeDefined();
    });

    it("should pass tutor dependencies to sidebar on VIEW_TYPE_ENGLISH_STUDY registration", () => {
      const viewFactory = plugin.views.get(VIEW_TYPE_ENGLISH_STUDY);
      expect(viewFactory).toBeDefined();

      const mockLeaf = new WorkspaceLeaf();
      const sidebar = viewFactory!(mockLeaf) as any;
      expect(sidebar).toBeDefined();
      expect(sidebar.tutorChatService).toBe((plugin as any).aiTutorChatService);
      expect(sidebar.geminiService).toBe(plugin.providerManager.getGeminiService());
      expect(sidebar.geminiApiKey).toBe(plugin.settings.geminiApiKey);
    });

    it("should pass tutor options and onPinToSidebarChat to floatingPopover.show on performLookup", async () => {
      const mockResult: LookupResult = {
        query: "TypeScript",
        type: "word",
        contextSentence: "Mastering TypeScript requires practice.",
        contextSentenceClean: "Mastering TypeScript requires practice.",
        vietnameseTranslation: "TypeScript",
        timestamp: Date.now(),
      };
      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);
      const popoverShowSpy = vi.spyOn(plugin.floatingPopover, "show");

      await plugin.performLookup(mockEditor);

      expect(popoverShowSpy).toHaveBeenCalledWith(
        expect.any(Object),
        mockResult,
        expect.objectContaining({
          onPinToSidebarChat: expect.any(Function),
        }),
        expect.objectContaining({
          chatService: (plugin as any).aiTutorChatService,
          geminiService: plugin.providerManager.getGeminiService(),
          apiKey: plugin.settings.geminiApiKey,
        })
      );
    });

    it("should handle onPinToSidebarChat: dismiss floating UI, activate sidebar, set dependencies and open session", async () => {
      const mockResult: LookupResult = {
        query: "TypeScript",
        type: "word",
        contextSentence: "Mastering TypeScript requires practice.",
        contextSentenceClean: "Mastering TypeScript requires practice.",
        vietnameseTranslation: "TypeScript",
        timestamp: Date.now(),
      };
      vi.spyOn(plugin.providerManager, "lookup").mockResolvedValue(mockResult);

      let capturedCallbacks: any = null;
      vi.spyOn(plugin.floatingPopover, "show").mockImplementation((_rect, _res, callbacks) => {
        capturedCallbacks = callbacks;
      });

      await plugin.performLookup(mockEditor);
      expect(capturedCallbacks).toBeDefined();
      expect(capturedCallbacks.onPinToSidebarChat).toBeDefined();

      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");
      const activateSpy = vi.spyOn(plugin, "activateSidebarView").mockResolvedValue(undefined);

      // Mock sidebarView
      const mockSidebar: any = {
        setTutorDependencies: vi.fn(),
        openTutorSession: vi.fn(),
      };
      plugin.sidebarView = mockSidebar;

      const mockSession: any = {
        id: "session-123",
        query: "TypeScript",
        contextSentence: "Mastering TypeScript requires practice.",
        messages: [],
      };

      capturedCallbacks.onPinToSidebarChat(mockSession);

      expect(dismissSpy).toHaveBeenCalledWith(false);
      expect(activateSpy).toHaveBeenCalled();

      // Wait for promise microtask
      await Promise.resolve();
      await Promise.resolve();
      expect(mockSidebar.setTutorDependencies).toHaveBeenCalledWith(
        (plugin as any).aiTutorChatService,
        plugin.providerManager.getGeminiService(),
        plugin.settings.geminiApiKey
      );
      expect(mockSidebar.openTutorSession).toHaveBeenCalledWith(mockSession);
    });

    it("should update sidebar tutor dependencies on saveSettings", async () => {
      const mockSidebar: any = {
        setTutorDependencies: vi.fn(),
      };
      plugin.sidebarView = mockSidebar;

      plugin.settings.geminiApiKey = "updated-new-key-123";
      await plugin.saveSettings();

      expect(mockSidebar.setTutorDependencies).toHaveBeenCalledWith(
        (plugin as any).aiTutorChatService,
        plugin.providerManager.getGeminiService(),
        "updated-new-key-123"
      );
    });
  });
  describe("Highlight Undo & Redo Integration", () => {
    let mockView: MarkdownView;
    let mockFile: any;

    beforeEach(async () => {
      await plugin.onload();
      const leaf = new WorkspaceLeaf();
      mockView = new MarkdownView(leaf);
      mockFile = { path: "Reading/UndoRedoTest.md" };
      mockView.file = mockFile;
      mockView.mode = "preview";
      mockView.contentEl = createMockObsidianElement("div");
      mockView.contentEl.closest = vi.fn(() => null);
      app.workspace.activeLeaf = leaf;
      vi.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(mockView);
      plugin.readingHighlightService.clearHighlightsForFile("Reading/UndoRedoTest.md");
      plugin.highlightHistory.clear("Reading/UndoRedoTest.md");
    });

    it("should register undo-reading-highlight and redo-reading-highlight commands with preview checkCallback", () => {
      const undoCmd = plugin.commands.find((c) => c.id === "undo-reading-highlight");
      const redoCmd = plugin.commands.find((c) => c.id === "redo-reading-highlight");

      expect(undoCmd).toBeDefined();
      expect(redoCmd).toBeDefined();

      // Check callback returns false in edit mode
      mockView.mode = "source";
      expect(undoCmd!.checkCallback!(true)).toBe(false);
      expect(redoCmd!.checkCallback!(true)).toBe(false);

      // Check callback returns true in preview mode
      mockView.mode = "preview";
      expect(undoCmd!.checkCallback!(true)).toBe(true);
      expect(redoCmd!.checkCallback!(true)).toBe(true);
    });

    it("undo and redo: reverts addition and then restores it", () => {
      // 1. Add highlight
      plugin.applyLiveReadingHighlight("yellow", "machine learning", null, mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(1);
      expect(plugin.highlightHistory.canUndo("Reading/UndoRedoTest.md")).toBe(true);
      expect(plugin.highlightHistory.canRedo("Reading/UndoRedoTest.md")).toBe(false);

      // 2. Undo addition
      const undoRes = plugin.undoReadingHighlight(mockView);
      expect(undoRes).toBe(true);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);
      expect(plugin.highlightHistory.canUndo("Reading/UndoRedoTest.md")).toBe(false);
      expect(plugin.highlightHistory.canRedo("Reading/UndoRedoTest.md")).toBe(true);

      // 3. Redo addition
      const redoRes = plugin.redoReadingHighlight(mockView);
      expect(redoRes).toBe(true);
      const restored = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(restored).toHaveLength(1);
      expect(restored[0].text).toBe("machine learning");
      expect(restored[0].color).toBe("yellow");
      expect(plugin.highlightHistory.canUndo("Reading/UndoRedoTest.md")).toBe(true);
      expect(plugin.highlightHistory.canRedo("Reading/UndoRedoTest.md")).toBe(false);
    });

    it("undo and redo: reverts color update and then restores new color", () => {
      // 1. Add initial yellow highlight
      plugin.applyLiveReadingHighlight("yellow", "Neural network", null, mockView);
      // 2. Update to green highlight
      plugin.applyLiveReadingHighlight("green", "Neural network", null, mockView);

      let current = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(current).toHaveLength(1);
      expect(current[0].color).toBe("green");

      // 3. Undo: reverts color back to yellow
      plugin.undoReadingHighlight(mockView);
      current = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(current[0].color).toBe("yellow");

      // 4. Redo: reapplies green color
      plugin.redoReadingHighlight(mockView);
      current = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(current[0].color).toBe("green");
    });

    it("undo and redo: reverts clearLiveReadingHighlight removal", () => {
      plugin.applyLiveReadingHighlight("pink", "architectures", null, mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(1);

      // Remove via eraser / clear
      plugin.clearLiveReadingHighlight("architectures", mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);

      // Undo removal
      plugin.undoReadingHighlight(mockView);
      const afterUndo = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(afterUndo).toHaveLength(1);
      expect(afterUndo[0].text).toBe("architectures");
      expect(afterUndo[0].color).toBe("pink");

      // Redo removal
      plugin.redoReadingHighlight(mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);
    });

    it("undo and redo: reverts clearAllReadingHighlights", () => {
      plugin.applyLiveReadingHighlight("yellow", "Neural network", null, mockView);
      plugin.applyLiveReadingHighlight("blue", "inference", null, mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(2);

      // Clear all
      plugin.clearAllReadingHighlights(mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);

      // Undo clear all
      plugin.undoReadingHighlight(mockView);
      const restored = plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md");
      expect(restored).toHaveLength(2);

      // Redo clear all
      plugin.redoReadingHighlight(mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);
    });

    it("returns false and shows notice when there is nothing to undo or redo", () => {
      expect(plugin.undoReadingHighlight(mockView)).toBe(false);
      expect(plugin.redoReadingHighlight(mockView)).toBe(false);
    });

    it("intercepts keyboard shortcuts Ctrl+Z and Ctrl+Y in reading mode", () => {
      plugin.applyLiveReadingHighlight("orange", "inference", null, mockView);
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(1);

      const keydownEvent = plugin.domEvents.find((e) => e.type === "keydown");
      expect(keydownEvent).toBeDefined();

      const preventDefaultUndo = vi.fn();
      const stopPropagationUndo = vi.fn();

      // Trigger Ctrl+Z
      keydownEvent!.callback({
        ctrlKey: true,
        key: "z",
        target: document.createElement("div"),
        preventDefault: preventDefaultUndo,
        stopPropagation: stopPropagationUndo,
      });

      expect(preventDefaultUndo).toHaveBeenCalled();
      expect(stopPropagationUndo).toHaveBeenCalled();
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(0);

      // Trigger Ctrl+Y
      const preventDefaultRedo = vi.fn();
      const stopPropagationRedo = vi.fn();

      keydownEvent!.callback({
        ctrlKey: true,
        key: "y",
        target: document.createElement("div"),
        preventDefault: preventDefaultRedo,
        stopPropagation: stopPropagationRedo,
      });

      expect(preventDefaultRedo).toHaveBeenCalled();
      expect(stopPropagationRedo).toHaveBeenCalled();
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(1);
    });

    it("does NOT intercept Ctrl+Z when focus is inside an input or textarea element", () => {
      plugin.applyLiveReadingHighlight("orange", "inference", null, mockView);

      const keydownEvent = plugin.domEvents.find((e) => e.type === "keydown");
      const inputEl = document.createElement("input");
      const preventDefault = vi.fn();

      keydownEvent!.callback({
        ctrlKey: true,
        key: "z",
        target: inputEl,
        preventDefault,
        stopPropagation: vi.fn(),
      });

      expect(preventDefault).not.toHaveBeenCalled();
      // Highlight was not undone
      expect(plugin.readingHighlightService.getHighlights("Reading/UndoRedoTest.md")).toHaveLength(1);
    });

    it("updates HighlighterPenPill history buttons state after operations", () => {
      const setHistorySpy = vi.spyOn(plugin.penPill, "setHistoryState");
      plugin.togglePenMode(true);

      // Add highlight
      plugin.applyLiveReadingHighlight("green", "inference", null, mockView);
      expect(setHistorySpy).toHaveBeenCalledWith(true, false);

      // Undo
      plugin.undoReadingHighlight(mockView);
      expect(setHistorySpy).toHaveBeenCalledWith(false, true);

      // Redo
      plugin.redoReadingHighlight(mockView);
      expect(setHistorySpy).toHaveBeenCalledWith(true, false);
    });
  });
});
