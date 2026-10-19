// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Modal } from "obsidian";
import EnglishStudyPlugin from "../main";
import { DEFAULT_SETTINGS } from "../src/types";
import { ProviderManager } from "../src/services/provider/ProviderManager";
import { ReadingHighlightService } from "../src/services/storage/ReadingHighlightService";
import { applyHighlightsToElement } from "../src/reading/readingHighlightPostProcessor";
import { makeReadingView, deferred, flushPromises } from "./helpers/reading";

let app: App, plugin: EnglishStudyPlugin;
beforeEach(() => {
  app = new App(); plugin = new EnglishStudyPlugin(app, { id: "obsidian-english-study" } as any);
  plugin.settings = { ...DEFAULT_SETTINGS, enableAiTranslation: false, enableAiGrammar: false };
  plugin.readingHighlightService = new ReadingHighlightService();
});
afterEach(() => { plugin.unload(); document.body.replaceChildren(); vi.restoreAllMocks(); });

async function captureExport() {
  const file = await app.vault.create("A.md", "Original A");
  const view = makeReadingView(app, "<p>Original A</p>", "A.md");
  view.file = file; view.editor.setValue("Original A");
  let modal: any;
  vi.spyOn(Modal.prototype, "open").mockImplementation(function (this: Modal) { modal = this; });
  await plugin.openBilingualTranslationModal(file, view.editor);
  return { file, view, modal, complete: (signal?: AbortSignal, destination = "inplace") => modal.onComplete("Translated A", destination, signal) };
}

describe("safe bilingual file commit", () => {
  it("closes_open_export_modals_on_plugin_unload", async () => {
    plugin.load(); await flushPromises();
    const { modal } = await captureExport();
    const close = vi.spyOn(modal, "close"); plugin.unload();
    expect(close).toHaveBeenCalled();
  });
  it("rejects_disk_conflicts_instead_of_overwriting_new_edits", async () => {
    const { file, complete } = await captureExport();
    await app.vault.modify(file, "New edits while translating");
    await expect(complete()).rejects.toThrow();
    expect(await app.vault.read(file)).toBe("New edits while translating");
  });

  it("rejects_unsaved_editor_changes", async () => {
    const { file, view, complete } = await captureExport();
    view.editor.setValue("Unsaved new edits");
    await expect(complete()).rejects.toThrow();
    expect(view.editor.getValue()).toBe("Unsaved new edits");
    expect(await app.vault.read(file)).toBe("Original A");
  });

  it("never_writes_to_a_recycled_editor", async () => {
    const { file, view, complete } = await captureExport();
    const other = await app.vault.create("B.md", "Original B");
    view.file = other; view.editor.setValue("Current B edits");
    await expect(complete()).rejects.toThrow();
    expect(view.editor.getValue()).toBe("Current B edits");
    expect(await app.vault.read(file)).toBe("Original A");
    expect(await app.vault.read(other)).toBe("Original B");
  });

  it("checks_cancellation_at_the_file_write_boundary", async () => {
    const { file, complete } = await captureExport();
    const controller = new AbortController(); controller.abort();
    await expect(complete(controller.signal)).rejects.toThrow();
    expect(await app.vault.read(file)).toBe("Original A");
  });

  it("commits_unchanged_source_through_atomic_process", async () => {
    const { file, view, complete } = await captureExport();
    const process = vi.spyOn(app.vault, "process");
    await complete();
    expect(process).toHaveBeenCalledOnce();
    expect(await app.vault.read(file)).toBe("Translated A");
    expect(view.editor.getValue()).toBe("Translated A");
  });

  it("rechecks_disk_content_inside_the_atomic_callback", async () => {
    const { file, complete } = await captureExport();
    const realProcess = app.vault.process.bind(app.vault);
    vi.spyOn(app.vault, "process").mockImplementation(async (target, update) => {
      await app.vault.modify(file, "Concurrent disk edit");
      return realProcess(target, update);
    });
    await expect(complete()).rejects.toThrow();
    expect(await app.vault.read(file)).toBe("Concurrent disk edit");
  });

  it("refuses_inplace_export_when_the_initial_editor_and_disk_disagree", async () => {
    const file = await app.vault.create("A.md", "Disk revision");
    const view = makeReadingView(app, "<p>Editor revision</p>", "A.md");
    view.file = file; view.editor.setValue("Different editor revision");
    let modal: any;
    vi.spyOn(Modal.prototype, "open").mockImplementation(function (this: Modal) { modal = this; });
    await plugin.openBilingualTranslationModal(file, view.editor);
    await expect(modal.onComplete("Translated older revision", "inplace")).rejects.toThrow();
    expect(await app.vault.read(file)).toBe("Disk revision");
    expect(view.editor.getValue()).toBe("Different editor revision");
  });

  it("never_touches_an_editor_recycled_while_the_disk_commit_finishes", async () => {
    const { file, view, complete } = await captureExport();
    const other = await app.vault.create("B.md", "B source");
    const realProcess = app.vault.process.bind(app.vault);
    vi.spyOn(app.vault, "process").mockImplementation(async (target, update) => {
      const result = await realProcess(target, update);
      view.file = other; view.editor.setValue("B new edits"); return result;
    });
    await complete();
    expect(await app.vault.read(file)).toBe("Translated A");
    expect(view.editor.getValue()).toBe("B new edits");
  });

  it("saves_to_a_new_unique_file_without_overwriting_existing_exports", async () => {
    const { file, complete } = await captureExport();
    const previous = await app.vault.create("A (Bilingual).md", "Previous export");
    await complete(undefined, "new_file");
    expect(await app.vault.read(file)).toBe("Original A");
    expect(await app.vault.read(previous)).toBe("Previous export");
    expect(app.vault.getAbstractFileByPath("A (Bilingual 2).md")).not.toBeNull();
  });
});

