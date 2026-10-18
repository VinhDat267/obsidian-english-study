import { Plugin, Editor, MarkdownView, WorkspaceLeaf, Notice } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, LookupResult } from "./src/types";
import { ProviderManager } from "./src/services/provider/ProviderManager";
import { VocabService } from "./src/services/storage/VocabService";
import { FloatingTrigger } from "./src/ui/FloatingTrigger";
import { FloatingPopover } from "./src/ui/FloatingPopover";
import { EnglishStudySidebar, VIEW_TYPE_ENGLISH_STUDY } from "./src/ui/SidebarView";
import { EnglishStudySettingTab, PluginWithSettings } from "./src/ui/SettingsTab";
import { GeminiService } from "./src/services/provider/GeminiService";
import { RectLike } from "./src/utils/domHelper";

export default class EnglishStudyPlugin extends Plugin implements PluginWithSettings {
  settings: PluginSettings = DEFAULT_SETTINGS;
  providerManager!: ProviderManager;
  vocabService!: VocabService;
  geminiService!: GeminiService;
  floatingTrigger!: FloatingTrigger;
  floatingPopover!: FloatingPopover;
  sidebarView: EnglishStudySidebar | null = null;
  private lastLookupResult: LookupResult | null = null;
  private selectionDebounceTimer: any = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.geminiService = new GeminiService();
    this.providerManager = new ProviderManager(this.settings);
    this.vocabService = new VocabService(this.app, this.settings);
    this.floatingTrigger = new FloatingTrigger();
    this.floatingPopover = new FloatingPopover();

    // 1. Đăng ký View thanh bên (Sidebar View)
    this.registerView(VIEW_TYPE_ENGLISH_STUDY, (leaf: WorkspaceLeaf) => {
      const sidebar = new EnglishStudySidebar(leaf);
      sidebar.setCache(this.providerManager.getCache());
      sidebar.setSaveCallback(async (result: LookupResult) => {
        await this.vocabService.saveVocab(result, this.settings);
      });
      this.sidebarView = sidebar;
      return sidebar;
    });

    // 2. Thêm Ribbon Icon mở thanh bên
    this.addRibbonIcon("book-open", "Mở English Study Panel", () => {
      this.activateSidebarView();
    });

    // 3. Đăng ký các Commands
    // 3.1. Tra cứu văn bản bôi đen trong Editor
    this.addCommand({
      id: "lookup-selected-text",
      name: "Tra từ điển / Dịch câu bôi đen",
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
        editor: Editor,
        _view: MarkdownView
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

    // 3.3. Mở thanh bên English Study
    this.addCommand({
      id: "open-sidebar-view",
      name: "Mở thanh bên English Study",
      callback: () => {
        this.activateSidebarView();
      },
    });

    // 4. Đăng ký DOM events an toàn
    if (typeof document !== "undefined") {
      this.registerDomEvent(document, "mouseup", () => {
        this.handleSelectionDebounced();
      });

      this.registerDomEvent(document, "keyup", (e: KeyboardEvent) => {
        if (
          e.shiftKey &&
          (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
        ) {
          this.handleSelectionDebounced();
        }
      });

      this.registerDomEvent(
        document,
        "scroll",
        () => {
          this.dismissFloatingUi();
        },
        true
      );
    }

    // 5. Tự động ẩn UI nổi khi active leaf thay đổi
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.dismissFloatingUi();
      })
    );

    // 6. Đăng ký Setting Tab
    this.addSettingTab(new EnglishStudySettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.dismissFloatingUi();
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }
    this.lastLookupResult = null;
    this.sidebarView = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.vocabService) {
      this.vocabService.updateSettings(this.settings);
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

    return this.executeLookupAndShow(selectedText.trim(), paragraph, cursorOffset);
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
   * Core logic thực hiện gọi ProviderManager và hiển thị kết quả lên UI nổi + Sidebar
   */
  private async executeLookupAndShow(
    selectedText: string,
    paragraph: string,
    cursorOffset: number
  ): Promise<LookupResult | null> {
    if (this.floatingTrigger) {
      this.floatingTrigger.hide();
    }

    let result: LookupResult;
    try {
      result = await this.providerManager.lookup(
        selectedText,
        paragraph,
        cursorOffset,
        this.settings
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return null;
      }
      throw err;
    }

    this.lastLookupResult = result;

    const rect = this.getSelectionBoundingRect();
    this.floatingPopover.show(rect, result, {
      onSave: async (res: LookupResult) => {
        await this.vocabService.saveVocab(res, this.settings);
      },
      onPinToSidebar: (res: LookupResult) => {
        this.dismissFloatingUi();
        this.activateSidebarView().then(() => {
          if (this.sidebarView) {
            this.sidebarView.setResult(res);
          }
        });
      },
      onClose: () => {
        // Popover closed
      },
    });

    if (this.sidebarView) {
      this.sidebarView.setResult(result);
    }

    return result;
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
          readingContext = this.extractReadingModeContext(sel!);
        }
      }
    }

    if (!selectedText) {
      this.dismissFloatingTrigger();
      return;
    }

    if (this.settings.triggerMode === "hotkey-only") {
      this.dismissFloatingTrigger();
      return;
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

    if (this.settings.triggerMode === "auto-popup") {
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
  dismissFloatingUi(): void {
    if (this.floatingTrigger) {
      this.floatingTrigger.hide();
    }
    if (this.floatingPopover) {
      this.floatingPopover.hide();
    }
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
}
