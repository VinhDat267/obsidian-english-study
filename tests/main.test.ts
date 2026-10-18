import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, Editor, MarkdownView, WorkspaceLeaf, Notice, createMockObsidianElement } from "obsidian";
import EnglishStudyPlugin from "../main.ts";
import { DEFAULT_SETTINGS, LookupResult } from "../src/types";
import { VIEW_TYPE_ENGLISH_STUDY } from "../src/ui/SidebarView";

describe("EnglishStudyPlugin Integration (main.ts)", () => {
  let app: App;
  let plugin: EnglishStudyPlugin;
  let originalDocument: any;
  let originalWindow: any;
  let mockBody: any;
  let docListeners: Record<string, ((...args: any[]) => void)[]>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalDocument = (global as any).document;
    originalWindow = (global as any).window;

    docListeners = {};
    mockBody = createMockObsidianElement("body");

    (global as any).document = {
      createElement: vi.fn((tag: string) => createMockObsidianElement(tag)),
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

      // Ribbon icon
      expect(plugin.ribbonIcons.length).toBe(1);
      expect(plugin.ribbonIcons[0].icon).toBe("book-open");
      expect(plugin.ribbonIcons[0].title).toBe("Mở Polyglot Study Panel");

      // Commands (7 commands: lookup-selected-text, save-to-vocabulary, open-sidebar-view, toggle-ai-grammar, toggle-ai-translation, toggle-auto-translate, bilingual-translate-file)
      expect(plugin.commands.length).toBe(8);
      const commandIds = plugin.commands.map((c) => c.id);
      expect(commandIds).toContain("lookup-selected-text");
      expect(commandIds).toContain("save-to-vocabulary");
      expect(commandIds).toContain("open-sidebar-view");
      expect(commandIds).toContain("toggle-ai-grammar");
      expect(commandIds).toContain("toggle-ai-translation");
      expect(commandIds).toContain("toggle-auto-translate");
      expect(commandIds).toContain("bilingual-translate-file");

      // DOM events (mouseup, keyup, scroll)
      expect(plugin.domEvents.length).toBe(3);
      const eventTypes = plugin.domEvents.map((e) => e.type);
      expect(eventTypes).toContain("mouseup");
      expect(eventTypes).toContain("keyup");
      expect(eventTypes).toContain("scroll");

      const scrollEvent = plugin.domEvents.find((e) => e.type === "scroll");
      expect(scrollEvent?.options).toBe(true);

      // Workspace events (active-leaf-change, editor-menu, file-menu)
      expect(plugin.events.length).toBe(3);

      // Settings tab
      expect(plugin.settingTabs.length).toBe(1);
    });

    it("should dismiss floating UI on scroll event", async () => {
      await plugin.onload();
      const dismissSpy = vi.spyOn(plugin, "dismissFloatingUi");

      const scrollEvent = plugin.domEvents.find((e) => e.type === "scroll");
      expect(scrollEvent).toBeDefined();

      scrollEvent!.callback();
      expect(dismissSpy).toHaveBeenCalled();
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
  });

  describe("dismissFloatingUi()", () => {
    it("should dismiss both floating trigger and popover", async () => {
      await plugin.onload();
      const triggerHideSpy = vi.spyOn(plugin.floatingTrigger, "hide");
      const popoverHideSpy = vi.spyOn(plugin.floatingPopover, "hide");

      plugin.dismissFloatingUi();

      expect(triggerHideSpy).toHaveBeenCalled();
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

    it("should detect reading view selection in handleSelectionDebounced and show trigger", () => {
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
        }),
      }));

      const triggerShowSpy = vi.spyOn(plugin.floatingTrigger, "show");

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(triggerShowSpy).toHaveBeenCalled();
    });

    it("should auto-popup in Reading mode when triggerMode is auto-popup", () => {
      plugin.settings.triggerMode = "auto-popup";
      (global as any).window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        toString: () => "serendipity",
        anchorNode: mockView.contentEl,
        getRangeAt: () => ({
          commonAncestorContainer: {
            nodeType: 1,
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
        }),
      }));

      const performSpy = vi.spyOn(plugin, "performLookupFromReading").mockResolvedValue(null);

      plugin.handleSelectionDebounced();
      vi.advanceTimersByTime(150);

      expect(performSpy).toHaveBeenCalledWith(
        "serendipity",
        "Finding this book was sheer serendipity.",
        expect.any(Number)
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
});