function prepareLookup() {
  plugin.providerManager = new ProviderManager(plugin.settings);
  (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
  plugin.floatingPopover = { showLoading: vi.fn(), show: vi.fn(), hide: vi.fn(), updateAiContent: vi.fn(), getElement: () => null } as any;
  (plugin as any).getSelectionBoundingRect = () => ({ top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 });
}

describe("lookup UI operation ownership", () => {
  it("stale_pin_activation_cannot_overwrite_a_newer_sidebar_lookup", async () => {
    prepareLookup();
    vi.spyOn(plugin.providerManager, "lookup").mockImplementation(async text => ({
      query: text, type: "word", contextSentence: text, contextSentenceClean: text,
      vietnameseTranslation: text, timestamp: Date.now(),
    }));
    plugin.sidebarView = { setResult: vi.fn() } as any;
    const activation = deferred<void>();
    vi.spyOn(plugin, "activateSidebarView").mockReturnValue(activation.promise);
    await plugin.performLookupFromReading("First", "First");
    const [, result, callbacks] = vi.mocked(plugin.floatingPopover.show).mock.calls[0];
    callbacks.onPinToSidebar!(result);
    await plugin.performLookupFromReading("Second", "Second");
    expect(plugin.sidebarView!.setResult).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Second" }));
    activation.resolve(); await flushPromises();
    expect(plugin.sidebarView!.setResult).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Second" }));
  });

  it("pinning_keeps_background_ai_alive_without_reopening_the_popover", async () => {
    prepareLookup(); let update: any;
    const base = { query: "Pinned", type: "word" as const, contextSentence: "Pinned", contextSentenceClean: "Pinned",
      vietnameseTranslation: "Base", timestamp: Date.now(), aiLoading: true };
    vi.spyOn(plugin.providerManager, "lookup").mockImplementation(async (_text, _raw, _offset, _settings, _context, callback) => {
      update = callback; return base;
    });
    const cancel = vi.spyOn(plugin.providerManager, "cancelPending");
    plugin.sidebarView = { setResult: vi.fn() } as any;
    vi.spyOn(plugin, "activateSidebarView").mockResolvedValue();
    await plugin.performLookupFromReading("Pinned", "Pinned");
    const callbacks = vi.mocked(plugin.floatingPopover.show).mock.calls[0][2];
    callbacks.onPinToSidebar!(base); await flushPromises();
    update({ ...base, aiLoading: false, aiTranslation: "AI result" });
    expect(cancel).not.toHaveBeenCalled();
    expect(plugin.sidebarView!.setResult).toHaveBeenLastCalledWith(expect.objectContaining({ aiLoading: false, aiTranslation: "AI result" }));
    expect(plugin.floatingPopover.show).toHaveBeenCalledOnce();
  });

  it("late_abort_from_an_older_lookup_does_not_hide_the_new_result", async () => {
    prepareLookup(); const gate = deferred<any>();
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: vi.fn((text: string) => text.startsWith("Old") ? gate.promise : Promise.resolve({ translation: "New", detectedLang: "en" })) };
    const old = plugin.performLookupFromReading("Old lookup sentence.", "Old lookup sentence."); await flushPromises();
    await plugin.performLookupFromReading("New lookup sentence.", "New lookup sentence.");
    gate.resolve({ translation: "Old", detectedLang: "en" }); await old;
    expect(plugin.floatingPopover.hide).not.toHaveBeenCalled();
    expect(plugin.floatingPopover.show).toHaveBeenCalledOnce();
  });

  it("dismissed_pending_lookup_cannot_resurrect_the_popover", async () => {
    prepareLookup(); const gate = deferred<any>();
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: vi.fn(() => gate.promise) };
    const pending = plugin.performLookupFromReading("Pending sentence.", "Pending sentence."); await flushPromises();
    plugin.dismissFloatingUi(); gate.resolve({ translation: "Late", detectedLang: "en" }); await pending;
    expect(plugin.floatingPopover.show).not.toHaveBeenCalled();
  });

  it("unloaded_plugin_ignores_a_pending_result", async () => {
    prepareLookup(); const gate = deferred<any>();
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: vi.fn(() => gate.promise) };
    const pending = plugin.performLookupFromReading("Pending sentence.", "Pending sentence."); await flushPromises();
    await plugin.onunload(); gate.resolve({ translation: "Late", detectedLang: "en" }); await pending;
    expect(plugin.floatingPopover.show).not.toHaveBeenCalled();
  });
});

