// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, MarkdownView, Notice } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/types";
import { ReadingTranslationController } from "../../src/reading/ReadingTranslationController";
import { ReadingTranslationService } from "../../src/reading/ReadingTranslationService";
import type { GoogleTranslate } from "../../src/services/provider/GoogleTranslate";
import type { GeminiService } from "../../src/services/provider/GeminiService";
import { deferred, flushPromises, makeReadingView, makeReadingContext, TestIntersectionObserver } from "../helpers/reading";

let app: App, settings: typeof DEFAULT_SETTINGS, controller: ReadingTranslationController;
const originalObserver = window.IntersectionObserver;
beforeEach(() => {
  app = new App(); settings = { ...DEFAULT_SETTINGS };
  TestIntersectionObserver.instances = [];
  window.IntersectionObserver = TestIntersectionObserver as any;
});
afterEach(() => { controller?.unload(); window.IntersectionObserver = originalObserver; document.body.replaceChildren(); vi.restoreAllMocks(); });

function setup(google: Pick<GoogleTranslate, "translateWithMeta"> = { translateWithMeta: vi.fn(async (text: string) => ({ translation: "Dịch " + text, detectedLang: "en" })) }, gemini?: Pick<GeminiService, "translateBatch">) {
  controller = new ReadingTranslationController(app, new ReadingTranslationService({ google, gemini }), () => settings);
  controller.load();
  return google;
}
function attach(view: MarkdownView) {
  const contexts: ReturnType<typeof makeReadingContext>[] = [];
  view.previewMode.rerender.mockImplementation(() => {
    const context = makeReadingContext(view); contexts.push(context);
    controller.processSection(view.previewMode.containerEl, context.ctx);
  });
  return contexts;
}
async function visible() { TestIntersectionObserver.instances.forEach(observer => observer.emitVisible()); await flushPromises(); }

