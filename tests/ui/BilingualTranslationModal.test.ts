import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App, Notice, Setting } from "obsidian";
import { BilingualTranslationModal } from "../../src/ui/BilingualTranslationModal";
import { DEFAULT_SETTINGS } from "../../src/types";
import { BilingualTranslationService } from "../../src/services/translation/BilingualTranslationService";
import { GoogleTranslate } from "../../src/services/provider/GoogleTranslate";
import { GeminiService } from "../../src/services/provider/GeminiService";

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

  afterEach(() => {
    vi.restoreAllMocks();
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
      "inplace",
      expect.any(AbortSignal)
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

  function makeModal(translationService = mockTranslationService) {
    return new BilingualTranslationModal({
      app, settings: { ...DEFAULT_SETTINGS }, fileName: "Note.md", fileContent: "Original source.",
      translationService, onComplete: onCompleteMock,
    });
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => { resolve = yes; });
    return { promise, resolve };
  }

  it.each(["cancel", "close"])("does not write after %s while the final translation is pending", async (action) => {
    const gate = deferred<any[]>();
    mockTranslationService.translateBlocks.mockReturnValue(gate.promise);
    const modal = makeModal();
    modal.open();
    const work = modal.startTranslation();
    if (action === "cancel") modal.cancelTranslation();
    else modal.close();
    gate.resolve([{ id: "1", type: "paragraph", rawText: "Original source.", translatableText: "Original source.", translatedText: "Translated source.", skipTranslation: false }]);
    await work;

    expect(onCompleteMock).not.toHaveBeenCalled();
    expect(Notice.instances.some((notice) => notice.message.includes("thành công"))).toBe(false);
  });

  it("does not let a superseded operation write or close its replacement", async () => {
    const oldGate = deferred<any[]>();
    const newGate = deferred<any[]>();
    mockTranslationService.translateBlocks.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(newGate.promise);
    const modal = makeModal();
    modal.open();
    const oldWork = modal.startTranslation();
    const oldOptions = mockTranslationService.translateBlocks.mock.calls[0][1];
    const newWork = modal.startTranslation();
    oldOptions.onProgress({ current: 1, total: 1, percent: 100, currentText: "Stale progress" });
    expect(modal.contentEl.textContent).not.toContain("Stale progress");
    oldGate.resolve([{ id: "1", type: "paragraph", rawText: "Original source.", translatedText: "Old translation", skipTranslation: false }]);
    await oldWork;
    expect(onCompleteMock).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Đang tiến hành");
    newGate.resolve([{ id: "1", type: "paragraph", rawText: "Original source.", translatedText: "New translation", skipTranslation: false }]);
    await newWork;
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
    expect(onCompleteMock.mock.calls[0][0]).toContain("New translation");
  });

  it("passes cancellation through to a pending write and suppresses its success notice", async () => {
    mockTranslationService.translateBlocks.mockResolvedValue([{ id: "1", type: "paragraph", rawText: "Original source.", translatedText: "Translation", skipTranslation: false }]);
    const writeGate = deferred<void>();
    const started = deferred<AbortSignal | undefined>();
    onCompleteMock.mockImplementation((_content: string, _destination: string, signal?: AbortSignal) => {
      started.resolve(signal);
      return writeGate.promise;
    });
    const modal = makeModal();
    modal.open();
    const work = modal.startTranslation();
    const signal = await started.promise;
    modal.cancelTranslation();
    writeGate.resolve();
    await work;

    expect(signal?.aborted).toBe(true);
    expect(Notice.instances.some((notice) => notice.message.includes("thành công"))).toBe(false);
  });

  it.each(["null", "throw", "blank"])("does not write or report success for a Google %s result", async (failure) => {
    const google = new GoogleTranslate();
    const request = vi.spyOn(google, "translateWithMeta");
    if (failure === "throw") request.mockRejectedValue(new Error("Offline request failure"));
    else request.mockResolvedValue(failure === "null" ? null : { translation: "   ", detectedLang: "en" });
    const modal = makeModal(new BilingualTranslationService(google));
    modal.open();
    await modal.startTranslation();

    expect(onCompleteMock).not.toHaveBeenCalled();
    expect(Notice.instances.some((notice) => notice.message.includes("thành công"))).toBe(false);
    expect(Notice.instances.some((notice) => notice.message.includes("Lỗi"))).toBe(true);
  });

  it("does not export a Gemini batch with a missing requested block", async () => {
    const gemini = new GeminiService();
    vi.spyOn(gemini, "translateBatch").mockResolvedValue(new Map([[0, "First translation"]]));
    const modal = new BilingualTranslationModal({
      app,
      settings: { ...DEFAULT_SETTINGS, enableAiTranslation: true, geminiApiKey: "offline-key" },
      fileName: "Note.md", fileContent: "First source.\n\nSecond source.",
      translationService: new BilingualTranslationService(undefined, gemini),
      onComplete: onCompleteMock,
    });
    modal.open();
    await modal.startTranslation();

    expect(onCompleteMock).not.toHaveBeenCalled();
    expect(Notice.instances.some((notice) => notice.message.includes("thành công"))).toBe(false);
    expect(Notice.instances.some((notice) => /Gemini.*block 3/i.test(notice.message))).toBe(true);
  });
});