describe("highlight integration boundary", () => {
  it("no_range_fallback_only_wraps_readable_note_text", () => {
    const view = makeReadingView(app,
      '<p id="readable">Shared text</p><div contenteditable="true"><p>Shared text</p></div>' +
      '<div class="cm-editor"><p>Shared text</p></div><p contenteditable="false">Shared text</p>', "A.md");
    const originalText = view.contentEl.textContent;
    expect(plugin.applyLiveReadingHighlight("yellow", "Shared text", null, view)).toBe(true);
    expect(view.contentEl.querySelector("#readable mark")?.textContent).toBe("Shared text");
    expect(view.contentEl.querySelector('[contenteditable="true"] mark, .cm-editor mark')).toBeNull();
    expect(view.contentEl.querySelector('[contenteditable="false"] mark')?.textContent).toBe("Shared text");
    expect(view.contentEl.textContent).toBe(originalText);
  });

  it("does_not_persist_or_wrap_an_editable_preview_widget", () => {
    const view = makeReadingView(app, '<p contenteditable="true">Editable widget text</p>', "A.md");
    const range = document.createRange(); range.selectNodeContents(view.contentEl.firstElementChild);
    expect(plugin.applyLiveReadingHighlight("yellow", "Editable widget text", range, view)).toBe(false);
    expect(view.contentEl.querySelector("mark")).toBeNull();
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
  });

  it("rejects_a_range_owned_by_another_pane", () => {
    const left = makeReadingView(app, "<p>Left pane</p>", "A.md");
    const right = makeReadingView(app, "<p>Right pane</p>", "B.md");
    const range = document.createRange(); range.selectNodeContents(right.contentEl.firstElementChild);
    expect(plugin.applyLiveReadingHighlight("yellow", "Right pane", range, left)).toBe(false);
    expect(right.contentEl.querySelector("mark")).toBeNull();
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
  });

  it("rejects_a_selection_spanning_an_editable_widget", () => {
    const view = makeReadingView(app, '<p>Start</p><div contenteditable="true">Widget</div><p>End</p>', "A.md");
    const range = document.createRange(); range.setStart(view.contentEl.firstElementChild.firstChild, 0);
    range.setEnd(view.contentEl.lastElementChild.firstChild, 3);
    expect(plugin.applyLiveReadingHighlight("yellow", range.toString(), range, view)).toBe(false);
    expect(view.contentEl.querySelector("mark")).toBeNull();
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
  });

  it("erases_all_fragments_of_the_removed_record_and_no_other_records", () => {
    const view = makeReadingView(app, "<p>a <strong>neural</strong> network learns</p>", "A.md");
    plugin.readingHighlightService.addHighlight("A.md", "a neural network learns", "yellow");
    applyHighlightsToElement(view.contentEl, plugin.readingHighlightService.getHighlights("A.md"));
    expect(view.contentEl.querySelectorAll("mark").length).toBeGreaterThan(1);
    plugin.clearLiveReadingHighlight("neural", view);
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
    expect(view.contentEl.querySelectorAll("mark")).toHaveLength(0);
  });

  it("registers_path_migration_on_vault_rename_and_delete", async () => {
    const file = await app.vault.create("A.md", "Original");
    plugin.load(); await flushPromises();
    plugin.readingHighlightService.addHighlight("A.md", "Original", "yellow");
    const rename = app.vault.on.mock.calls.find(call => call[0] === "rename")?.[1];
    const remove = app.vault.on.mock.calls.find(call => call[0] === "delete")?.[1];
    expect(rename).toBeTypeOf("function"); expect(remove).toBeTypeOf("function");
    file.path = "Renamed.md"; rename!(file, "A.md");
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
    expect(plugin.readingHighlightService.getHighlights("Renamed.md")).toHaveLength(1);
    remove!(file);
    expect(plugin.readingHighlightService.getHighlights("Renamed.md")).toHaveLength(0);
  });

  it("serializes_settings_snapshots_to_avoid_reordered_highlight_writes", async () => {
    const first = deferred<void>(); const saved: any[] = [];
    vi.spyOn(plugin, "saveData").mockImplementation(async snapshot => {
      if (!saved.length) { saved.push(snapshot); await first.promise; }
      else saved.push(snapshot);
    });
    plugin.readingHighlightService.addHighlight("A.md", "alpha", "yellow");
    const firstSave = plugin.saveSettings(); await flushPromises();
    plugin.readingHighlightService.addHighlight("A.md", "beta", "blue");
    const secondSave = plugin.saveSettings(); await flushPromises();
    expect(saved).toHaveLength(1);
    expect(saved[0].readingHighlights["A.md"]).toHaveLength(1);
    first.resolve(); await Promise.all([firstSave, secondSave]);
    expect(saved[1].readingHighlights["A.md"]).toHaveLength(2);
  });

  it("rejects_live_highlighting_in_source_mode", () => {
    const view = makeReadingView(app, '<div contenteditable="true"><p>Editor text</p></div>', "A.md"); view.mode = "source";
    expect(plugin.applyLiveReadingHighlight("yellow", "Editor", null, view)).toBe(false);
    expect(plugin.clearLiveReadingHighlight("Editor", view)).toBe(false);
    expect(plugin.readingHighlightService.getHighlights("A.md")).toHaveLength(0);
  });
});
