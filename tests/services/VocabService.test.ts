import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, TFile, TFolder, Notice } from "obsidian";
import {
  VocabService,
  SaveVocabResult,
} from "../../src/services/storage/VocabService";
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  LookupResult,
} from "../../src/types/index";
import { getDefaultTemplate } from "../../src/utils/vocabFormatter";

describe("VocabService", () => {
  let app: App;
  let defaultSettings: PluginSettings;
  let service: VocabService;

  const sampleResult: LookupResult = {
    query: "ephemeral",
    type: "word",
    contextSentence: "Fame in the modern world is fleeting and ephemeral.",
    contextSentenceClean: "Fame in the modern world is fleeting and ephemeral.",
    phonetic: "/ɪˈfem.ər.əl/",
    audioUrl: "https://example.com/audio/ephemeral.mp3",
    vietnameseTranslation: "Phù du, chóng tàn",
    definitions: [
      {
        partOfSpeech: "adjective",
        meaningEn: "Lasting for only a short time.",
        example: "ephemeral pleasures",
      },
    ],
    timestamp: new Date("2026-10-18T10:00:00Z").getTime(),
  };

  beforeEach(() => {
    app = new App();
    Notice.instances = [];
    defaultSettings = {
      ...DEFAULT_SETTINGS,
      vocabFilePath: "Vocabulary.md",
      vocabFormat: "table",
      useDailyNote: false,
      highlightWordInContext: true,
    };
    service = new VocabService(app, defaultSettings);
  });

  describe("getResolvedFilePath", () => {
    it("should return default settings.vocabFilePath when useDailyNote is false", () => {
      const path = service.getResolvedFilePath();
      expect(path).toBe("Vocabulary.md");
    });

    it("should return custom vocabFilePath if specified in settings", () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFilePath: "Notes/English/MyVocab.md",
      });
      expect(service.getResolvedFilePath()).toBe("Notes/English/MyVocab.md");
    });

    it("should respect settingsOverride parameter", () => {
      const override: PluginSettings = {
        ...defaultSettings,
        vocabFilePath: "Override/Vocab.md",
      };
      expect(service.getResolvedFilePath(override)).toBe("Override/Vocab.md");
    });

    it("should ensure .md extension when vocabFilePath lacks it", () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFilePath: "Study/Words",
      });
      expect(service.getResolvedFilePath()).toBe("Study/Words.md");
    });

    it("should append language code to filename when separateVocabFileByLanguage is true", () => {
      service.updateSettings({
        ...defaultSettings,
        separateVocabFileByLanguage: true,
      });

      const pathJa = service.getResolvedFilePath(undefined, "ja");
      expect(pathJa).toBe("Vocabulary_ja.md");

      const pathZh = service.getResolvedFilePath(undefined, "zh");
      expect(pathZh).toBe("Vocabulary_zh.md");
    });

    it("should handle nested paths when separateVocabFileByLanguage is true", () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFilePath: "Notes/Languages/Vocab.md",
        separateVocabFileByLanguage: true,
      });

      const pathKo = service.getResolvedFilePath(undefined, "ko");
      expect(pathKo).toBe("Notes/Languages/Vocab_ko.md");
    });

    it("should generate today date path when useDailyNote is true", () => {
      service.updateSettings({
        ...defaultSettings,
        useDailyNote: true,
      });

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}.md`;

      const resolved = service.getResolvedFilePath();
      expect(resolved).toBe(`Daily Notes/${dateStr}`);
    });

    it("should read Daily Notes folder from internal core plugin options if present", () => {
      (app as any).internalPlugins = {
        plugins: {
          "daily-notes": {
            instance: {
              options: {
                folder: "Journal/Daily",
              },
            },
          },
        },
      };

      service.updateSettings({
        ...defaultSettings,
        useDailyNote: true,
      });

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}.md`;

      expect(service.getResolvedFilePath()).toBe(`Journal/Daily/${dateStr}`);
    });

    it("should return root date file if date file already exists at root", async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}.md`;

      await app.vault.create(dateStr, "# Today Note");

      service.updateSettings({
        ...defaultSettings,
        useDailyNote: true,
      });

      expect(service.getResolvedFilePath()).toBe(dateStr);
    });
  });

  describe("saveVocab - Table format", () => {
    it("should create new file with default template and insert first row if file does not exist", async () => {
      const result = await service.saveVocab(sampleResult);

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.filePath).toBe("Vocabulary.md");

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      expect(file).toBeDefined();

      const content = await app.vault.read(file);
      expect(content).toContain("## Sổ từ vựng tiếng Anh");
      expect(content).toContain("| Từ / Cụm từ | Loại từ & Phiên âm |");
      expect(content).toContain("| **ephemeral** | *adjective* `/ɪˈfem.ər.əl/` | Phù du, chóng tàn |");
      expect(content).toContain("**ephemeral**");

      expect(Notice.instances.length).toBe(1);
      expect(Notice.instances[0].message).toBe("Đã lưu 'ephemeral' vào sổ từ vựng!");
    });

    it("should safely create nested parent folders if path contains subfolders", async () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFilePath: "Study/English/Sub/Vocab.md",
      });

      const createFolderSpy = vi.spyOn(app.vault, "createFolder");

      const result = await service.saveVocab(sampleResult);
      expect(result.success).toBe(true);
      expect(result.filePath).toBe("Study/English/Sub/Vocab.md");

      expect(createFolderSpy).toHaveBeenCalledWith("Study");
      expect(createFolderSpy).toHaveBeenCalledWith("Study/English");
      expect(createFolderSpy).toHaveBeenCalledWith("Study/English/Sub");

      const folder = app.vault.getAbstractFileByPath("Study/English/Sub");
      expect(folder).toBeDefined();

      const file = app.vault.getAbstractFileByPath("Study/English/Sub/Vocab.md");
      expect(file).toBeDefined();
    });

    it("should insert row at end of table while preserving headings below table", async () => {
      const initialContent = [
        "## Sổ từ vựng tiếng Anh",
        "",
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **apple** | *noun* `/ˈæp.əl/` | Quả táo | I ate an **apple** | 2026-10-18 |",
        "",
        "### Ghi chú thêm",
        "Nội dung ghi chú không được bị ghi đè.",
      ].join("\n");

      await app.vault.create("Vocabulary.md", initialContent);

      const result = await service.saveVocab(sampleResult);
      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(false);

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      const content = await app.vault.read(file);

      const lines = content.split("\n");
      const appleIndex = lines.findIndex((l) => l.includes("**apple**"));
      const ephemeralIndex = lines.findIndex((l) => l.includes("**ephemeral**"));
      const subHeadingIndex = lines.findIndex((l) => l.includes("### Ghi chú thêm"));

      expect(appleIndex).toBeGreaterThan(-1);
      expect(ephemeralIndex).toBe(appleIndex + 1);
      expect(subHeadingIndex).toBeGreaterThan(ephemeralIndex);
      expect(content).toContain("Nội dung ghi chú không được bị ghi đè.");
    });

    it("should detect duplicate word and append new context without adding duplicate row", async () => {
      // First save
      await service.saveVocab(sampleResult);

      // Second save with new context sentence
      const updatedResult: LookupResult = {
        ...sampleResult,
        contextSentence: "Fashion trends are notoriously ephemeral.",
        contextSentenceClean: "Fashion trends are notoriously ephemeral.",
      };

      const dupResult = await service.saveVocab(updatedResult);

      expect(dupResult.success).toBe(true);
      expect(dupResult.isDuplicate).toBe(true);

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      const content = await app.vault.read(file);

      // Should only have 1 table row for ephemeral
      const matches = content.match(/\|\s*\*\*ephemeral\*\*/gi);
      expect(matches?.length).toBe(1);

      // Should contain both contexts separated by <br>•
      expect(content).toContain("Fame in the modern world is fleeting and **ephemeral**.");
      expect(content).toContain("<br>• Fashion trends are notoriously **ephemeral**.");

      // Verify notice
      expect(Notice.instances[Notice.instances.length - 1].message).toBe(
        "Từ 'ephemeral' đã có trong sổ. Đã bổ sung thêm ngữ cảnh mới!"
      );
    });

    it("should enforce 100% synchronous callback inside vault.process", async () => {
      const processSpy = vi.spyOn(app.vault, "process");

      await service.saveVocab(sampleResult);

      expect(processSpy).toHaveBeenCalledTimes(1);
      const callback = processSpy.mock.calls[0][1];

      // Invoke callback directly to check return value is a string, not a Promise
      const result = callback(getDefaultTemplate());
      expect(typeof result).toBe("string");
      expect((result as unknown) instanceof Promise).toBe(false);
    });

    it("should save to separate language file when separateVocabFileByLanguage is enabled", async () => {
      service.updateSettings({
        ...defaultSettings,
        separateVocabFileByLanguage: true,
      });

      const jaResult: LookupResult = {
        query: "猫",
        type: "word",
        contextSentence: "これは猫です。",
        contextSentenceClean: "これは猫です。",
        transliteration: "Neko",
        sourceLang: "ja",
        vietnameseTranslation: "con mèo",
        timestamp: Date.now(),
      };

      const result = await service.saveVocab(jaResult);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("Vocabulary_ja.md");

      const file = app.vault.getAbstractFileByPath("Vocabulary_ja.md") as TFile;
      expect(file).toBeDefined();
      const content = await app.vault.read(file);
      expect(content).toContain("**猫**");
      expect(content).toContain("[Neko]");
    });
  });

  describe("saveVocab - Callout format", () => {
    it("should create new file with callout block when vocabFormat is callout", async () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFormat: "callout",
      });

      const result = await service.saveVocab(sampleResult);

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(false);

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      const content = await app.vault.read(file);

      expect(content).toContain("> [!vocab] ephemeral");
      expect(content).toContain("> - **Phiên âm**: `/ɪˈfem.ər.əl/` (*adjective*)");
      expect(content).toContain("> - **Nghĩa tiếng Việt**: Phù du, chóng tàn");
      expect(content).toContain("> - **Ngữ cảnh**: Fame in the modern world is fleeting and **ephemeral**.");
      expect(content).toContain("> - **Thẻ**: #vocabulary #english-study");
    });

    it("should append second callout block separated by blank line for new word", async () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFormat: "callout",
      });

      await service.saveVocab(sampleResult);

      const secondResult: LookupResult = {
        ...sampleResult,
        query: "serendipity",
        vietnameseTranslation: "Sự tình cờ may mắn",
        contextSentence: "Finding this book was pure serendipity.",
      };

      await service.saveVocab(secondResult);

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      const content = await app.vault.read(file);

      expect(content).toContain("> [!vocab] ephemeral");
      expect(content).toContain("> [!vocab] serendipity");
    });

    it("should detect duplicate word in callout format and set isDuplicate true", async () => {
      service.updateSettings({
        ...defaultSettings,
        vocabFormat: "callout",
      });

      await service.saveVocab(sampleResult);

      const dupResult = await service.saveVocab(sampleResult);
      expect(dupResult.success).toBe(true);
      expect(dupResult.isDuplicate).toBe(true);

      const file = app.vault.getAbstractFileByPath("Vocabulary.md") as TFile;
      const content = await app.vault.read(file);

      const matches = content.match(/> \[!vocab\] ephemeral/g);
      expect(matches?.length).toBe(1);

      expect(Notice.instances[Notice.instances.length - 1].message).toBe(
        "Từ 'ephemeral' đã có trong sổ. Đã bổ sung thêm ngữ cảnh mới!"
      );
    });
  });

  describe("Error handling and resilience", () => {
    it("should catch errors from vault.process, display notice and return success: false", async () => {
      vi.spyOn(app.vault, "process").mockRejectedValueOnce(
        new Error("File is locked by another process")
      );

      const result = await service.saveVocab(sampleResult);

      expect(result.success).toBe(false);
      expect(result.isDuplicate).toBe(false);
      expect(result.filePath).toBe("Vocabulary.md");
      expect(result.error).toBe("File is locked by another process");

      const lastNotice = Notice.instances[Notice.instances.length - 1];
      expect(lastNotice.message).toBe(
        "Không thể ghi vào file từ vựng: File is locked by another process"
      );
    });

    it("should catch error if target path is an existing folder rather than a file", async () => {
      // Simulate folder with same name
      await app.vault.createFolder("Vocabulary.md");

      const result = await service.saveVocab(sampleResult);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      const lastNotice = Notice.instances[Notice.instances.length - 1];
      expect(lastNotice.message).toContain("Không thể ghi vào file từ vựng");
    });
  });
});
