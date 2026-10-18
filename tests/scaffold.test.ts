import { describe, it, expect, vi } from "vitest";
import {
  requestUrl,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  ItemView,
  TFile,
  Vault,
  App,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type LookupResult,
  type DictDefinition,
  type VocabFormat,
} from "../src/types/index";

describe("Scaffolding and Mocking Environment", () => {
  describe("Obsidian Mock API", () => {
    it("should export requestUrl as a vi mock function", async () => {
      expect(vi.isMockFunction(requestUrl)).toBe(true);
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { test: true },
        text: JSON.stringify({ test: true }),
      });

      const res = await requestUrl({ url: "https://example.com" });
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ test: true });
    });

    it("should provide Notice mock", () => {
      const notice = new Notice("Hello world");
      expect(notice).toBeDefined();
      expect((notice as any).message).toBe("Hello world");
    });

    it("should provide Plugin mock with lifecycle and registration methods", async () => {
      const app = new App();
      const manifest = { id: "test", name: "Test" } as any;
      const plugin = new (Plugin as any)(app, manifest);

      expect(typeof plugin.addCommand).toBe("function");
      expect(typeof plugin.registerDomEvent).toBe("function");
      expect(typeof plugin.registerEvent).toBe("function");
      expect(typeof plugin.registerView).toBe("function");
      expect(typeof plugin.addSettingTab).toBe("function");
      expect(typeof plugin.loadData).toBe("function");
      expect(typeof plugin.saveData).toBe("function");

      await plugin.saveData({ test: 123 });
      const data = await plugin.loadData();
      expect(data).toEqual({ test: 123 });
    });

    it("should provide PluginSettingTab and Setting with chainable methods", () => {
      const app = new App();
      const plugin = new (Plugin as any)(app, {} as any);
      const tab = new (PluginSettingTab as any)(app, plugin);

      expect(typeof tab.display).toBe("function");

      const container = {} as any;
      const setting = new Setting(container);
      expect(setting.setName("Test Name")).toBe(setting);
      expect(setting.setDesc("Test Desc")).toBe(setting);
      expect(setting.addText(() => {})).toBe(setting);
      expect(setting.addDropdown(() => {})).toBe(setting);
      expect(setting.addToggle(() => {})).toBe(setting);
      expect(setting.addButton(() => {})).toBe(setting);
    });

    it("should provide ItemView mock", async () => {
      const leaf = {} as any;
      const view = new (ItemView as any)(leaf);

      expect(typeof view.getViewType).toBe("function");
      expect(typeof view.getDisplayText).toBe("function");
      expect(typeof view.getIcon).toBe("function");
      expect(typeof view.onOpen).toBe("function");
      expect(typeof view.onClose).toBe("function");
      expect(view.contentEl).toBeDefined();
    });

    it("should provide TFile and Vault mocks with atomic process support", async () => {
      const vault = new Vault();
      const file = new TFile();
      (file as any).path = "Vocabulary.md";

      expect(typeof vault.getAbstractFileByPath).toBe("function");
      expect(typeof vault.create).toBe("function");
      expect(typeof vault.modify).toBe("function");
      expect(typeof vault.process).toBe("function");

      await vault.create("Vocabulary.md", "# Vocab");
      const fetched = vault.getAbstractFileByPath("Vocabulary.md");
      expect(fetched).toBeDefined();

      const updated = await vault.process(fetched as any, (content) => content + "\n| word | def |");
      expect(updated).toBe("# Vocab\n| word | def |");
    });

    it("should provide App mock with vault and workspace", () => {
      const app = new App();
      expect(app.vault).toBeDefined();
      expect(app.workspace).toBeDefined();
      expect(typeof app.workspace.on).toBe("function");
    });
  });

  describe("Types and Default Settings", () => {
    it("should have correct DEFAULT_SETTINGS matching specification", () => {
      expect(DEFAULT_SETTINGS).toBeDefined();
      expect(DEFAULT_SETTINGS.triggerMode).toBe("icon");
      expect(DEFAULT_SETTINGS.vocabFilePath).toBe("Vocabulary.md");
      expect(DEFAULT_SETTINGS.vocabFormat).toBe("table");
      expect(DEFAULT_SETTINGS.useDailyNote).toBe(false);
      expect(DEFAULT_SETTINGS.highlightWordInContext).toBe(true);
      expect(DEFAULT_SETTINGS.translateEndpointUrl).toBe("https://translate.googleapis.com");
      expect(DEFAULT_SETTINGS.geminiApiKey).toBe("");
      expect(DEFAULT_SETTINGS.enableAiGrammar).toBe(false);
      expect(DEFAULT_SETTINGS.preferredAccent).toBe("us");
      expect(DEFAULT_SETTINGS.autoPlayAudio).toBe(false);
    });

    it("should support LookupResult data contract", () => {
      const sampleDef: DictDefinition = {
        partOfSpeech: "noun",
        meaningEn: "An idea or explanation.",
        example: "The hypothesis was tested.",
      };

      const format: VocabFormat = "table";
      expect(format).toBe("table");

      const sampleResult: LookupResult = {
        query: "hypothesis",
        type: "word",
        contextSentence: "The hypothesis was tested thoroughly.",
        contextSentenceClean: "The hypothesis was tested thoroughly.",
        phonetic: "/haɪˈpɑː.θə.sɪs/",
        audioUrl: "https://example.com/audio.mp3",
        vietnameseTranslation: "Giả thuyết",
        definitions: [sampleDef],
        aiGrammarNote: "Noun form of hypothetical.",
        timestamp: 1672531199000,
      };

      expect(sampleResult.query).toBe("hypothesis");
      expect(sampleResult.definitions?.[0].partOfSpeech).toBe("noun");
    });
  });
});
