import { Plugin, Editor, MarkdownView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, LookupResult, DocumentContextMeta, TutorSession } from "./src/types";
import { ProviderManager } from "./src/services/provider/ProviderManager";
import { VocabService } from "./src/services/storage/VocabService";
import { FloatingTrigger } from "./src/ui/FloatingTrigger";
import { FloatingPopover } from "./src/ui/FloatingPopover";
import { EnglishStudySidebar, VIEW_TYPE_ENGLISH_STUDY } from "./src/ui/SidebarView";
import { EnglishStudySettingTab, PluginWithSettings } from "./src/ui/SettingsTab";
import { GeminiService } from "./src/services/provider/GeminiService";
import { BilingualTranslationService } from "./src/services/translation/BilingualTranslationService";
import { BilingualTranslationModal } from "./src/ui/BilingualTranslationModal";
import { writeBilingualFile } from "./src/services/translation/BilingualFileWriter";
import { RectLike } from "./src/utils/domHelper";
import { registerReadingTranslation } from "./src/reading/registerReadingTranslation";
import type { ReadingTranslationController } from "./src/reading/ReadingTranslationController";
import {
  applyHighlight,
  HighlightAction,
  HighlightColorKey,
  HIGHLIGHT_COLORS,
} from "./src/utils/textHighlighter";
import { ReadingHighlightService } from "./src/services/storage/ReadingHighlightService";
import {
  createReadingHighlightPostProcessor,
  applyHighlightsToElement,
} from "./src/reading/readingHighlightPostProcessor";
import { FloatingHighlightToolbar } from "./src/ui/FloatingHighlightToolbar";
import { HighlighterPenPill } from "./src/ui/HighlighterPenPill";
import {
  wrapRangeWithHighlight,
  unwrapHighlightsByIds,
  unwrapAllHighlights,
} from "./src/utils/domHighlightHelper";
import { RightClickPenHandler } from "./src/reading/RightClickPenHandler";
import { AiTutorChatService } from "./src/services/ai/AiTutorChatService";

export default class EnglishStudyPlugin extends Plugin implements PluginWithSettings {
  readingTranslationController?: ReadingTranslationController;
  readingHighlightService!: ReadingHighlightService;
  settings: PluginSettings = DEFAULT_SETTINGS;
  providerManager!: ProviderManager;
  vocabService!: VocabService;
  geminiService!: GeminiService;
  private aiTutorChatService!: AiTutorChatService;
  bilingualTranslationService!: BilingualTranslationService;
  floatingTrigger!: FloatingTrigger;
  floatingPopover!: FloatingPopover;
  floatingHighlightToolbar!: FloatingHighlightToolbar;
  penPill!: HighlighterPenPill;
  rightClickPenHandler!: RightClickPenHandler;
  isPenModeActive: boolean = false;
  currentPenAction: HighlightAction = "yellow";
  ribbonPenIconEl: HTMLElement | null = null;
  sidebarView: EnglishStudySidebar | null = null;
  private lastLookupResult: LookupResult | null = null;
  private selectionDebounceTimer: any = null;
  private lookupGeneration = 0;
  private lookupDisposed = false;
  private settingsWrite: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    this.lookupDisposed = false;
    await this.loadSettings();

