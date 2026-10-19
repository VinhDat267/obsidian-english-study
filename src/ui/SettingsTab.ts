import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import {
  PluginSettings,
  TriggerMode,
  VocabFormat,
  PreferredAccent,
  BilingualStyle,
} from "../types";

export interface PluginWithSettings {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  geminiService?: {
    testConnection(apiKey: string): Promise<boolean>;
    testConnectionDetailed?(apiKey: string): Promise<{ ok: boolean; error?: string }>;
  };
}

export class EnglishStudySettingTab extends PluginSettingTab {
  private pluginInstance: PluginWithSettings;

  constructor(app: App, plugin: PluginWithSettings) {
    super(app, plugin as any);
    this.pluginInstance = plugin;
  }

  display(): void {
    const { containerEl } = this;
    if (!containerEl) return;
    containerEl.empty();

    containerEl.createEl("h2", {
      text: "Cài đặt Tiện ích Học tập Đa ngôn ngữ (Polyglot Study)",
    });

    // =========================================================================
    // Nhóm 1: TƯƠNG TÁC ĐỌC (TRIGGER & DISPLAY)
    // =========================================================================
    new Setting(containerEl)
      .setName("TƯƠNG TÁC ĐỌC (TRIGGER & DISPLAY)")
      .setHeading();

    const isAutoTranslate =
      Boolean(this.pluginInstance.settings.autoTranslateOnSelection) ||
      this.pluginInstance.settings.triggerMode === "auto-popup";

    new Setting(containerEl)
      .setName("Tự động dịch khi bôi đen")
      .setDesc(
        "Tự động tra từ và mở bảng dịch ngay khi thả chuột bôi đen văn bản mà không cần click vào icon hay bấm phím tắt."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(isAutoTranslate)
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.autoTranslateOnSelection = value;
            if (value) {
              this.pluginInstance.settings.triggerMode = "auto-popup";
            } else {
              this.pluginInstance.settings.triggerMode = "icon";
            }
            await this.pluginInstance.saveSettings();
            this.display();
          })
      );

    const manualSetting = new Setting(containerEl)
      .setName("Chế độ kích hoạt")
      .setDesc(
        "Chọn cách hiển thị popup tra từ khi bôi đen văn bản trong ghi chú (áp dụng khi tắt tự động dịch)."
      )
      .setDisabled(isAutoTranslate)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("icon", "Icon nổi khi bôi đen (Mặc định)")
          .addOption("hotkey-only", "Chỉ dùng phím tắt")
          .setValue(
            this.pluginInstance.settings.triggerMode === "auto-popup"
              ? "icon"
              : this.pluginInstance.settings.triggerMode
          )
          .onChange(async (value: string) => {
            this.pluginInstance.settings.triggerMode = value as TriggerMode;
            if (value !== "auto-popup") {
              this.pluginInstance.settings.autoTranslateOnSelection = false;
            }
            await this.pluginInstance.saveSettings();
          })
      );

    if (isAutoTranslate) {
      manualSetting.setClass("setting-item-disabled");
    }

    new Setting(containerEl)
      .setName("Màu bút dạ quang mặc định")
      .setDesc("Màu sắc được sử dụng khi bật chế độ bút dạ quang (tự động highlight khi bôi đen trong Reading view).")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("yellow", "🟡 Vàng (Mặc định)")
          .addOption("green", "🟢 Xanh lá")
          .addOption("blue", "🔵 Xanh lam")
          .addOption("pink", "🌸 Hồng")
          .addOption("purple", "🟣 Tím")
          .addOption("orange", "🟠 Cam")
          .setValue(this.pluginInstance.settings.highlighterPenColor || "yellow")
          .onChange(async (value: string) => {
            this.pluginInstance.settings.highlighterPenColor = value as any;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Phím tắt tra từ")
      .setDesc(
        'Bạn có thể gán phím tắt tra từ tại menu Settings > Hotkeys (tìm "Tra từ điển / Dịch câu bôi đen").'
      );

    // =========================================================================
    // Nhóm: NGÔN NGỮ HỌC TẬP (MULTILINGUAL SETTINGS)
    // =========================================================================
    new Setting(containerEl)
      .setName("NGÔN NGỮ HỌC TẬP (MULTILINGUAL SETTINGS)")
      .setHeading();

    new Setting(containerEl)
      .setName("Ngôn ngữ nguồn (Học tập)")
      .setDesc(
        "Chọn ngôn ngữ của tài liệu bạn đang học. Đặt 'Tự động nhận diện' để plugin tự phát hiện mọi ngôn ngữ."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "🌐 Tự động nhận diện (Tất cả ngôn ngữ - Khuyến nghị)")
          .addOption("en", "🇬🇧 Tiếng Anh (English)")
          .addOption("ja", "🇯🇵 Tiếng Nhật (Japanese)")
          .addOption("zh", "🇨🇳 Tiếng Trung (Chinese)")
          .addOption("ko", "🇰🇷 Tiếng Hàn (Korean)")
          .addOption("fr", "🇫🇷 Tiếng Pháp (French)")
          .addOption("de", "🇩🇪 Tiếng Đức (German)")
          .addOption("es", "🇪🇸 Tiếng Tây Ban Nha (Spanish)")
          .addOption("ru", "🇷🇺 Tiếng Nga (Russian)")
          .setValue(this.pluginInstance.settings.sourceLanguage || "auto")
          .onChange(async (value: string) => {
            this.pluginInstance.settings.sourceLanguage = value;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ngôn ngữ đích (Dịch nghĩa)")
      .setDesc("Ngôn ngữ hiển thị bản dịch nghĩa khi bạn tra từ hoặc câu ngữ cảnh.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("vi", "🇻🇳 Tiếng Việt (Mặc định)")
          .addOption("en", "🇬🇧 Tiếng Anh (English)")
          .addOption("zh", "🇨🇳 Tiếng Trung (Chinese)")
          .addOption("ja", "🇯🇵 Tiếng Nhật (Japanese)")
          .setValue(this.pluginInstance.settings.targetLanguage || "vi")
          .onChange(async (value: string) => {
            this.pluginInstance.settings.targetLanguage = value;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tách riêng file từ vựng cho từng ngôn ngữ")
      .setDesc(
        "Tự động tạo các file từ vựng riêng biệt cho từng ngôn ngữ (ví dụ: Vocabulary_ja.md, Vocabulary_zh.md) khi lưu từ vào Vault."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.pluginInstance.settings.separateVocabFileByLanguage))
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.separateVocabFileByLanguage = value;
            await this.pluginInstance.saveSettings();
          })
      );

    // =========================================================================
    // Nhóm 2: SỔ TỪ VỰNG (VOCABULARY VAULT)
    // =========================================================================
    new Setting(containerEl)
      .setName("SỔ TỪ VỰNG (VOCABULARY VAULT)")
      .setHeading();

    new Setting(containerEl)
      .setName("Lưu vào Daily Note")
      .setDesc("Tự động ghi từ vựng vào ghi chú ngày hôm nay thay vì file từ vựng cố định.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.pluginInstance.settings.useDailyNote)
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.useDailyNote = value;
            await this.pluginInstance.saveSettings();
            this.display();
          })
      );

    const vocabPathSetting = new Setting(containerEl)
      .setName("Đường dẫn file từ vựng")
      .setDesc(
        'Đường dẫn file lưu từ vựng (mặc định "Vocabulary.md", chỉ áp dụng khi tắt useDailyNote).'
      )
      .setDisabled(this.pluginInstance.settings.useDailyNote)
      .addText((text) =>
        text
          .setPlaceholder("Vocabulary.md")
          .setValue(this.pluginInstance.settings.vocabFilePath)
          .onChange(async (value: string) => {
            this.pluginInstance.settings.vocabFilePath =
              value.trim() || "Vocabulary.md";
            await this.pluginInstance.saveSettings();
          })
      );

    if (this.pluginInstance.settings.useDailyNote) {
      vocabPathSetting.setClass("setting-item-disabled");
    }

    new Setting(containerEl)
      .setName("Định dạng lưu từ vựng")
      .setDesc("Định dạng cấu trúc nội dung từ vựng được ghi vào sổ.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("table", "Bảng Markdown (Table)")
          .addOption("callout", "Khối Callout Flashcard")
          .setValue(this.pluginInstance.settings.vocabFormat)
          .onChange(async (value: string) => {
            this.pluginInstance.settings.vocabFormat = value as VocabFormat;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Làm nổi bật từ trong ngữ cảnh")
      .setDesc("Tự động in đậm từ trong câu ngữ cảnh khi lưu vào sổ.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.pluginInstance.settings.highlightWordInContext)
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.highlightWordInContext = value;
            await this.pluginInstance.saveSettings();
          })
      );

    // =========================================================================
    // Nhóm 3: DỊCH THUẬT & TRÍ TUỆ NHÂN TẠO (AI & ENGINES)
    // =========================================================================
    new Setting(containerEl)
      .setName("DỊCH THUẬT & TRÍ TUỆ NHÂN TẠO (AI & ENGINES)")
      .setHeading();

    new Setting(containerEl)
      .setName("URL dịch thay thế")
      .setDesc("URL dịch thay thế (mặc định Google Translate, cấu hình khi bị chặn 429).")
      .addText((text) =>
        text
          .setPlaceholder("https://translate.googleapis.com")
          .setValue(this.pluginInstance.settings.translateEndpointUrl)
          .onChange(async (value: string) => {
            this.pluginInstance.settings.translateEndpointUrl = value.trim();
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Gemini API Key")
      .setDesc(
        "Khóa API Google Gemini để phân tích ngữ pháp nâng cao. Lưu ý: Nếu dùng Git để backup Vault, hãy thêm file data.json vào .gitignore để tránh rò rỉ key cá nhân."
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Nhập Gemini API Key...")
          .setValue(this.pluginInstance.settings.geminiApiKey)
          .onChange(async (value: string) => {
            this.pluginInstance.settings.geminiApiKey = value.trim();
            await this.pluginInstance.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Kiểm tra kết nối Gemini")
      .setDesc("Thử gửi request kiểm tra API Key với Gemini API.")
      .addButton((button) =>
        button
          .setButtonText("Kiểm tra kết nối")
          .setCta()
          .onClick(async () => {
            const apiKey = this.pluginInstance.settings.geminiApiKey;
            if (!apiKey) {
              new Notice("Vui lòng nhập Gemini API Key trước khi kiểm tra!");
              return;
            }

            button.setButtonText("Đang kiểm tra...");
            try {
              let ok = false;
              let errorMsg: string | undefined;

              if (this.pluginInstance.geminiService?.testConnectionDetailed) {
                const res = await this.pluginInstance.geminiService.testConnectionDetailed(apiKey);
                ok = res.ok;
                errorMsg = res.error;
              } else if (this.pluginInstance.geminiService?.testConnection) {
                ok = await this.pluginInstance.geminiService.testConnection(apiKey);
              }

              if (ok) {
                new Notice("✅ Kết nối Gemini API thành công! (Mô hình: gemini-flash-latest)");
              } else {
                new Notice(
                  `❌ Kết nối Gemini API thất bại! ${errorMsg || "Vui lòng kiểm tra lại API Key."}`
                );
              }
            } catch (err: any) {
              new Notice(
                `❌ Kết nối Gemini API thất bại! ${err?.message || "Vui lòng kiểm tra lại API Key."}`
              );
            } finally {
              button.setButtonText("Kiểm tra kết nối");
            }
          })
      );

    new Setting(containerEl)
      .setName("Dịch nghĩa với AI (Domain-Aware Translation)")
      .setDesc(
        "Tự động nhận diện chủ đề tài liệu (IT, Y học, Kinh tế...) để dịch nghĩa chính xác chuyên ngành với tốc độ phản hồi tức thì (Progressive Loading)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.pluginInstance.settings.enableAiTranslation))
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.enableAiTranslation = value;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Phân tích ngữ pháp AI (AI Grammar Analysis)")
      .setDesc(
        "Hiển thị khung phân tích ngữ pháp chuyên sâu riêng biệt bên dưới nghĩa của từ (có thể tắt để popup chỉ hiển thị bản dịch nghĩa)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.pluginInstance.settings.enableAiGrammar)
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.enableAiGrammar = value;
            await this.pluginInstance.saveSettings();
          })
      );

    // =========================================================================
    // Nhóm 4: PHÁT ÂM (AUDIO)
    // =========================================================================
    new Setting(containerEl)
      .setName("PHÁT ÂM (AUDIO)")
      .setHeading();

    new Setting(containerEl)
      .setName("Giọng phát âm ưu tiên")
      .setDesc("Lựa chọn giọng phát âm khi phát âm từ vựng.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("us", "Tiếng Anh - Mỹ (US)")
          .addOption("uk", "Tiếng Anh - Anh (UK)")
          .setValue(this.pluginInstance.settings.preferredAccent)
          .onChange(async (value: string) => {
            this.pluginInstance.settings.preferredAccent = value as PreferredAccent;
            await this.pluginInstance.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tự động phát âm")
      .setDesc("Tự động phát âm khi tra từ đơn.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.pluginInstance.settings.autoPlayAudio)
          .onChange(async (value: boolean) => {
            this.pluginInstance.settings.autoPlayAudio = value;
            await this.pluginInstance.saveSettings();
          })
      );

    // =========================================================================
    // Dịch tạm thời trong Reading Mode.
    new Setting(containerEl)
      .setName("DỊCH SONG NGỮ KHI ĐỌC")
      .setDesc("Bản dịch nổi rõ dưới từng đoạn trong Reading Mode. Bật/tắt bằng icon ngôn ngữ hoặc Command Palette; không ghi vào ghi chú.")
      .setHeading();

    new Setting(containerEl)
      .setName("Công cụ dịch khi đọc")
      .setDesc("Dùng ngôn ngữ nguồn/đích đã chọn ở trên. Gemini cần API key; độc lập với phân tích ngữ pháp AI.")
      .addDropdown(dropdown => dropdown
        .addOption("google", "Google Translate")
        .addOption("gemini", "Gemini")
        .setValue(this.pluginInstance.settings.readingTranslationEngine || "google")
        .onChange(async (value: string) => {
          this.pluginInstance.settings.readingTranslationEngine = value === "gemini" ? "gemini" : "google";
          await this.pluginInstance.saveSettings();
        })
      );

    // Xuất nội dung song ngữ ra Markdown là luồng riêng.
    // =========================================================================
    new Setting(containerEl)
      .setName("DỊCH SONG NGỮ TOÀN BỘ FILE (BILINGUAL FILE TRANSLATION)")
      .setDesc("Chèn và lưu bản dịch vào file Markdown hiện tại hoặc file mới. Khác với chế độ dịch tạm thời khi đọc ở trên.")
      .setHeading();

    new Setting(containerEl)
      .setName("Phong cách hiển thị song ngữ")
      .setDesc("Định dạng của lời dịch tiếng Việt chèn bên dưới câu/đoạn tiếng Anh.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("blockquote", "Trích dẫn viền dọc (> *Lời dịch*) [Khuyên dùng]")
          .addOption("colored", "Chữ màu dịu mắt (<font color>)")
          .addOption("highlight", "Tô sáng nền (==Lời dịch==)")
          .addOption("bold_prefix", "Tiền tố in đậm (**[VI]** Lời dịch)")
          .setValue(this.pluginInstance.settings.bilingualTranslationStyle || "blockquote")
          .onChange(async (value: string) => {
            this.pluginInstance.settings.bilingualTranslationStyle = value as BilingualStyle;
            await this.pluginInstance.saveSettings();
          })
      );
  }
}
