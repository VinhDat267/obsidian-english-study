// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, requestUrl } from "obsidian";
import EnglishStudyPlugin from "../../main";
import { makeReadingView, makeReadingContext, TestIntersectionObserver, flushPromises, deferred } from "../helpers/reading";

let app: App, plugin: EnglishStudyPlugin, view: ReturnType<typeof makeReadingView>;
const noteContent = "# Study\n\nHello world.";
const response = {
  status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0),
  json: [[["Xin chào thế giới.", "Hello world.", null, null]], null, "en"], text: "",
};
const originalObserver = window.IntersectionObserver;

beforeEach(async () => {
  vi.clearAllMocks();
  window.IntersectionObserver = TestIntersectionObserver as any;
  TestIntersectionObserver.instances = [];
  app = new App();
  const file = await app.vault.create("Study.md", noteContent);
  view = makeReadingView(app, "<p>Hello world.</p>", "Study.md"); view.file = file;
  plugin = new EnglishStudyPlugin(app, { id: "obsidian-english-study" } as any);
  view.previewMode.rerender.mockImplementation(() => {
    const context = makeReadingContext(view);
    plugin.markdownPostProcessors.forEach(process => process(view.previewMode.containerEl, context.ctx));
  });
  vi.spyOn(app.vault, "modify"); vi.spyOn(app.vault, "process"); vi.spyOn(app.vault, "create");
  vi.spyOn(view.editor, "setValue");
  vi.mocked(requestUrl).mockResolvedValue(response);
  plugin.load(); await flushPromises();
});
afterEach(() => { plugin?.unload(); window.IntersectionObserver = originalObserver; document.body.replaceChildren(); vi.restoreAllMocks(); });

const command = () => plugin.commands.find(item => item.id === "toggle-reading-translation")!;
async function visible() { TestIntersectionObserver.instances.forEach(observer => observer.emitVisible()); await flushPromises(); }
async function unchanged() {
  expect(app.vault.modify).not.toHaveBeenCalled(); expect(app.vault.process).not.toHaveBeenCalled();
  expect(app.vault.create).not.toHaveBeenCalled(); expect(view.editor.setValue).not.toHaveBeenCalled();
  expect(await app.vault.read(view.file!)).toBe(noteContent);
}

describe("complete bilingual reading plugin flow", () => {
  it("toggles_real_translation_without_writing_the_note", async () => {
    expect(command()).toBeDefined();
    expect(command().checkCallback!(true)).toBe(true);
    command().checkCallback!(false); await visible();
    await vi.waitFor(() => expect(view.previewMode.containerEl.querySelector('[data-state="success"]')?.textContent).toBe("Xin chào thế giới."));
    const request = vi.mocked(requestUrl).mock.calls[0][0] as any;
    expect(request.url).toContain("/translate_a/single");
    expect(request.url).toContain("tl=vi");
    expect(view.containerEl.querySelector('[data-icon="languages"]')?.getAttribute("aria-pressed")).toBe("true");
    command().checkCallback!(false);
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    await unchanged();
  });

  it("does_not_enable_in_edit_mode", async () => {
    expect(command()).toBeDefined();
    view.mode = "source"; plugin.readingTranslationController!.syncWorkspace();
    expect(command().checkCallback!(true)).toBe(false);
    command().checkCallback!(false); await visible();
    expect(requestUrl).not.toHaveBeenCalled(); await unchanged();
  });

  it.each(["sourceLanguage", "targetLanguage", "translateEndpointUrl", "geminiApiKey"] as const)("saveSettings_invalidates_pending_%s", async field => {
    expect(command()).toBeDefined();
    const gate = deferred<any>(); vi.mocked(requestUrl).mockImplementationOnce(() => gate.promise);
    command().checkCallback!(false); await visible();
    plugin.settings[field] = field === "targetLanguage" ? "ja" : field === "sourceLanguage" ? "fr" : field === "translateEndpointUrl" ? "https://example.test" : "offline-key";
    await plugin.saveSettings(); gate.resolve(response); await flushPromises();
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    expect(plugin.readingTranslationController!.isEnabled(view)).toBe(false); await unchanged();
  });

  it("reports_failure_and_retries_a_single_block_without_writing", async () => {
    expect(command()).toBeDefined();
    vi.mocked(requestUrl).mockResolvedValue({ ...response, status: 503, json: {} });
    command().checkCallback!(false); await visible();
    await vi.waitFor(() => expect(view.previewMode.containerEl.querySelector("button[data-reading-retry]")).not.toBeNull());
    vi.mocked(requestUrl).mockResolvedValue(response);
    (view.previewMode.containerEl.querySelector("button[data-reading-retry]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(view.previewMode.containerEl.querySelector('[data-state="success"]')?.textContent).toBe("Xin chào thế giới."));
    await unchanged();
  });

  it("unload_discards_the_final_response_and_removes_actions", async () => {
    expect(command()).toBeDefined();
    const gate = deferred<any>(); vi.mocked(requestUrl).mockImplementationOnce(() => gate.promise);
    command().checkCallback!(false); await visible(); plugin.unload();
    gate.resolve(response); await flushPromises();
    expect(view.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    expect(view.containerEl.querySelector('[data-icon="languages"]')).toBeNull(); await unchanged();
  });

  it("keeps_grammar_independent_and_never_falls_back_from_missing_gemini_key", async () => {
    expect(command()).toBeDefined();
    plugin.settings.enableAiGrammar = true; await plugin.saveSettings();
    command().checkCallback!(false); await visible();
    await vi.waitFor(() => expect(view.previewMode.containerEl.querySelector('[data-state="success"]')).not.toBeNull());
    expect(vi.mocked(requestUrl).mock.calls.every(([request]) => (request as any).url.includes("/translate_a/single"))).toBe(true);
    plugin.settings.readingTranslationEngine = "gemini"; await plugin.saveSettings();
    vi.mocked(requestUrl).mockClear(); command().checkCallback!(false); await visible();
    expect(requestUrl).not.toHaveBeenCalled(); expect(plugin.readingTranslationController!.isEnabled(view)).toBe(false); await unchanged();
  });
});