describe("pane scoped reading translation", () => {
  it("claims_preprocessed_detached_sections_only_after_owning_pane_attachment", async () => {
    const left = makeReadingView(app, "", "Same.md"), right = makeReadingView(app, "", "Same.md");
    const google = setup(); controller.toggle(left); controller.toggle(right);
    const section = document.createElement("section"); section.innerHTML = "<p>Deferred</p>";
    const context = makeReadingContext(right);
    controller.processSection(section, context.ctx);
    await visible(); expect(google.translateWithMeta).not.toHaveBeenCalled();
    right.previewMode.containerEl.append(section); await flushPromises(); await visible();
    expect(right.previewMode.containerEl.querySelector(".polyglot-reading-translation")?.textContent).toBe("Dịch Deferred");
    expect(left.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    context.unload();
    expect(section.querySelector(".polyglot-reading-translation")).toBeNull();
  });

  it.each(["unload", "toggle"])("discards_pending_detached_sections_after_%s", async reason => {
    const view = makeReadingView(app, "", "Note.md"), google = setup(); controller.toggle(view);
    const section = document.createElement("section"); section.innerHTML = "<p>Discarded</p>";
    const context = makeReadingContext(view); controller.processSection(section, context.ctx);
    if (reason === "unload") context.unload();
    else { controller.toggle(view); controller.toggle(view); }
    view.previewMode.containerEl.append(section); await flushPromises(); await visible();
    expect(google.translateWithMeta).not.toHaveBeenCalled();
    expect(section.querySelector(".polyglot-reading-translation")).toBeNull();
  });

  it("preserves_completed_translations_across_viewport_virtualization", async () => {
    const view = makeReadingView(app, "<section><p>Kept</p></section>", "Note.md"), google = setup();
    const section = view.previewMode.containerEl.firstElementChild as HTMLElement;
    view.previewMode.rerender.mockImplementation(() => controller.processSection(section, makeReadingContext(view).ctx));
    controller.toggle(view); await visible();
    const translated = section.querySelector(".polyglot-reading-translation");
    section.remove(); await flushPromises();
    view.previewMode.containerEl.append(section); await flushPromises(); await visible();
    expect(section.querySelector(".polyglot-reading-translation")).toBe(translated);
    expect(translated?.textContent).toBe("Dịch Kept");
    expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
  });

  it("retains_inflight_results_while_the_host_virtualizes_the_section", async () => {
    const view = makeReadingView(app, "<section><p>Pending</p></section>", "Note.md"), gate = deferred<any>();
    const google = setup({ translateWithMeta: vi.fn(() => gate.promise) });
    const section = view.previewMode.containerEl.firstElementChild as HTMLElement;
    view.previewMode.rerender.mockImplementation(() => controller.processSection(section, makeReadingContext(view).ctx));
    controller.toggle(view); await visible(); section.remove(); await flushPromises();
    gate.resolve({ translation: "Đã xong", detectedLang: "en" }); await flushPromises();
    view.previewMode.containerEl.append(section); await flushPromises(); await visible();
    expect(section.querySelector('[data-state="success"]')?.textContent).toBe("Đã xong");
    expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
  });

  it("keeps_unstarted_observation_after_a_detached_visibility_notification", async () => {
    const view = makeReadingView(app, "<section><p>Later</p></section>", "Note.md"), google = setup();
    const section = view.previewMode.containerEl.firstElementChild as HTMLElement;
    view.previewMode.rerender.mockImplementation(() => controller.processSection(section, makeReadingContext(view).ctx));
    controller.toggle(view); section.remove(); await flushPromises(); await visible();
    expect(google.translateWithMeta).not.toHaveBeenCalled();
    view.previewMode.containerEl.append(section); await flushPromises(); await visible();
    expect(section.querySelector(".polyglot-reading-translation")?.textContent).toBe("Dịch Later");
  });

  it("claims_detached_sections_with_the_viewport_fallback", async () => {
    window.IntersectionObserver = undefined as any;
    const view = makeReadingView(app, "", "Note.md"), google = setup(); controller.toggle(view);
    const section = document.createElement("section"); section.innerHTML = "<p>Fallback</p>";
    controller.processSection(section, makeReadingContext(view).ctx);
    await flushPromises(); expect(google.translateWithMeta).not.toHaveBeenCalled();
    view.previewMode.containerEl.append(section); await flushPromises();
    expect(section.querySelector(".polyglot-reading-translation")?.textContent).toBe("Dịch Fallback");
  });

  it("isolates_same_path_in_two_panes_and_waits_for_viewport", async () => {
    const left = makeReadingView(app, "<p>Hello</p>", "Same.md");
    const right = makeReadingView(app, "<p>Hello</p>", "Same.md");
    const google = setup(); attach(left); attach(right);
    controller.toggle(left);
    expect(controller.isEnabled(left)).toBe(true); expect(controller.isEnabled(right)).toBe(false);
    expect(google.translateWithMeta).not.toHaveBeenCalled();
    expect(TestIntersectionObserver.instances[0].rootMargin).toBe("300px");
    await visible();
    expect(left.previewMode.containerEl.querySelector(".polyglot-reading-translation")?.textContent).toBe("Dịch Hello");
    expect(right.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    controller.toggle(left);
    expect(left.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
  });

  it("ignores_final_reply_after_toggle_off", async () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md");
    const gate = deferred<any>();
    setup({ translateWithMeta: vi.fn(() => gate.promise) }); attach(view);
    controller.toggle(view); await visible(); controller.toggle(view);
    gate.resolve({ translation: "Late", detectedLang: "en" }); await flushPromises();
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
  });

  it("unloads_removed_sections_without_resetting_other_sections", async () => {
    const view = makeReadingView(app, "<section><p>One</p></section><section><p>Two</p></section>", "Note.md");
    setup();
    const a = makeReadingContext(view), b = makeReadingContext(view);
    view.previewMode.rerender.mockImplementation(() => {
      controller.processSection(view.previewMode.containerEl.children[0] as HTMLElement, a.ctx);
      controller.processSection(view.previewMode.containerEl.children[1] as HTMLElement, b.ctx);
    });
    controller.toggle(view); await visible();
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(2);
    a.unload();
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(1);
    expect(view.previewMode.containerEl.textContent).toContain("Dịch Two");
    const firstSection = view.previewMode.containerEl.firstElementChild as HTMLElement;
    firstSection.replaceChildren(document.createElement("p")); firstSection.firstChild!.textContent = "New";
    controller.processSection(firstSection, makeReadingContext(view).ctx); await visible();
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(2);
  });

  it("invalidates_changed_settings_without_requesting_again_but_ignores_audio", async () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md"), google = setup(); attach(view);
    controller.toggle(view); await visible();
    settings.autoPlayAudio = true; controller.updateSettings();
    expect(controller.isEnabled(view)).toBe(true);
    settings.targetLanguage = "ja"; controller.updateSettings();
    expect(controller.isEnabled(view)).toBe(false);
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    await flushPromises(); expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
  });

  it("preserves_the_view_source_metadata_when_another_pane_is_active", async () => {
    const left = makeReadingView(app, "<h2>Allocation</h2><p>Memory</p>", "IT/Left.md");
    const right = makeReadingView(app, "<p>Other</p>", "Medicine/Right.md");
    app.workspace.activeLeaf = right.leaf;
    app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ["os"] } });
    const gemini = { translateBatch: vi.fn(async (items: any[], _key?: string, _context?: any) => new Map(items.map(i => [i.id, "Dịch " + i.text]))) };
    settings.readingTranslationEngine = "gemini"; settings.geminiApiKey = "offline";
    setup(undefined, gemini); attach(left); controller.toggle(left); await visible();
    expect(gemini.translateBatch.mock.calls[0][2]).toEqual({ noteTitle: "Left", folderPath: "IT", tags: ["os"], heading: "Allocation" });
    expect(left.previewMode.containerEl.textContent).toContain("Dịch Memory");
  });

  it("removes_sessions_on_file_mode_close_and_unload", async () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md");
    setup(); attach(view); controller.toggle(view); await visible();
    view.file!.path = "Other.md"; controller.syncWorkspace();
    expect(controller.isEnabled(view)).toBe(false);
    controller.toggle(view); await visible(); view.mode = "source"; controller.syncWorkspace();
    expect(controller.isEnabled(view)).toBe(false);
    view.mode = "preview"; controller.toggle(view); await visible();
    app.workspace.leaves = []; controller.syncWorkspace();
    expect(view.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
    expect(view.containerEl.querySelector('[data-icon="languages"]')).toBeNull();
  });

  it("fallback_without_intersection_observer_only_requests_nearby_blocks", async () => {
    window.IntersectionObserver = undefined as any;
    const view = makeReadingView(app, "<p>Near</p><p>Far</p>", "Note.md");
    vi.spyOn(view.previewMode.containerEl, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 500, left: 0, right: 500, width: 500, height: 500 } as any);
    const far = view.previewMode.containerEl.children[1];
    vi.spyOn(far, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2020, left: 0, right: 100 } as any);
    const google = setup(); attach(view); controller.toggle(view); await flushPromises();
    expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(1);
    vi.spyOn(far, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 120, left: 0, right: 100 } as any);
    view.previewMode.containerEl.dispatchEvent(new Event("scroll")); await flushPromises();
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(2);
  });

  it("does_not_translate_embeds_or_attach_a_late_removed_section", async () => {
    const view = makeReadingView(app, '<div class="internal-embed"><p>Embedded</p></div><section><p>Normal</p></section>', "Note.md");
    const gate = deferred<any>(), google = setup({ translateWithMeta: vi.fn(() => gate.promise) });
    const contexts: ReturnType<typeof makeReadingContext>[] = [];
    view.previewMode.rerender.mockImplementation(() => {
      for (const section of Array.from(view.previewMode.containerEl.children)) {
        const context = makeReadingContext(view); contexts.push(context); controller.processSection(section as HTMLElement, context.ctx);
      }
    });
    controller.toggle(view); await visible();
    expect(google.translateWithMeta).toHaveBeenCalledTimes(1);
    contexts[1].unload(); gate.resolve({ translation: "Late", detectedLang: "en" }); await flushPromises();
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")).toBeNull();
  });

  it("missing_gemini_key_keeps_the_view_off", async () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md"), google = setup(); attach(view);
    settings.readingTranslationEngine = "gemini"; controller.updateSettings(); controller.toggle(view); await visible();
    expect(controller.isEnabled(view)).toBe(false); expect(google.translateWithMeta).not.toHaveBeenCalled();
    expect(Notice.instances[Notice.instances.length - 1]?.message).toContain("API key");
  });

  it("cancels_queued_work_for_one_section_without_cancelling_siblings", async () => {
    const view = makeReadingView(app, "<section><p>One</p></section><section><p>Two</p></section><section><p>Three</p></section>", "Note.md");
    const gate = deferred<any>(), google = setup({ translateWithMeta: vi.fn(() => gate.promise) });
    const contexts: ReturnType<typeof makeReadingContext>[] = [];
    view.previewMode.rerender.mockImplementation(() => {
      for (const el of Array.from(view.previewMode.containerEl.children)) {
        const context = makeReadingContext(view); contexts.push(context); controller.processSection(el as HTMLElement, context.ctx);
      }
    });
    controller.toggle(view); await visible();
    contexts[2].unload(); gate.resolve({ translation: "Result", detectedLang: "en" }); await flushPromises();
    expect(google.translateWithMeta).toHaveBeenCalledTimes(2);
    expect(view.previewMode.containerEl.querySelectorAll('[data-state="success"]')).toHaveLength(2);
    expect(controller.isEnabled(view)).toBe(true);
  });

  it("uses_a_popout_documents_observers_and_nodes", async () => {
    const iframe = document.createElement("iframe"); document.body.append(iframe);
    const other = iframe.contentDocument!;
    (iframe.contentWindow as any).IntersectionObserver = TestIntersectionObserver;
    const view = makeReadingView(app, "<p>Other window</p>", "Popout.md");
    other.body.append(view.containerEl);
    setup(); attach(view); controller.toggle(view); await visible();
    expect(view.previewMode.containerEl.querySelector(".polyglot-reading-translation")?.ownerDocument).toBe(other);
    expect(TestIntersectionObserver.instances[0].options.root).toBe(view.previewMode.containerEl);
  });

  it("keeps_only_one_translation_when_a_section_is_processed_again", async () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md");
    setup(); const contexts = attach(view); controller.toggle(view); await visible();
    controller.processSection(view.previewMode.containerEl, makeReadingContext(view).ctx); await visible();
    contexts[0].unload();
    expect(view.previewMode.containerEl.querySelectorAll(".polyglot-reading-translation")).toHaveLength(1);
  });

  it("makes_host_div_actions_keyboard_operable", () => {
    const view = makeReadingView(app, "<p>Hello</p>", "Note.md");
    vi.spyOn(view, "addAction").mockImplementation((_icon, _title, callback) => {
      const action = document.createElement("div");
      action.addEventListener("click", callback);
      view.containerEl.prepend(action); return action;
    });
    setup(); attach(view);
    const action = view.containerEl.firstElementChild as HTMLElement;
    expect(action.getAttribute("role")).toBe("button");
    expect(action.tabIndex).toBe(0);
    action.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(controller.isEnabled(view)).toBe(true);
    action.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(controller.isEnabled(view)).toBe(false);
  });
});
