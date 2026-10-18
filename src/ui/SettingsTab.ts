import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import {
  PluginSettings,
  TriggerMode,
  VocabFormat,
  PreferredAccent,
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
      .setName("Phân tích ngữ pháp AI")
      .setDesc("Tự động phân tích ngữ pháp, ngữ cảnh và thành ngữ bằng Gemini.")
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
  }
}
