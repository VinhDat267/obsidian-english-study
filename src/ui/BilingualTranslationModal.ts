import { App, Modal, Notice, Setting } from "obsidian";
import { PluginSettings, DocumentContextMeta } from "../types";
import { parseMarkdownIntoBlocks, reassembleBilingualMarkdown } from "../utils/bilingualParser";
import { BilingualTranslationService } from "../services/translation/BilingualTranslationService";

export interface BilingualModalOptions {
  app: App;
  settings: PluginSettings;
  fileName: string;
  fileContent: string;
  docContext?: DocumentContextMeta;
  translationService: BilingualTranslationService;
  onComplete: (newContent: string, destination: "inplace" | "new_file") => Promise<void>;
}

export class BilingualTranslationModal extends Modal {
  private settings: PluginSettings;
  private fileName: string;
  private fileContent: string;
  private docContext?: DocumentContextMeta;
  private translationService: BilingualTranslationService;
  private onComplete: (newContent: string, destination: "inplace" | "new_file") => Promise<void>;

  private selectedEngine: "google" | "gemini" = "google";
  private selectedDestination: "inplace" | "new_file" = "inplace";
  private abortController: AbortController | null = null;

  constructor(options: BilingualModalOptions) {
    super(options.app);
    this.settings = options.settings;
    this.fileName = options.fileName;
    this.fileContent = options.fileContent;
    this.docContext = options.docContext;
    this.translationService = options.translationService;
    this.onComplete = options.onComplete;

    // Ưu tiên Gemini nếu user đã nhập API Key và bật AI
    if (this.settings.geminiApiKey?.trim() && this.settings.enableAiTranslation) {
      this.selectedEngine = "gemini";
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText("Dịch Song Ngữ File Markdown (Bilingual Translation)");

    const blocks = parseMarkdownIntoBlocks(this.fileContent);
    const translatableBlocks = blocks.filter(
      (b) => !b.skipTranslation && b.translatableText?.trim()
    );

    // 1. Thẻ thông tin file
    const infoBox = contentEl.createDiv({ cls: "bilingual-modal-info" });
    const p1 = infoBox.createEl("p");
    p1.createEl("strong", { text: "Tập tin: " });
    p1.createSpan({ text: this.fileName });

    const p2 = infoBox.createEl("p");
    p2.createEl("strong", { text: "Khối cần dịch: " });
    p2.createSpan({
      text: `${translatableBlocks.length} khối (Đã tự động loại trừ code block, math, bảng và các đoạn đã dịch)`,
    });

    const p3 = infoBox.createEl("p");
    p3.createEl("strong", { text: "Phong cách song ngữ: " });
    const styleLabelMap: Record<string, string> = {
      blockquote: "Trích dẫn nổi bật viền dọc (> *Lời dịch*)",
      colored: "Chữ màu dịu mắt (<font color>)",
      highlight: "Tô sáng (==Lời dịch==)",
      bold_prefix: "Tiền tố in đậm (**[VI]** Lời dịch)",
    };
    p3.createSpan({
      text: styleLabelMap[this.settings.bilingualTranslationStyle] || this.settings.bilingualTranslationStyle,
    });

    // 2. Lựa chọn Engine
    new Setting(contentEl)
      .setName("Công cụ dịch thuật (Engine)")
      .setDesc("Google Translate: Tốc độ cao, miễn phí. Gemini AI: Hiểu ngữ cảnh chuyên ngành xuất sắc (cần API Key).")
      .addDropdown((dropdown) => {
        dropdown.addOption("google", "Google Translate (Nhanh & Ổn định)");
        if (this.settings.geminiApiKey?.trim()) {
          dropdown.addOption("gemini", "Gemini 2.0 Flash AI (Chuyên ngành & Ngữ cảnh)");
        } else {
          dropdown.addOption("gemini", "Gemini AI (Chưa cấu hình API Key)");
        }
        dropdown.setValue(this.selectedEngine);
        dropdown.onChange((val) => {
          this.selectedEngine = val as "google" | "gemini";
        });
      });

    // 3. Điểm đến (Destination)
    new Setting(contentEl)
      .setName("Nơi lưu kết quả")
      .setDesc("Ghi đè trực tiếp hỗ trợ phím Ctrl + Z để hoàn tác lập tức. Hoặc tạo file song ngữ mới tách biệt.")
      .addDropdown((dropdown) => {
        dropdown.addOption("inplace", "Ghi đè trực tiếp vào file hiện tại (Hỗ trợ Ctrl + Z)");
        dropdown.addOption("new_file", "Tạo file mới ([Tên] (Bilingual).md)");
        dropdown.setValue(this.selectedDestination);
        dropdown.onChange((val) => {
          this.selectedDestination = val as "inplace" | "new_file";
        });
      });

    // 4. Action Buttons
    const actionsEl = contentEl.createDiv({ cls: "bilingual-modal-actions" });
    const cancelBtn = actionsEl.createEl("button", {
      text: "Đóng",
      cls: "mod-cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    const startBtn = actionsEl.createEl("button", {
      text: "Bắt đầu dịch song ngữ",
      cls: "mod-cta",
    });
    startBtn.addEventListener("click", () => this.startTranslation());
  }

  /**
   * Kích hoạt tiến trình dịch và cập nhật Progress Bar
   */
  async startTranslation(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    const progressContainer = contentEl.createDiv({ cls: "bilingual-progress-container" });
    const titleEl = progressContainer.createEl("h4", {
      text: "Đang tiến hành dịch song ngữ...",
      cls: "bilingual-progress-title",
    });
    const statusTextEl = progressContainer.createDiv({
      text: "Đang khởi tạo...",
      cls: "bilingual-progress-status",
    });

    const trackEl = progressContainer.createDiv({ cls: "bilingual-progress-track" });
    const fillEl = trackEl.createDiv({ cls: "bilingual-progress-fill" });
    fillEl.style.width = "0%";

    const previewEl = progressContainer.createDiv({
      cls: "bilingual-progress-preview",
      text: "Đang chuẩn bị các khối văn bản...",
    });

    const cancelActionEl = progressContainer.createDiv({ cls: "bilingual-progress-actions" });
    const cancelBtn = cancelActionEl.createEl("button", {
      text: "Hủy bỏ dịch",
      cls: "mod-warning",
    });
    cancelBtn.addEventListener("click", () => this.cancelTranslation());

    this.abortController = new AbortController();

    const blocks = parseMarkdownIntoBlocks(this.fileContent);

    try {
      const translatedBlocks = await this.translationService.translateBlocks(blocks, {
        engine: this.selectedEngine,
        targetLang: this.settings.targetLanguage || "vi",
        sourceLang: this.settings.sourceLanguage || "auto",
        apiKey: this.settings.geminiApiKey,
        customEndpointUrl: this.settings.translateEndpointUrl,
        docContext: this.docContext,
        signal: this.abortController.signal,
        onProgress: (progress) => {
          fillEl.style.width = `${progress.percent}%`;
          statusTextEl.setText(`Đang dịch: ${progress.current} / ${progress.total} khối (${progress.percent}%)`);
          previewEl.setText(progress.currentText);
        },
      });

      const reassembled = reassembleBilingualMarkdown(
        translatedBlocks,
        this.settings.bilingualTranslationStyle
      );

      await this.onComplete(reassembled, this.selectedDestination);
      new Notice("Đã dịch song ngữ thành công!");
      this.close();
    } catch (err: any) {
      if (this.abortController.signal.aborted || err?.message?.includes("aborted")) {
        new Notice("Đã hủy quá trình dịch song ngữ.");
      } else {
        new Notice(`Lỗi khi dịch song ngữ: ${err?.message || "Không xác định"}`);
      }
      this.close();
    }
  }

  /**
   * Hủy bỏ quá trình dịch
   */
  cancelTranslation(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  onClose(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
    this.contentEl.empty();
  }
}
