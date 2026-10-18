import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice, Setting } from "obsidian";
import { EnglishStudySettingTab, PluginWithSettings } from "../../src/ui/SettingsTab";
import { DEFAULT_SETTINGS, PluginSettings } from "../../src/types";

describe("EnglishStudySettingTab", () => {
  let app: App;
  let pluginMock: PluginWithSettings;
  let settingsTab: EnglishStudySettingTab;

  beforeEach(() => {
    app = new App();
    Notice.instances = [];
    Setting.instances = [];

    pluginMock = {
      app,
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn().mockResolvedValue(undefined),
      geminiService: {
        testConnection: vi.fn().mockResolvedValue(true),
      },
    };

    settingsTab = new EnglishStudySettingTab(app, pluginMock);
  });

  it("should render all 6 setting groups and headings", () => {
    settingsTab.display();

    const headings = Setting.instances.filter((s) => s.isHeading);
    expect(headings.length).toBe(6);

    const headingNames = headings.map((h) => h.name);
    expect(headingNames).toContain("TƯƠNG TÁC ĐỌC (TRIGGER & DISPLAY)");
    expect(headingNames).toContain("NGÔN NGỮ HỌC TẬP (MULTILINGUAL SETTINGS)");
    expect(headingNames).toContain("SỔ TỪ VỰNG (VOCABULARY VAULT)");
    expect(headingNames).toContain("DỊCH THUẬT & TRÍ TUỆ NHÂN TẠO (AI & ENGINES)");
    expect(headingNames).toContain("PHÁT ÂM (AUDIO)");
    expect(headingNames).toContain("DỊCH SONG NGỮ TOÀN BỘ FILE (BILINGUAL FILE TRANSLATION)");
  });

  describe("Group: Bilingual File Translation", () => {
    it("should update bilingualTranslationStyle and save settings", async () => {
      settingsTab.display();

      const styleSetting = Setting.instances.find((s) =>
        s.name.includes("Phong cách hiển thị song ngữ")
      );
      expect(styleSetting).toBeDefined();

      const dropdown = styleSetting!.dropdownComponents[0];
      await dropdown._onChange("colored");

      expect(pluginMock.settings.bilingualTranslationStyle).toBe("colored");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });
  });

  describe("Group: Multilingual Settings", () => {
    it("should update sourceLanguage dropdown and save settings", async () => {
      settingsTab.display();

      const sourceSetting = Setting.instances.find(
        (s) => s.name.includes("Ngôn ngữ nguồn") || s.name.includes("nguồn")
      );
      expect(sourceSetting).toBeDefined();

      const dropdown = sourceSetting!.dropdownComponents[0];
      await dropdown._onChange("ja");

      expect(pluginMock.settings.sourceLanguage).toBe("ja");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update targetLanguage dropdown and save settings", async () => {
      settingsTab.display();

      const targetSetting = Setting.instances.find(
        (s) => s.name.includes("Ngôn ngữ đích") || s.name.includes("đích")
      );
      expect(targetSetting).toBeDefined();

      const dropdown = targetSetting!.dropdownComponents[0];
      await dropdown._onChange("en");

      expect(pluginMock.settings.targetLanguage).toBe("en");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should toggle separateVocabFileByLanguage and save settings", async () => {
      settingsTab.display();

      const separateSetting = Setting.instances.find(
        (s) => s.name.includes("Tách riêng file từ vựng") || s.name.includes("Tách")
      );
      expect(separateSetting).toBeDefined();

      const toggle = separateSetting!.toggleComponents[0];
      await toggle._onChange(true);

      expect(pluginMock.settings.separateVocabFileByLanguage).toBe(true);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });
  });

  describe("Group 1: Trigger & Display", () => {
    it("should update triggerMode and call saveSettings", async () => {
      settingsTab.display();

      const triggerSetting = Setting.instances.find(
        (s) => s.name === "Chế độ kích hoạt" || s.name.includes("triggerMode")
      );
      expect(triggerSetting).toBeDefined();

      const dropdown = triggerSetting!.dropdownComponents[0];
      expect(dropdown).toBeDefined();

      // Trigger change
      await dropdown._onChange("hotkey-only");

      expect(pluginMock.settings.triggerMode).toBe("hotkey-only");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should toggle autoTranslateOnSelection switch and sync triggerMode", async () => {
      settingsTab.display();

      const autoToggleSetting = Setting.instances.find(
        (s) => s.name === "Tự động dịch khi bôi đen" || s.name.includes("Tự động dịch")
      );
      expect(autoToggleSetting).toBeDefined();

      const toggle = autoToggleSetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      // Turn ON auto translate
      await toggle._onChange(true);
      expect(pluginMock.settings.autoTranslateOnSelection).toBe(true);
      expect(pluginMock.settings.triggerMode).toBe("auto-popup");
      expect(pluginMock.saveSettings).toHaveBeenCalled();

      // Turn OFF auto translate
      await toggle._onChange(false);
      expect(pluginMock.settings.autoTranslateOnSelection).toBe(false);
      expect(pluginMock.settings.triggerMode).toBe("icon");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should disable or hide manual trigger mode dropdown when autoTranslateOnSelection is true", async () => {
      pluginMock.settings.autoTranslateOnSelection = true;
      pluginMock.settings.triggerMode = "auto-popup";
      settingsTab.display();

      const manualSetting = Setting.instances.find(
        (s) =>
          s.name === "Chế độ thủ công khi tắt tự động dịch" ||
          s.name === "Chế độ kích hoạt"
      );
      expect(manualSetting ? (manualSetting as any).disabled : true).toBe(true);
    });
  });

  describe("Group 2: Vocabulary Vault", () => {
    it("should update useDailyNote and call saveSettings", async () => {
      settingsTab.display();

      const dailyNoteSetting = Setting.instances.find(
        (s) => s.name === "Lưu vào Daily Note" || s.name.includes("Daily Note")
      );
      expect(dailyNoteSetting).toBeDefined();

      const toggle = dailyNoteSetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      await toggle._onChange(true);

      expect(pluginMock.settings.useDailyNote).toBe(true);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update vocabFilePath and call saveSettings", async () => {
      settingsTab.display();

      const pathSetting = Setting.instances.find(
        (s) => s.name === "Đường dẫn file từ vựng"
      );
      expect(pathSetting).toBeDefined();

      const text = pathSetting!.textComponents[0];
      expect(text).toBeDefined();

      await text._onChange("MyNotes/Words.md");

      expect(pluginMock.settings.vocabFilePath).toBe("MyNotes/Words.md");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update vocabFormat and call saveSettings", async () => {
      settingsTab.display();

      const formatSetting = Setting.instances.find(
        (s) => s.name === "Định dạng lưu từ vựng" || s.name.includes("Định dạng")
      );
      expect(formatSetting).toBeDefined();

      const dropdown = formatSetting!.dropdownComponents[0];
      expect(dropdown).toBeDefined();

      await dropdown._onChange("callout");

      expect(pluginMock.settings.vocabFormat).toBe("callout");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update highlightWordInContext and call saveSettings", async () => {
      settingsTab.display();

      const highlightSetting = Setting.instances.find(
        (s) => s.name.includes("nổi bật từ trong ngữ cảnh") || s.name.includes("In đậm từ")
      );
      expect(highlightSetting).toBeDefined();

      const toggle = highlightSetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      await toggle._onChange(false);

      expect(pluginMock.settings.highlightWordInContext).toBe(false);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });
  });

  describe("Group 3: Translation & AI", () => {
    it("should update translateEndpointUrl and call saveSettings", async () => {
      settingsTab.display();

      const urlSetting = Setting.instances.find(
        (s) => s.name === "URL dịch thay thế" || s.name.includes("URL dịch")
      );
      expect(urlSetting).toBeDefined();

      const text = urlSetting!.textComponents[0];
      expect(text).toBeDefined();

      await text._onChange("https://custom-translate.example.com");

      expect(pluginMock.settings.translateEndpointUrl).toBe(
        "https://custom-translate.example.com"
      );
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update geminiApiKey and call saveSettings", async () => {
      settingsTab.display();

      const keySetting = Setting.instances.find(
        (s) => s.name === "Gemini API Key" || s.name.includes("API Key")
      );
      expect(keySetting).toBeDefined();

      const text = keySetting!.textComponents[0];
      expect(text).toBeDefined();
      expect(text.inputEl.type).toBe("password");

      await text._onChange("AIzaSy-test-key-123");

      expect(pluginMock.settings.geminiApiKey).toBe("AIzaSy-test-key-123");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should test connection and show Notice when clicking test connection button", async () => {
      pluginMock.settings.geminiApiKey = "AIzaSy-valid-key";
      settingsTab.display();

      const testBtnSetting = Setting.instances.find(
        (s) => s.name.includes("Kiểm tra kết nối") || s.name.includes("test connection")
      );
      expect(testBtnSetting).toBeDefined();

      const button = testBtnSetting!.buttonComponents[0];
      expect(button).toBeDefined();

      await button._onClick();

      expect(pluginMock.geminiService!.testConnection).toHaveBeenCalledWith("AIzaSy-valid-key");
      expect(Notice.instances.length).toBeGreaterThan(0);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("thành công");
    });

    it("should show warning Notice if testing connection without API key", async () => {
      pluginMock.settings.geminiApiKey = "";
      settingsTab.display();

      const testBtnSetting = Setting.instances.find(
        (s) => s.name.includes("Kiểm tra kết nối") || s.name.includes("test connection")
      );
      const button = testBtnSetting!.buttonComponents[0];

      await button._onClick();

      expect(pluginMock.geminiService!.testConnection).not.toHaveBeenCalled();
      expect(Notice.instances.length).toBeGreaterThan(0);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain(
        "Vui lòng nhập Gemini API Key"
      );
    });

    it("should show failure Notice if test connection returns false or throws", async () => {
      pluginMock.settings.geminiApiKey = "AIzaSy-invalid-key";
      (pluginMock.geminiService!.testConnection as any).mockResolvedValueOnce(false);

      settingsTab.display();

      const testBtnSetting = Setting.instances.find(
        (s) => s.name.includes("Kiểm tra kết nối") || s.name.includes("test connection")
      );
      const button = testBtnSetting!.buttonComponents[0];

      await button._onClick();

      expect(Notice.instances.length).toBeGreaterThan(0);
      expect(Notice.instances[Notice.instances.length - 1].message).toContain("thất bại");
    });

    it("should update enableAiGrammar and call saveSettings", async () => {
      settingsTab.display();

      const grammarSetting = Setting.instances.find(
        (s) => s.name === "Phân tích ngữ pháp AI" || s.name.includes("ngữ pháp AI")
      );
      expect(grammarSetting).toBeDefined();

      const toggle = grammarSetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      await toggle._onChange(true);

      expect(pluginMock.settings.enableAiGrammar).toBe(true);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update enableAiTranslation and call saveSettings", async () => {
      settingsTab.display();

      const transSetting = Setting.instances.find(
        (s) => s.name.includes("Dịch nghĩa với AI")
      );
      expect(transSetting).toBeDefined();

      const toggle = transSetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      await toggle._onChange(true);

      expect(pluginMock.settings.enableAiTranslation).toBe(true);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });
  });

  describe("Group 4: Audio", () => {
    it("should update preferredAccent and call saveSettings", async () => {
      settingsTab.display();

      const accentSetting = Setting.instances.find(
        (s) => s.name === "Giọng phát âm ưu tiên" || s.name.includes("phát âm ưu tiên")
      );
      expect(accentSetting).toBeDefined();

      const dropdown = accentSetting!.dropdownComponents[0];
      expect(dropdown).toBeDefined();

      await dropdown._onChange("uk");

      expect(pluginMock.settings.preferredAccent).toBe("uk");
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });

    it("should update autoPlayAudio and call saveSettings", async () => {
      settingsTab.display();

      const autoPlaySetting = Setting.instances.find(
        (s) => s.name === "Tự động phát âm" || s.name.includes("Tự động phát âm")
      );
      expect(autoPlaySetting).toBeDefined();

      const toggle = autoPlaySetting!.toggleComponents[0];
      expect(toggle).toBeDefined();

      await toggle._onChange(true);

      expect(pluginMock.settings.autoPlayAudio).toBe(true);
      expect(pluginMock.saveSettings).toHaveBeenCalled();
    });
  });
});