    this.geminiService = new GeminiService();
    this.bilingualTranslationService = new BilingualTranslationService(undefined, this.geminiService);
    this.providerManager = new ProviderManager(this.settings);
    this.aiTutorChatService = new AiTutorChatService();
    this.vocabService = new VocabService(this.app, this.settings);
    this.readingHighlightService = new ReadingHighlightService(
      this.settings.readingHighlights || {},
      () => this.saveSettings().catch(() => { new Notice("Không thể lưu cấu hình/highlight. Dữ liệu hiện còn trong phiên đang mở."); })
    );
    this.readingHighlightService.migrateLegacyPaths(this.app.vault.getMarkdownFiles().map(file => file.path));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.readingHighlightService.renamePath(oldPath, file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      this.readingHighlightService.removePath(file.path);
    }));
    this.floatingTrigger = new FloatingTrigger();
    this.floatingPopover = new FloatingPopover();
    this.floatingHighlightToolbar = new FloatingHighlightToolbar();
    this.penPill = new HighlighterPenPill();
    this.rightClickPenHandler = new RightClickPenHandler({
      isPenActive: () => this.isPenModeActive,
      getPenAction: () =>
        this.currentPenAction || this.settings.highlighterPenColor || "yellow",
      onHighlight: (action, text, range, view) => {
        if (action === "clear") {
          this.clearLiveReadingHighlight(text, view);
        } else {
          this.applyLiveReadingHighlight(action, text, range, view);
        }
      },
      getActiveView: () => this.app.workspace.getActiveViewOfType(MarkdownView),
    });
    this.readingTranslationController = registerReadingTranslation(this, () => this.settings);
    this.registerMarkdownPostProcessor(
      createReadingHighlightPostProcessor(this.readingHighlightService)
    );

    // 1. Đăng ký View thanh bên (Sidebar View)
    this.registerView(VIEW_TYPE_ENGLISH_STUDY, (leaf: WorkspaceLeaf) => {
      const sidebar = new EnglishStudySidebar(leaf);
      sidebar.setCache(this.providerManager.getCache());
      sidebar.setSaveCallback(async (result: LookupResult) => {
        await this.vocabService.saveVocab(result, this.settings);
      });
      sidebar.setTutorDependencies(
        this.aiTutorChatService,
        this.providerManager.getGeminiService(),
        this.settings.geminiApiKey
      );
      this.sidebarView = sidebar;
      return sidebar;
    });

    // 2. Thêm Ribbon Icons
    this.addRibbonIcon("book-open", "Mở Polyglot Study Panel", () => {
      this.activateSidebarView();
    });

    this.ribbonPenIconEl = this.addRibbonIcon(
      "highlighter",
      "Bật/Tắt chế độ bút dạ quang (Reading)",
      () => {
        this.togglePenMode();
      }
    );

    // 3. Đăng ký các Commands
    // 3.1. Tra cứu văn bản bôi đen trong Editor
    this.addCommand({
      id: "lookup-selected-text",
      name: "Tra từ điển / Dịch câu bôi đen (Đa ngôn ngữ)",
      checkCallback: (checking: boolean) => {
        if (typeof window === "undefined" || !window.getSelection) {
          return false;
        }
        const sel = window.getSelection();
        const domText =
          sel && typeof sel.toString === "function" ? sel.toString().trim() : "";
        if (domText && domText !== "[object Object]") {
          if (checking) return true;
          const ctx = this.extractReadingModeContext(sel!);
          this.performLookupFromReading(domText, ctx.paragraph, ctx.cursorOffset);
          return true;
        }
        return false;
      },
      editorCheckCallback: (
        checking: boolean,
        editor: Editor
      ) => {
        const selection = editor.getSelection ? editor.getSelection() : "";
        const hasSelection = Boolean(selection && selection.trim().length > 0);
        if (checking) {
          return hasSelection;
        }
        if (hasSelection) {
          this.performLookup(editor);
        }
        return true;
      },
    });

    // 3.2. Lưu từ vựng vừa tra vào sổ từ vựng
    this.addCommand({
      id: "save-to-vocabulary",
      name: "Lưu từ vựng vào sổ",
      checkCallback: (checking: boolean) => {
        const canSave = Boolean(this.lastLookupResult);
        if (checking) {
          return canSave;
        }
        if (this.lastLookupResult) {
          this.vocabService.saveVocab(this.lastLookupResult, this.settings);
        }
        return true;
      },
    });

    // 3.3. Mở thanh bên Polyglot Study
    this.addCommand({
      id: "open-sidebar-view",
      name: "Mở thanh bên Polyglot Study",
      callback: () => {
        this.activateSidebarView();
      },
    });

    // 3.4. Bật/tắt phân tích ngữ pháp AI
    this.addCommand({
      id: "toggle-ai-grammar",
      name: "Bật/tắt phân tích ngữ pháp AI",
      callback: async () => {
        this.settings.enableAiGrammar = !this.settings.enableAiGrammar;
        await this.saveSettings();
        new Notice(`Phân tích ngữ pháp AI: ${this.settings.enableAiGrammar ? "BẬT" : "TẮT"}`);
      },
    });

    // 3.5. Bật/tắt dịch nghĩa với AI (Domain-Aware Translation)
    this.addCommand({
      id: "toggle-ai-translation",
      name: "Bật/tắt dịch nghĩa với AI",
      callback: async () => {
        this.settings.enableAiTranslation = !this.settings.enableAiTranslation;
        await this.saveSettings();
        new Notice(`Dịch nghĩa với AI: ${this.settings.enableAiTranslation ? "BẬT" : "TẮT"}`);
      },
    });

    // 3.6. Bật/tắt tự động dịch khi bôi đen (Auto-translate on selection)
    this.addCommand({
      id: "toggle-auto-translate",
      name: "Bật/tắt tự động dịch khi bôi đen",
      callback: async () => {
        this.settings.autoTranslateOnSelection = !this.settings.autoTranslateOnSelection;
        await this.saveSettings();
        new Notice(`Tự động dịch khi bôi đen: ${this.settings.autoTranslateOnSelection ? "BẬT" : "TẮT"}`);
      },
    });

    // 3.7. Bật/tắt chế độ bút dạ quang (Continuous Highlighter Pen Mode)
    this.addCommand({
      id: "toggle-highlighter-pen-mode",
      name: "Bật/Tắt chế độ bút dạ quang (Tự động highlight khi bôi đen)",
      callback: () => {
        this.togglePenMode();
      },
    });

    // 3.8. Dịch song ngữ toàn bộ file Markdown (Bilingual File Translation)
    this.addCommand({
      id: "bilingual-translate-file",
      name: "Dịch song ngữ file Markdown hiện tại (Bilingual File Translation)",
      checkCallback: (checking: boolean) => {
        const activeFile =
          (this.app.workspace.getActiveFile && this.app.workspace.getActiveFile()) ||
          (this.app.workspace.getActiveViewOfType(MarkdownView) as any)?.file;
        const canTranslate = Boolean(
          activeFile &&
            (activeFile.extension === "md" || (activeFile.name && activeFile.name.endsWith(".md")))
        );
        if (checking) return canTranslate;
        if (canTranslate) {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          const editor = activeView?.editor;
          this.openBilingualTranslationModal(activeFile, editor);
        }
        return true;
      },
    });

    // 3.8. Highlight văn bản đang chọn khi đọc (Màu vàng / Toggle)
    this.addCommand({
      id: "highlight-selection-yellow",
      name: "Highlight văn bản đang chọn khi đọc (Màu vàng / Toggle)",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const isPreview = Boolean(
          view?.file && (view.getMode ? view.getMode() === "preview" : (view as any).mode === "preview")
        );
        if (checking) return isPreview;
        if (isPreview && view) {
          this.highlightReadingSelection("yellow", view);
        }
        return true;
      },
    });

    // 3.9. Xóa highlight văn bản đang chọn khi đọc
    this.addCommand({
      id: "clear-highlight-selection",
      name: "Xóa highlight văn bản đang chọn khi đọc",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const isPreview = Boolean(
          view?.file && (view.getMode ? view.getMode() === "preview" : (view as any).mode === "preview")
        );
        if (checking) return isPreview;
        if (isPreview && view) {
          this.highlightReadingSelection("clear", view);
        }
        return true;
      },
    });

    // 3.10. Xóa toàn bộ highlight trong ghi chú hiện tại
    this.addCommand({
      id: "clear-all-reading-highlights",
      name: "Xóa toàn bộ highlight trong ghi chú hiện tại",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const isPreview = Boolean(
          view?.file && (view.getMode ? view.getMode() === "preview" : (view as any).mode === "preview")
        );
        if (checking) return isPreview;
        if (isPreview && view) {
          this.clearAllReadingHighlights(view);
        }
        return true;
      },
    });

    // 4. Đăng ký Context Menus cho Editor và File Explorer
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: any, editor: Editor, view) => {
        menu.addItem((item: any) => {
          item
            .setTitle("Dịch song ngữ toàn bộ file")
            .setIcon("languages")
            .onClick(() => {
              const file =
                (view as any)?.file ||
                (this.app.workspace.getActiveFile && this.app.workspace.getActiveFile());
              if (file) {
                this.openBilingualTranslationModal(file, editor);
              }
            });
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: any, file: any) => {
        if (file && (file.extension === "md" || (file.name && file.name.endsWith(".md")))) {
          menu.addItem((item: any) => {
            item
              .setTitle("Dịch song ngữ file Markdown")
              .setIcon("languages")
              .onClick(() => {
                this.openBilingualTranslationModal(file);
              });
          });
        }
      })
    );

    // 5. Đăng ký DOM events an toàn
    if (typeof document !== "undefined") {
      this.registerDomEvent(document, "mousedown", (e: MouseEvent) => {
        this.rightClickPenHandler?.handleMouseDown(e);
      });

      this.registerDomEvent(document, "mousemove", (e: MouseEvent) => {
        this.rightClickPenHandler?.handleMouseMove(e);
      });

      this.registerDomEvent(
        document,
        "contextmenu",
        (e: MouseEvent) => {
          this.rightClickPenHandler?.handleContextMenu(e);
        },
        true
      );

      this.registerDomEvent(document, "mouseup", (e: MouseEvent) => {
        if (e && e.button === 2) {
          this.rightClickPenHandler?.handleMouseUp(e);
        } else {
          this.handleSelectionDebounced();
        }
      });

      this.registerDomEvent(document, "keyup", (e: KeyboardEvent) => {
        if (
          e.shiftKey &&
          (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
        ) {
          this.handleSelectionDebounced();
        }
      });

      this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape" && this.isPenModeActive) {
          this.togglePenMode(false);
        }
      });

      this.registerDomEvent(
        document,
        "scroll",
        (e: Event) => {
          const target = e?.target as Node | null;
          const popoverEl = this.floatingPopover?.getElement();
          const toolbarEl = this.floatingHighlightToolbar?.getElement();
          if (
            (popoverEl && target && (popoverEl === target || popoverEl.contains(target))) ||
            (toolbarEl && target && (toolbarEl === target || toolbarEl.contains(target)))
          ) {
            return;
          }
          this.dismissFloatingUi();
        },
        true
      );
    }

    // 6. Tự động ẩn UI nổi và đảm bảo khôi phục highlight khi chuyển tab hoặc mở file
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: any) => {
        this.dismissFloatingUi();
        this.restoreHighlightsForActiveView(leaf?.view);
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.dismissFloatingUi();
        this.restoreHighlightsForActiveView();
      })
    );

    if (this.app.workspace?.onLayoutReady) {
      this.app.workspace.onLayoutReady(() => {
        this.restoreHighlightsForAllViews();
      });
    }

    // 7. Đăng ký Setting Tab
    this.addSettingTab(new EnglishStudySettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.lookupDisposed = true;
    this.readingTranslationController?.unload();
    this.dismissFloatingUi();
    this.penPill?.hide();
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }
    this.lastLookupResult = null;
    this.sidebarView = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.readingHighlightService && this.settings.readingHighlights) {
      this.readingHighlightService.setAllHighlights(this.settings.readingHighlights);
    }
  }

  async saveSettings(): Promise<void> {
    if (this.readingHighlightService) {
      this.settings.readingHighlights = this.readingHighlightService.getAllHighlights();
    }
    const snapshot: PluginSettings = JSON.parse(JSON.stringify(this.settings));
    const write = this.settingsWrite.catch(() => {}).then(() => this.saveData(snapshot));
    this.settingsWrite = write;
    await write;
    this.readingTranslationController?.updateSettings();
    this.providerManager?.updateSettings(this.settings);
    if (this.vocabService) {
      this.vocabService.updateSettings(this.settings);
    }
    if (this.sidebarView) {
      this.sidebarView.setTutorDependencies(
        this.aiTutorChatService,
        this.providerManager.getGeminiService(),
        this.settings.geminiApiKey
      );
    }
  }

  /**
   * Kích hoạt và hiển thị Sidebar View ở thanh bên phải (Right Sidebar)
   */
  async activateSidebarView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_ENGLISH_STUDY);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf && typeof leaf.setViewState === "function") {
        await leaf.setViewState({
          type: VIEW_TYPE_ENGLISH_STUDY,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      if (leaf.view instanceof EnglishStudySidebar) {
        this.sidebarView = leaf.view;
        this.sidebarView.setTutorDependencies(
          this.aiTutorChatService,
          this.providerManager.getGeminiService(),
          this.settings.geminiApiKey
        );
      }
    }
  }

  /**
   * Thực hiện tra cứu văn bản đang chọn trong Editor (Edit mode):
   * 1. Ẩn floatingTrigger nếu đang hiện.
   * 2. Lấy selected text, vị trí cursor, đoạn văn bao quanh cursor.
   * 3. Gọi providerManager.lookup(selectedText, paragraph, cursorOffset, this.settings).
   * 4. Lưu lastLookupResult = result.
   * 5. Hiển thị FloatingPopover tại vị trí con trỏ/vùng chọn.
   * 6. Đồng bộ sang SidebarView nếu đang mở.
   */
  async performLookup(editor: Editor): Promise<LookupResult | null> {
    const selectedText = editor.getSelection ? editor.getSelection() : "";
    if (!selectedText || !selectedText.trim()) {
      return null;
    }

    let paragraph = "";
    let cursorOffset = 0;

    if (typeof editor.getCursor === "function") {
      const cursor = editor.getCursor();
      if (cursor && typeof editor.getLine === "function") {
        const lineCount =
          typeof editor.lineCount === "function" ? editor.lineCount() : 1;
        let startLine = cursor.line;
        while (startLine > 0) {
          const prev = editor.getLine(startLine - 1);
          if (prev === undefined || prev.trim() === "") break;
          startLine--;
        }
        let endLine = cursor.line;
        while (endLine < lineCount - 1) {
          const next = editor.getLine(endLine + 1);
          if (next === undefined || next.trim() === "") break;
          endLine++;
        }

        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          const lineText = editor.getLine(i) || "";
          if (i < cursor.line) {
            cursorOffset += lineText.length + 1;
          } else if (i === cursor.line) {
            cursorOffset += cursor.ch;
          }
          lines.push(lineText);
        }
        paragraph = lines.join("\n");
      }
    }

    if (!paragraph) {
      paragraph = selectedText;
    }

    return this.executeLookupAndShow(selectedText.trim(), paragraph, cursorOffset, editor);
  }

  /**
   * Thực hiện tra cứu văn bản khi đang ở Reading Mode (Preview mode)
   */
  async performLookupFromReading(
    selectedText: string,
    paragraph: string,
    cursorOffset: number = 0
  ): Promise<LookupResult | null> {
    if (!selectedText || !selectedText.trim()) {
      return null;
    }
    return this.executeLookupAndShow(
      selectedText.trim(),
      paragraph || selectedText.trim(),
      cursorOffset
    );
  }

  /**
   * Trích xuất thông tin ngữ cảnh tài liệu (Domain-Aware Context)
   * phục vụ AI nhận diện đúng chuyên ngành (IT, Y khoa, Luật...)
   */
  extractDocumentContext(editor?: Editor): DocumentContextMeta {
    const meta: DocumentContextMeta = {};

    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const title = activeFile.basename || activeFile.name;
        meta.noteTitle = title;
        meta.fileTitle = title;
        if (activeFile.parent && activeFile.parent.path && activeFile.parent.path !== "/") {
          meta.folderPath = activeFile.parent.path;
        }

        // Lấy tags từ frontmatter nếu metadataCache có sẵn
        const fileCache = this.app.metadataCache?.getFileCache(activeFile);
        if (fileCache?.frontmatter?.tags) {
          const rawTags = fileCache.frontmatter.tags;
          if (Array.isArray(rawTags)) {
            meta.tags = rawTags.map((t) => String(t));
          } else if (typeof rawTags === "string") {
            meta.tags = rawTags.split(",").map((t) => t.trim());
          }
        }
      }

      // Trích xuất heading gần nhất phía trên vị trí con trỏ nếu ở Edit Mode
      if (editor && typeof editor.getCursor === "function" && typeof editor.getLine === "function") {
        const cursor = editor.getCursor();
        for (let line = cursor.line; line >= 0; line--) {
          const lineText = editor.getLine(line);
          if (lineText && /^#{1,6}\s+/.test(lineText.trim())) {
            const heading = lineText.trim().replace(/^#{1,6}\s+/, "");
            meta.heading = heading;
            meta.headingContext = heading;
            break;
          }
        }
      } else {
        // Fallback cho Reading Mode: tìm heading gần nhất trong DOM preview
        try {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          const previewEl: HTMLElement | undefined = activeView?.previewMode?.containerEl;
          const sel = activeView?.containerEl?.ownerDocument?.defaultView?.getSelection?.();
          const anchorNode = sel?.anchorNode;
          if (previewEl && anchorNode) {
            const headings = Array.from(previewEl.querySelectorAll("h1,h2,h3,h4,h5,h6"));
            let nearestHeading = "";
            for (const h of headings) {
              if (h.compareDocumentPosition(anchorNode) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */) {
                nearestHeading = h.textContent?.trim() || "";
              }
            }
            if (nearestHeading) {
              meta.heading = nearestHeading;
              meta.headingContext = nearestHeading;
            }
          }
        } catch {
          // fallback an toàn
        }
      }
    } catch {
      // Fallback an toàn nếu môi trường test hoặc lỗi API metadata
    }

    return meta;
  }

  /**
   * Core logic thực hiện gọi ProviderManager và hiển thị kết quả lên UI nổi + Sidebar
   */
  private async executeLookupAndShow(
    selectedText: string,
    paragraph: string,
    cursorOffset: number,
    editor?: Editor
  ): Promise<LookupResult | null> {
    if (this.lookupDisposed) return null;
    const generation = ++this.lookupGeneration;
    const isCurrent = () => generation === this.lookupGeneration && !this.lookupDisposed;
    let latestAiResult: LookupResult | undefined;
    let shown = false;
    if (this.floatingTrigger) {
      this.floatingTrigger.hide();
    }

    const rect = this.getSelectionBoundingRect();

    // Hiển thị ngay trạng thái Loading tại vị trí vùng chọn
    this.floatingPopover.showLoading(rect, selectedText, {
      onClose: () => {
        if (isCurrent()) this.invalidateLookup();
      },
    });

    const docContext = this.extractDocumentContext(editor);

    let result: LookupResult;
    try {
      result = await this.providerManager.lookup(
        selectedText,
        paragraph,
        cursorOffset,
        this.settings,
        docContext,
        (updatedResult: LookupResult) => {
          if (!isCurrent()) return;
          latestAiResult = updatedResult;
          this.lastLookupResult = updatedResult;
          if (!shown) return;
          this.floatingPopover.updateAiContent(updatedResult, {
            enableAiGrammar: this.settings.enableAiGrammar,
            enableAiTranslation: this.settings.enableAiTranslation,
          });
          if (this.sidebarView) {
            this.sidebarView.setResult(updatedResult);
          }
        }
      );
    } catch (err: any) {
      if (!isCurrent()) return null;
      this.floatingPopover.hide();
      if (err?.name === "AbortError") {
        return null;
      }
      throw err;
    }

    if (!isCurrent()) return null;
    result = latestAiResult ?? result;
    this.lastLookupResult = result;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isReadingMode = activeView
      ? (activeView.getMode ? activeView.getMode() === "preview" : (activeView as any).mode === "preview")
      : !editor;

    this.floatingPopover.show(
      rect,
      result,
      {
        onSave: async (res: LookupResult) => {
          await this.vocabService.saveVocab(res, this.settings);
        },
        onPinToSidebar: (res: LookupResult) => {
          if (!isCurrent()) return;
          this.dismissFloatingUi(false);
          this.activateSidebarView().then(() => {
            if (!isCurrent()) return;
            if (this.sidebarView) {
              this.sidebarView.setResult(latestAiResult ?? res);
            }
          });
        },
        onPinToSidebarChat: (session: TutorSession) => {
          this.dismissFloatingUi(false);
          this.activateSidebarView().then(() => {
            if (this.sidebarView) {
              this.sidebarView.setTutorDependencies(
                this.aiTutorChatService,
                this.providerManager.getGeminiService(),
                this.settings.geminiApiKey
              );
              this.sidebarView.openTutorSession(session);
            }
          });
        },
        onHighlight: (action: HighlightAction) => {
          if (isReadingMode) {
            this.highlightReadingSelection(action, activeView || undefined);
          }
        },
        onClose: () => {
          if (isCurrent()) this.invalidateLookup();
        },
      },
      {
        enableAiGrammar: this.settings.enableAiGrammar,
        enableAiTranslation: this.settings.enableAiTranslation,
        isReadingMode,
        chatService: this.aiTutorChatService,
        geminiService: this.providerManager.getGeminiService(),
        apiKey: this.settings.geminiApiKey,
      }
    );
    shown = true;

    if (this.sidebarView) {
      this.sidebarView.setResult(result);
    }

    return result;
  }

  /**
   * Áp dụng highlight trực tiếp trên live DOM (0ms, không reload, không giật màn hình)
   */
  applyLiveReadingHighlight(
    color: HighlightColorKey,
    selectedText: string,
    range: Range | null,
    view?: MarkdownView
  ): boolean {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!this.canMutateReadingHighlight(activeView, range)) return false;
    const file = activeView?.file || (this.app.workspace.getActiveFile && this.app.workspace.getActiveFile());
    if (!file || !file.path || !selectedText || selectedText.trim().length < 2) return false;

    // 1. Lưu vào service
    const { action, item } = this.readingHighlightService.addHighlight(file.path, selectedText, color);
    const highlightId = item?.id || `hl-${Date.now()}`;
    const bg = HIGHLIGHT_COLORS[color]?.bg || "rgba(250, 204, 21, 0.4)";

    // 2. Live DOM Wrap (Mượt mà 0ms, không reload)
    if (action === "removed") {
      if (activeView?.contentEl && item) unwrapHighlightsByIds(activeView.contentEl, [item.id]);
    } else {
      if (range) {
        wrapRangeWithHighlight(range, highlightId, color, bg);
      } else if (activeView?.contentEl) {
        applyHighlightsToElement(activeView.contentEl, this.readingHighlightService.getHighlights(file.path));
      }
    }

    this.floatingHighlightToolbar?.hide();
    return true;
  }

  private canMutateReadingHighlight(view: MarkdownView | null | undefined, range?: Range | null): boolean {
    if (!view || view.getMode() !== "preview") return false;
    if (!range) return true;
    const root: HTMLElement = view.contentEl;
    const editable = '.cm-editor, [contenteditable]:not([contenteditable="false"])';
    const accepts = (node: Node) => {
      const element = node.nodeType === 1 ? node as Element : node.parentElement;
      return root.contains(node) && Boolean(element) && !element!.closest(editable);
    };
    try {
      if (!accepts(range.startContainer) || !accepts(range.endContainer)) return false;
      return !Array.from(root.querySelectorAll(editable)).some(element => range.intersectsNode(element));
    } catch { return false; }
  }

  /**
   * Xóa highlight trực tiếp trên live DOM (0ms, không reload)
   */
  clearLiveReadingHighlight(selectedText: string, view?: MarkdownView): boolean {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || activeView.getMode() !== "preview") return false;
    const file = activeView?.file || (this.app.workspace.getActiveFile && this.app.workspace.getActiveFile());
    if (!file || !file.path || !selectedText) return false;

    const removed = this.readingHighlightService.removeHighlights(file.path, selectedText);
    if (activeView?.contentEl) {
      unwrapHighlightsByIds(activeView.contentEl, removed.map(item => item.id));
    }
    this.floatingHighlightToolbar?.hide();
    return true;
  }

  /**
   * Xóa toàn bộ highlight trong ghi chú hiện tại (0ms, không reload)
   */
  clearAllReadingHighlights(view?: MarkdownView): boolean {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file || (this.app.workspace.getActiveFile && this.app.workspace.getActiveFile());
    if (!file || !file.path) return false;

    this.readingHighlightService.clearHighlightsForFile(file.path);
    if (activeView?.contentEl) {
      unwrapAllHighlights(activeView.contentEl);
    }
    this.floatingHighlightToolbar?.hide();
    new Notice("Đã xóa toàn bộ highlight trong ghi chú hiện tại.", 2500);
    return true;
  }

  /**
   * Khôi phục highlight cho view đang mở (Reading Mode)
   */
  restoreHighlightsForActiveView(customView?: any): void {
    const view =
      customView instanceof MarkdownView
        ? customView
        : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;

    const isPreview = view.getMode
      ? view.getMode() === "preview"
      : (view as any).mode === "preview";
    if (!isPreview) return;

    const highlights = this.readingHighlightService?.getHighlights(view.file.path);
    if (highlights && highlights.length > 0 && view.contentEl) {
      applyHighlightsToElement(view.contentEl, highlights);
    }
  }

  /**
   * Khôi phục highlight cho toàn bộ các Markdown view đang mở
   */
  restoreHighlightsForAllViews(): void {
    const leaves = this.app.workspace.getLeavesOfType
      ? this.app.workspace.getLeavesOfType("markdown")
      : [];
    for (const leaf of leaves) {
      if (leaf.view instanceof MarkdownView) {
        this.restoreHighlightsForActiveView(leaf.view);
      }
    }
  }

  /**
   * Bật/Tắt chế độ bút dạ quang (Highlighter Pen Mode)
   */
  togglePenMode(forceState?: boolean): void {
    this.isPenModeActive = forceState !== undefined ? forceState : !this.isPenModeActive;
    if (this.ribbonPenIconEl) {
      if (this.isPenModeActive) {
        this.ribbonPenIconEl.classList.add("is-pen-active");
      } else {
        this.ribbonPenIconEl.classList.remove("is-pen-active");
      }
    }
    if (this.isPenModeActive) {
      this.dismissFloatingUi();
      this.currentPenAction = this.settings.highlighterPenColor || "yellow";
      this.penPill?.show(this.currentPenAction, {
        onColorChange: async (action) => {
          this.currentPenAction = action;
          if (action !== "clear") {
            this.settings.highlighterPenColor = action;
            await this.saveSettings();
          }
        },
        onClose: () => {
          this.togglePenMode(false);
        },
      });
      const modeLabel = HIGHLIGHT_COLORS[this.settings.highlighterPenColor || "yellow"]?.label || "Vàng";
      new Notice(
        `Đã BẬT chế độ bút dạ quang (${modeLabel}). Quét CHUỘT PHẢI để tô/tẩy highlight, Chuột trái bôi đen để tra từ dịch! (Nhấn Esc để tắt)`,
        4000
      );
    } else {
      this.penPill?.hide();
      new Notice("Đã TẮT chế độ bút dạ quang.", 2000);
    }
  }

  /**
   * Bôi màu highlight hoặc gỡ highlight trực quan trong Reading Mode (Không sửa file markdown)
   */
  highlightReadingSelection(action: HighlightAction = "yellow", view?: MarkdownView): boolean {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return false;

    const isPreview = activeView.getMode
      ? activeView.getMode() === "preview"
      : (activeView as any).mode === "preview";
    if (!isPreview) return false;

    let selectedText = "";
    let range: Range | null = null;
    if (typeof window !== "undefined" && window.getSelection) {
      const sel = window.getSelection();
      selectedText =
        sel && typeof sel.toString === "function" ? sel.toString().trim() : "";
      if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0).cloneRange();
      }
    }
    if (!selectedText && this.lastLookupResult) {
      selectedText = this.lastLookupResult.query;
    }
    if (!selectedText) return false;

    if (action === "clear") {
      return this.clearLiveReadingHighlight(selectedText, activeView);
    } else {
      return this.applyLiveReadingHighlight(action, selectedText, range, activeView);
    }
  }

  /**
   * Phương thức highlightSelection:
   * Chuyển hướng sang highlightReadingSelection nếu ở Reading mode,
   * và KHÔNG sửa trực tiếp file markdown ở bất kỳ chế độ nào.
   */
  highlightSelection(action: HighlightAction = "yellow", editor?: Editor): boolean {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isPreview =
      activeView &&
      (activeView.getMode
        ? activeView.getMode() === "preview"
        : (activeView as any).mode === "preview");
    if (isPreview && activeView) {
      return this.highlightReadingSelection(action, activeView);
    }
    return false;
  }

  /**
   * Bắt sự kiện bôi đen (debounced 150ms):
   * - Hỗ trợ cả 2 chế độ Edit Mode và Reading Mode.
   * - Lấy active MarkdownView, kiểm tra editor selection hoặc DOM selection.
   * - Nếu rỗng: ẩn floatingTrigger và return.
   * - Nếu settings.triggerMode === 'hotkey-only': ẩn trigger và return (chờ phím tắt).
   * - Nếu settings.triggerMode === 'auto-popup': gọi lookup ngay.
   * - Nếu settings.triggerMode === 'icon': lấy selection bounding rect, gọi floatingTrigger.show.
   */
  handleSelectionDebounced(): void {
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
    }
    this.selectionDebounceTimer = setTimeout(() => {
      this.processSelection();
    }, 150);
  }

  private processSelection(): void {
    // 0. Nếu popover đang được kéo hoặc vừa mới kết thúc kéo -> tuyệt đối không re-trigger selection
    if (
      this.floatingPopover &&
      (this.floatingPopover.isUserDragging() || this.floatingPopover.wasJustDragged())
    ) {
      return;
    }

    const activeView =
      (this.app.workspace.getActiveViewOfType &&
        this.app.workspace.getActiveViewOfType(MarkdownView)) ||
      (this.app.workspace.activeLeaf?.view instanceof MarkdownView
        ? this.app.workspace.activeLeaf.view
        : null);

    if (!activeView) {
      this.dismissFloatingTrigger();
      return;
    }

    // 1. Kiểm tra lựa chọn từ Editor (Edit mode)
    let selectedText = "";
    let isEditorMode = false;
    if (activeView.editor && typeof activeView.editor.getSelection === "function") {
      const editorSel = activeView.editor.getSelection();
      if (editorSel && editorSel.trim().length > 0) {
        selectedText = editorSel.trim();
        isEditorMode = true;
      }
    }

    // 2. Nếu không có selection trong editor -> kiểm tra DOM selection (Reading mode)
    let readingRange: Range | null = null;
    let readingContext: { paragraph: string; cursorOffset: number } | null = null;
    if (!isEditorMode && typeof window !== "undefined" && window.getSelection) {
      const sel = window.getSelection();
      const domSel =
        sel && typeof sel.toString === "function" ? sel.toString().trim() : "";
      if (domSel.length > 0 && domSel !== "[object Object]") {
        const anchorNode = sel?.anchorNode;
        const isInsideView =
          !activeView.contentEl ||
          !anchorNode ||
          !activeView.contentEl.contains ||
          activeView.contentEl.contains(anchorNode);

        if (isInsideView) {
          selectedText = domSel;
          if (sel && sel.rangeCount > 0) {
            try {
              readingRange = sel.getRangeAt(0).cloneRange();
            } catch {}
          }
          readingContext = this.extractReadingModeContext(sel!);
        }
      }
    }

    if (!selectedText) {
      this.dismissFloatingTrigger();
      this.floatingHighlightToolbar?.hide();
      return;
    }

    // 3. Nếu Popover đang hiển thị và đã chứa nội dung tra cứu của chính từ/câu này -> giữ nguyên vị trí, không re-lookup
    if (
      this.floatingPopover &&
      this.floatingPopover.isVisible() &&
      this.floatingPopover.getCurrentQuery() === selectedText
    ) {
      return;
    }

    if (this.settings.triggerMode === "hotkey-only") {
      this.dismissFloatingTrigger();
      this.floatingHighlightToolbar?.hide();
      return;
    }

    // 4. Nếu ở Reading mode -> xử lý Highlight
    if (!isEditorMode) {
      this.dismissFloatingTrigger();

      // 4.1. Nếu Chế độ Bút dạ quang (Continuous Highlighter Pen Mode) đang BẬT:
      // Chuột trái được giải phóng hoàn toàn: KHÔNG tự động tô màu hay tẩy!
      // Thao tác bôi đen bằng chuột trái dùng để đọc, copy hoặc hiển thị trigger/popover dịch:
      if (this.isPenModeActive) {
        this.floatingHighlightToolbar?.hide();
        // Không return, cho phép tiếp tục chạy xuống logic hiển thị trigger / popup dịch thuật bên dưới
      } else {
        // 4.2. Chế độ thông thường -> hiển thị thanh FloatingHighlightToolbar độc lập tức thì (0ms, không chờ dịch)
        const rect = this.getSelectionBoundingRect();
        this.floatingHighlightToolbar.show(
          rect,
          selectedText,
          readingRange,
          {
            onHighlight: (color) => {
              this.applyLiveReadingHighlight(color, selectedText, readingRange, activeView);
            },
            onClear: () => {
              this.clearLiveReadingHighlight(selectedText, activeView);
            },
            onLookup: () => {
              this.floatingHighlightToolbar.hide();
              this.performLookupFromReading(
                selectedText,
                readingContext?.paragraph || selectedText,
                readingContext?.cursorOffset || 0
              );
            },
          }
        );
        return;
      }
    }

    const performFn = () => {
      if (isEditorMode && activeView.editor) {
        return this.performLookup(activeView.editor);
      } else {
        return this.performLookupFromReading(
          selectedText,
          readingContext?.paragraph || selectedText,
          readingContext?.cursorOffset || 0
        );
      }
    };

    const isAutoTranslate =
      Boolean(this.settings.autoTranslateOnSelection) ||
      this.settings.triggerMode === "auto-popup";

    if (isAutoTranslate) {
      this.dismissFloatingTrigger();
      performFn();
      return;
    }

    if (this.settings.triggerMode === "icon") {
      const rect = this.getSelectionBoundingRect();
      this.floatingTrigger.show(rect, () => {
        performFn();
      });
    }
  }

  /**
   * Trích xuất ngữ cảnh đoạn văn và vị trí từ trong Reading Mode
   */
  extractReadingModeContext(sel: Selection): {
    paragraph: string;
    cursorOffset: number;
  } {
    try {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el: any =
          container && (container as any).nodeType === 3
            ? (container as any).parentElement
            : container;

        if (el) {
          const block =
            (typeof el.closest === "function" &&
              el.closest(
                "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, div.markdown-rendered > *"
              )) ||
            el;
          const paragraph = block?.textContent?.trim() || sel.toString().trim();
          const cursorOffset = Math.max(0, paragraph.indexOf(sel.toString().trim()));
          return { paragraph, cursorOffset };
        }
      }
    } catch {
      // fallback
    }
    const text = typeof sel.toString === "function" ? sel.toString().trim() : "";
    return { paragraph: text, cursorOffset: 0 };
  }

  private dismissFloatingTrigger(): void {
    if (this.floatingTrigger) {
      this.floatingTrigger.hide();
    }
  }

  /**
   * Ẩn các UI nổi (Trigger Icon và Popover) khi scroll hoặc đổi tab
   */
  dismissFloatingUi(cancelLookup = true): void {
    if (cancelLookup) this.invalidateLookup();
    if (this.floatingTrigger) {
      this.floatingTrigger.hide();
    }
    if (this.floatingPopover) {
      this.floatingPopover.hide();
    }
    if (this.floatingHighlightToolbar) {
      this.floatingHighlightToolbar.hide();
    }
  }

  private invalidateLookup(): void {
    this.lookupGeneration++;
    this.providerManager?.cancelPending();
  }

  private getSelectionBoundingRect(): RectLike {
    if (typeof window !== "undefined" && window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (
          rect &&
          (rect.width > 0 ||
            rect.height > 0 ||
            rect.top > 0 ||
            rect.left > 0)
        ) {
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        }
      }
    }

    return {
      top: 100,
      bottom: 120,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
    };
  }

  /**
   * Mở Modal cấu hình và điều khiển dịch song ngữ toàn bộ file Markdown
   */
  async openBilingualTranslationModal(file: TFile, editor?: Editor): Promise<void> {
    const diskContent = await this.app.vault.read(file);
    const fileContent = editor ? editor.getValue() : diskContent;
    const sourceView = editor ? this.app.workspace.getLeavesOfType("markdown")
      .map(leaf => leaf.view).find((view): view is MarkdownView => view instanceof MarkdownView && view.editor === editor && view.file === file) : undefined;
    const snapshot = { file, path: file.path, content: fileContent, diskContent, editor, view: sourceView };
    const docContext = this.extractDocumentContext(editor);

    const modal = new BilingualTranslationModal({
      app: this.app,
      settings: this.settings,
      fileName: file.name,
      fileContent,
      docContext,
      translationService: this.bilingualTranslationService,
      onComplete: async (newContent: string, destination: "inplace" | "new_file", signal?: AbortSignal) => {
        const newFile = await writeBilingualFile(this.app, snapshot, newContent, destination, signal);
        if (destination === "new_file") {
          const leaf = this.app.workspace.getLeaf
            ? this.app.workspace.getLeaf(true)
            : this.app.workspace.activeLeaf;
          if (leaf && leaf.openFile) {
            await leaf.openFile(newFile);
          }
        }
      },
    });

    this.register(() => modal.close());
    modal.open();
  }
}

