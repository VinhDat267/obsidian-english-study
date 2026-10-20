// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import EnglishStudyPlugin from "../main";
import { EnglishStudySidebar } from "../src/ui/SidebarView";
import { ReadingHighlightService } from "../src/services/storage/ReadingHighlightService";
import { createReadingHighlightPostProcessor } from "../src/reading/readingHighlightPostProcessor";
import { deferred, flushPromises, makeReadingView } from "./helpers/reading";

let app: App;
let plugin: EnglishStudyPlugin;
beforeEach(async () => {
  app = new App();
  plugin = new EnglishStudyPlugin(app, { id: "obsidian-english-study" } as any);
  await plugin.onload();
});

it("list selection stays one saved highlight through undo, redo and restoration", () => {
  const html = '<ol>\n<li>First estimate.</li>\n<li>Unclear requirements.</li>\n<li>Estimating is a PM skill.</li>\n<li>Unproven technology.</li>\n</ol>';
  const view = makeReadingView(app, html, "list.md");
  const root = view.contentEl as HTMLElement;
  const items = root.querySelectorAll("li");
  const range = document.createRange();
  range.setStart(items[0].firstChild!, 0);
  range.setEnd(items[3].firstChild!, items[3].textContent!.length);
  const text = "First estimate.\nUnclear requirements.\nEstimating is a PM skill.\nUnproven technology.";
  plugin.applyLiveReadingHighlight("yellow", text, range, view);
  const saved = plugin.readingHighlightService.getHighlights("list.md");
  expect(saved).toHaveLength(1);
  expect(view.contentEl.querySelectorAll("mark")).toHaveLength(4);
  expect(plugin.undoReadingHighlight(view)).toBe(true);
  expect(view.contentEl.querySelector("mark")).toBeNull();
  expect(plugin.redoReadingHighlight(view)).toBe(true);
  expect(view.contentEl.querySelectorAll("mark")).toHaveLength(4);

  const reloaded = new ReadingHighlightService(JSON.parse(JSON.stringify(plugin.readingHighlightService.getAllHighlights())));
  const restoredView = makeReadingView(app, html, "list.md");
  const restoredRoot = restoredView.contentEl as HTMLElement;
  createReadingHighlightPostProcessor(reloaded)(restoredRoot, { sourcePath: "list.md" } as any);
  expect(Array.from(restoredRoot.querySelectorAll("mark"), mark => mark.dataset.highlightId)).toEqual([saved[0].id, saved[0].id, saved[0].id, saved[0].id]);
  expect(Array.from(restoredRoot.querySelector("ol")!.children, child => child.tagName)).toEqual(["LI", "LI", "LI", "LI"]);
});
afterEach(async () => {
  await plugin.onunload();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("F02: scroll preserves the visible lookup operation", () => {
  it("finishes a pending Google lookup after the note scrolls", async () => {
    const view = makeReadingView(app, "<p>hello</p>", "A.md");
    const google = deferred<any>();
    (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: () => google.promise };
    const lookup = plugin.performLookupFromReading("hello", "hello");
    expect(document.querySelector(".popover-loading")).not.toBeNull();
    plugin.domEvents.find(event => event.type === "scroll")!.callback({ target: view.contentEl });
    google.resolve({ translation: "xin chào", detectedLang: "en" });
    expect((await lookup)?.vietnameseTranslation).toBe("xin chào");
    expect(document.querySelector(".popover-loading")).toBeNull();
    expect(plugin.floatingPopover.getElement()?.textContent).toContain("xin chào");
  });

  it("renders the pending AI result after the note scrolls", async () => {
    const view = makeReadingView(app, "<p>hello</p>", "A.md");
    plugin.settings.enableAiGrammar = true;
    plugin.settings.geminiApiKey = "test-key";
    const grammar = deferred<string>();
    (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: async () => ({ translation: "xin chào", detectedLang: "en" }) };
    vi.spyOn(plugin.providerManager.getGeminiService(), "analyzeGrammar").mockReturnValue(grammar.promise);
    await plugin.performLookupFromReading("hello", "hello");
    plugin.domEvents.find(event => event.type === "scroll")!.callback({ target: view.contentEl });
    grammar.resolve("A greeting used as an interjection.");
    await flushPromises();
    expect(plugin.floatingPopover.getElement()?.querySelector(".vocab-ai-content")?.textContent).toContain("A greeting used as an interjection.");
    expect(plugin.floatingPopover.getElement()?.querySelector(".vocab-ai-loading")).toBeNull();
  });
});

describe("F03: highlight history follows Vault identity changes", () => {
  it.each([
    ["A.md", "B.md", "A.md", "B.md"],
    ["Notes/A.md", "Renamed/A.md", "Notes", "Renamed"],
  ])("preserves undo and redo after moving %s to %s", (oldPath, newPath, oldEventPath, newEventPath) => {
    const view = makeReadingView(app, "<p>hello</p>", oldPath);
    plugin.applyLiveReadingHighlight("yellow", "hello", null, view);
    plugin.applyLiveReadingHighlight("green", "hello", null, view);
    plugin.undoReadingHighlight(view);
    view.file!.path = newPath;
    app.vault.on.mock.calls.find(([name]) => name === "rename")![1]({ path: newEventPath }, oldEventPath);
    expect(plugin.undoReadingHighlight(view)).toBe(true);
    expect(plugin.readingHighlightService.getHighlights(newPath)).toHaveLength(0);
    expect(plugin.redoReadingHighlight(view)).toBe(true);
    expect(plugin.readingHighlightService.getHighlights(newPath)[0].color).toBe("yellow");
    expect(plugin.redoReadingHighlight(view)).toBe(true);
    expect(plugin.readingHighlightService.getHighlights(newPath)[0].color).toBe("green");
    expect(plugin.highlightHistory.canUndo(oldPath)).toBe(false);
    expect(plugin.highlightHistory.canRedo(oldPath)).toBe(false);
  });

  it.each(["A.md", "Notes/A.md"])("cannot restore deleted history into a replacement %s", path => {
    const view = makeReadingView(app, "<p>hello</p>", path);
    plugin.applyLiveReadingHighlight("yellow", "hello", null, view);
    plugin.clearLiveReadingHighlight("hello", view);
    const sibling = makeReadingView(app, "<p>other</p>", "NotesBackup/B.md");
    plugin.applyLiveReadingHighlight("blue", "other", null, sibling);
    app.vault.on.mock.calls.find(([name]) => name === "delete")![1]({ path: path.startsWith("Notes/") ? "Notes" : path });
    const replacement = makeReadingView(app, "<p>A new note with hello</p>", path);
    expect(plugin.undoReadingHighlight(replacement)).toBe(false);
    expect(plugin.readingHighlightService.getHighlights(path)).toHaveLength(0);
    expect(plugin.undoReadingHighlight(sibling)).toBe(true);
    expect(plugin.readingHighlightService.getHighlights("NotesBackup/B.md")).toHaveLength(0);
  });
});

it("F04: selecting the same word in another paragraph opens a tutor session for the new context", async () => {
  const view = makeReadingView(app, "<p>The bank approved a loan.</p><p>We sat on the river bank.</p>", "A.md");
  plugin.settings.autoTranslateOnSelection = true;
  plugin.settings.geminiApiKey = "test-key";
  (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
  (plugin.providerManager as any).googleTranslate = { translateWithMeta: async () => ({ translation: "ngân hàng", detectedLang: "en" }) };
  vi.spyOn(plugin as any, "getSelectionBoundingRect").mockReturnValue({ top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 });
  const paragraphs = view.contentEl.querySelectorAll("p");
  const select = (index: number, offset: number) => {
    const range = document.createRange();
    range.setStart(paragraphs[index].firstChild!, offset); range.setEnd(paragraphs[index].firstChild!, offset + 4);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  };
  select(0, 4); (plugin as any).processSelection(); await flushPromises();
  const first = plugin.floatingPopover.getChatDrawer()!.getSession()!;
  expect(first.contextSentence).toBe("The **bank** approved a loan.");
  select(1, 20); (plugin as any).processSelection(); await flushPromises();
  const second = plugin.floatingPopover.getChatDrawer()!.getSession()!;
  expect(second.contextSentence).toBe("We sat on the river **bank**.");
  expect(second.id).not.toBe(first.id);
});

it("F07: pinning a pending drawer turn transfers its answer and loading state to the sidebar", async () => {
  makeReadingView(app, "<p>hello</p>", "A.md");
  plugin.settings.geminiApiKey = "test-key";
  (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
  (plugin.providerManager as any).googleTranslate = { translateWithMeta: async () => ({ translation: "xin chào", detectedLang: "en" }) };
  const reply = deferred<string>();
  vi.spyOn(plugin.providerManager.getGeminiService(), "chatWithTutor").mockReturnValue(reply.promise);
  const sidebar = new EnglishStudySidebar(new WorkspaceLeaf());
  sidebar.setTutorDependencies((plugin as any).aiTutorChatService, plugin.providerManager.getGeminiService(), "test-key");
  vi.spyOn(plugin, "activateSidebarView").mockImplementation(async () => { plugin.sidebarView = sidebar; });
  await plugin.performLookupFromReading("hello", "hello");
  const drawer = plugin.floatingPopover.getChatDrawer()!;
  const session = drawer.getSession()!;
  const sending = (drawer as any).sendMessage("Explain this word");
  plugin.floatingPopover.getElement()!.querySelector<HTMLButtonElement>(".btn-pin-sidebar")!.click();
  await flushPromises();
  expect(sidebar.getActiveTutorSession()).toBe(session);
  expect(sidebar.contentEl.querySelector(".tutor-message-loading")).not.toBeNull();
  reply.resolve("A greeting used when meeting someone."); await sending; await flushPromises();
  expect(session.messages.map(message => message.content)).toEqual(["Explain this word", "A greeting used when meeting someone."]);
  expect(sidebar.contentEl.textContent).toContain("A greeting used when meeting someone.");
  expect(sidebar.contentEl.querySelector(".tutor-message-loading")).toBeNull();
});

describe("F08: automatic reading lookup is independent of pen mode", () => {
  function selectReadingText() {
    const view = makeReadingView(app, "<p>hello</p>", "A.md");
    const range = document.createRange(); range.selectNodeContents(view.contentEl.querySelector("p")!);
    window.getSelection()!.addRange(range);
    vi.spyOn(plugin as any, "getSelectionBoundingRect").mockReturnValue({ top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 });
    (plugin.providerManager as any).freeDict = { lookup: vi.fn(async () => null) };
    (plugin.providerManager as any).googleTranslate = { translateWithMeta: async () => ({ translation: "xin chào", detectedLang: "en" }) };
  }

  for (const penActive of [false, true]) {
    it.each([[true, "icon"], [false, "auto-popup"], [true, "hotkey-only"]] as const)(
      `auto=%s, trigger=%s translates with pen=${penActive}`, async (auto, trigger) => {
        selectReadingText();
        plugin.isPenModeActive = penActive;
        plugin.settings.autoTranslateOnSelection = auto;
        plugin.settings.triggerMode = trigger;
        (plugin as any).processSelection(); await flushPromises();
        expect(plugin.floatingPopover.getElement()).not.toBeNull();
        expect(plugin.floatingPopover.getElement()?.textContent).toContain("xin chào");
        expect(plugin.floatingHighlightToolbar.getElement()).toBeNull();
      }
    );
  }

  it("keeps the manual reading toolbar when automatic translation is off", async () => {
    selectReadingText();
    (plugin as any).processSelection(); await flushPromises();
    expect(plugin.floatingHighlightToolbar.getElement()).not.toBeNull();
    expect(plugin.floatingPopover.getElement()).toBeNull();
  });

  it("keeps hotkey-only mode quiet when automatic translation is off", async () => {
    selectReadingText(); plugin.settings.triggerMode = "hotkey-only";
    (plugin as any).processSelection(); await flushPromises();
    expect(plugin.floatingHighlightToolbar.getElement()).toBeNull();
    expect(plugin.floatingPopover.getElement()).toBeNull();
  });
});
