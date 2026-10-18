import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Notice, Setting } from "obsidian";
import { BilingualTranslationModal } from "../../src/ui/BilingualTranslationModal";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("BilingualTranslationModal", () => {
  let app: App;
  let mockTranslationService: any;
  let onCompleteMock: any;

  beforeEach(() => {
    app = new App();
    Notice.instances = [];
    Setting.instances = [];
    mockTranslationService = {
      translateBlocks: vi.fn(),
    };
    onCompleteMock = vi.fn().mockResolvedValue(undefined);
  });

  it("should render initial config view with file info, block count, engine and destination options", () => {
    const markdown = `# Title\n\nParagraph 1.\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\nParagraph 2.`;
    const modal = new BilingualTranslationModal({
      app,
      settings: { ...DEFAULT_SETTINGS },
      fileName: "TestNote.md",
      fileContent: markdown,
      translationService: mockTranslationService,
      onComplete: onCompleteMock,
    });

    modal.open();

    expect(modal.titleEl.textContent).toContain("Dịch Song Ngữ File Markdown");
    // Markdown has 3 translatable blocks: # Title, Paragraph 1, Paragraph 2
    expect(modal.contentEl.textContent).toContain("3");
    expect(modal.contentEl.textContent).toContain("TestNote.md");

    // Setting controls: Engine and Destination
    expect(Setting.instances.length).toBeGreaterThanOrEqual(2);
  });

  it("should switch to progress view and execute translation when start button is clicked", async () => {
    const markdown = `Paragraph 1.`;
    mockTranslationService.translateBlocks.mockImplementation(
      async (blocks: any[], options: any) => {
        options.onProgress?.({
          current: 1,
          total: 1,
          percent: 100,
          currentText: "Paragraph 1.",
        });
        return blocks.map((b) => ({ ...b, translatedText: "Đoạn 1." }));
      }
    );

    const modal = new BilingualTranslationModal({
      app,
      settings: { ...DEFAULT_SETTINGS },
      fileName: "Note.md",
      fileContent: markdown,
      translationService: mockTranslationService,
      onComplete: onCompleteMock,
    });

    modal.open();
    await modal.startTranslation();

    expect(mockTranslationService.translateBlocks).toHaveBeenCalled();
    expect(onCompleteMock).toHaveBeenCalledWith(
      expect.stringContaining("> *Đoạn 1.*"),
      "inplace"
    );
    expect(Notice.instances.some((n) => n.message.includes("thành công"))).toBe(true);
  });

  it("should trigger abort and show cancel notice when cancel button is clicked", async () => {
    const markdown = `Paragraph 1.`;
    mockTranslationService.translateBlocks.mockImplementation(
      async (_blocks: any[], options: any) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new Error("Translation aborted by user"));
          });
        });
      }
    );

    const modal = new BilingualTranslationModal({
      app,
      settings: { ...DEFAULT_SETTINGS },
      fileName: "Note.md",
      fileContent: markdown,
      translationService: mockTranslationService,
      onComplete: onCompleteMock,
    });

    modal.open();
    const translationPromise = modal.startTranslation();
    modal.cancelTranslation();

    await translationPromise;

    expect(Notice.instances.some((n) => n.message.includes("hủy"))).toBe(true);
    expect(onCompleteMock).not.toHaveBeenCalled();
  });
});
