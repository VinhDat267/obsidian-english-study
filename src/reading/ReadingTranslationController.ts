import { App, Component, MarkdownRenderChild, MarkdownView, Notice } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { DocumentContextMeta, PluginSettings } from "../types";
import { extractReadingBlocks } from "./blockExtractor";
import { ReadingTranslationService } from "./ReadingTranslationService";
import { ReadingTranslationRenderer } from "./ReadingTranslationRenderer";
import type { ReadingBlock, ReadingTranslationConfig, ReadingTranslationSession, ReadingTranslationView } from "./types";

interface BlockEntry { block: ReadingBlock; started: boolean; pending: boolean; view?: ReadingTranslationView }
interface Section {
  el: HTMLElement; active: boolean; entries: BlockEntry[];
  child: MarkdownRenderChild; transport: ReadingTranslationSession; cleanup: () => void;
}
interface PaneSession {
  view: MarkdownView; path: string; root: HTMLElement; active: boolean;
  config: ReadingTranslationConfig; sections: Map<HTMLElement, Section>;
}
interface TrackedView { action: HTMLElement; observer?: MutationObserver; disposeAction: () => void }

export class ReadingTranslationController extends Component {
  private panes = new Map<MarkdownView, PaneSession>();
  private tracked = new Map<MarkdownView, TrackedView>();
  private renderer = new ReadingTranslationRenderer();
  private settingsSnapshot: ReadingTranslationConfig;
  private running = false;
  private syncScheduled = false;

  constructor(private app: App, private service: ReadingTranslationService, private getSettings: () => PluginSettings) {
    super();
    this.settingsSnapshot = this.config();
  }

  onload(): void {
    this.running = true;
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncWorkspace()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.syncWorkspace()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncWorkspace()));
    this.app.workspace.onLayoutReady(() => { if (this.running) this.syncWorkspace(); });
  }

  onunload(): void {
    this.running = false;
    for (const view of Array.from(this.panes.keys())) this.stop(view);
    for (const tracked of this.tracked.values()) { tracked.observer?.disconnect(); tracked.disposeAction(); }
    this.tracked.clear();
    this.service.dispose();
  }

  isEnabled(view: MarkdownView): boolean {
    const pane = this.panes.get(view);
    return Boolean(pane && this.valid(pane));
  }

  toggle(view: MarkdownView): void {
    if (!this.running || view.getMode() !== "preview" || !view.file) return;
    if (this.panes.has(view)) { this.stop(view); this.updateAction(view); return; }
    const config = this.config();
    if (config.engine === "gemini" && !config.apiKey.trim()) {
      new Notice("Cần cấu hình Gemini API key trước khi dịch song ngữ khi đọc.");
      return;
    }
    const pane: PaneSession = {
      view, path: view.file.path, root: view.previewMode.containerEl,
      active: true, config, sections: new Map(),
    };
    this.panes.set(view, pane);
    this.updateAction(view);
    const scroll = view.previewMode.getScroll();
    view.previewMode.rerender(true);
    const owner = pane.root.ownerDocument.defaultView;
    const restoreScroll = () => { if (this.valid(pane)) view.previewMode.applyScroll(scroll); };
    if (owner?.requestAnimationFrame) owner.requestAnimationFrame(restoreScroll);
    else restoreScroll();
  }

  processSection(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    if (!this.running || el.closest(".internal-embed,.markdown-embed,.polyglot-reading-translation")) return;
    const pane = Array.from(this.panes.values()).find(item =>
      this.valid(item) && item.path === ctx.sourcePath && item.root.contains(el));
    if (!pane) return;
    const previous = pane.sections.get(el);
    if (previous) this.destroySection(pane, previous);
    const blocks = extractReadingBlocks(el);
    if (!blocks.length) return;
    const child = new MarkdownRenderChild(el);
    const section: Section = {
      el, active: true, entries: blocks.map(block => ({ block, started: false, pending: false })),
      child, transport: this.service.createSession(pane.config), cleanup: () => {},
    };
    pane.sections.set(el, section);
    child.register(() => this.destroySection(pane, section));
    ctx.addChild(child);
    if (!section.active || !this.valid(pane)) return;
    this.observeSection(pane, section);
  }

  updateSettings(): void {
    const next = this.config();
    if (JSON.stringify(next) === JSON.stringify(this.settingsSnapshot)) return;
    this.settingsSnapshot = next;
    for (const view of Array.from(this.panes.keys())) { this.stop(view); this.updateAction(view); }
    this.service.clearCache();
  }

  syncWorkspace(): void {
    if (!this.running) return;
    const views = new Set(this.app.workspace.getLeavesOfType("markdown")
      .map(leaf => leaf.view).filter((view): view is MarkdownView => view instanceof MarkdownView));
    for (const [view, tracked] of this.tracked) {
      if (!views.has(view)) {
        this.stop(view); tracked.observer?.disconnect(); tracked.disposeAction(); this.tracked.delete(view);
      }
    }
    for (const view of views) {
      if (!this.tracked.has(view)) {
        const action = view.addAction("languages", "Bật/tắt dịch song ngữ khi đọc", () => this.toggle(view));
        const onKeydown = (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) this.toggle(view);
        };
        if (action.tagName !== "BUTTON") {
          action.setAttribute("role", "button"); action.tabIndex = 0;
          action.addEventListener("keydown", onKeydown);
        }
        const disposeAction = () => { action.removeEventListener("keydown", onKeydown); action.remove(); };
        const owner = view.containerEl.ownerDocument?.defaultView;
        const Observer = owner?.MutationObserver;
        const observer = Observer ? new Observer((records: MutationRecord[]) => {
          const relevant = records.some(record => {
            const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
            if (target?.closest(".polyglot-reading-translation")) return false;
            const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
            return record.type === "attributes" || !nodes.every(node => node.nodeType === 1 && (node as Element).matches(".polyglot-reading-translation"));
          });
          if (relevant && !this.syncScheduled) {
            this.syncScheduled = true;
            void Promise.resolve().then(() => { this.syncScheduled = false; this.syncWorkspace(); });
          }
        }) : undefined;
        observer?.observe(view.containerEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        this.tracked.set(view, { action, observer, disposeAction });
      }
      const pane = this.panes.get(view);
      if (pane && !this.valid(pane)) this.stop(view);
      else if (pane) {
        for (const section of Array.from(pane.sections.values())) {
          if (!pane.root.contains(section.el) || !section.el.isConnected) this.destroySection(pane, section);
        }
      }
      this.updateAction(view);
    }
  }

  private config(): ReadingTranslationConfig {
    const settings = this.getSettings();
    return {
      engine: settings.readingTranslationEngine || "google",
      sourceLang: settings.sourceLanguage || "auto", targetLang: settings.targetLanguage || "vi",
      endpointUrl: settings.translateEndpointUrl, apiKey: settings.geminiApiKey,
      model: "gemini-flash-latest",
    };
  }

  private valid(pane: PaneSession): boolean {
    return this.running && pane.active && this.panes.get(pane.view) === pane &&
      pane.view.getMode() === "preview" && pane.view.file?.path === pane.path &&
      pane.view.previewMode.containerEl === pane.root && pane.root.isConnected;
  }

  private blockValid(pane: PaneSession, section: Section, block: ReadingBlock): boolean {
    return this.valid(pane) && section.active && pane.sections.get(section.el) === section &&
      pane.root.contains(block.anchor.parent) &&
      (!block.anchor.before || block.anchor.before.parentNode === block.anchor.parent) &&
      block.sourceNodes.every(node => node.isConnected && section.el.contains(node));
  }

  private stop(view: MarkdownView): void {
    const pane = this.panes.get(view);
    if (!pane) return;
    pane.active = false;
    for (const section of Array.from(pane.sections.values())) { this.destroySection(pane, section); section.child.unload(); }
    this.panes.delete(view);
  }

  private destroySection(pane: PaneSession, section: Section): void {
    if (!section.active) return;
    section.active = false; section.cleanup(); section.transport.cancel();
    section.entries.forEach(entry => entry.view?.dispose());
    if (pane.sections.get(section.el) === section) pane.sections.delete(section.el);
  }

  private updateAction(view: MarkdownView): void {
    const action = this.tracked.get(view)?.action;
    if (!action) return;
    action.style.display = view.getMode() === "preview" ? "" : "none";
    action.setAttribute("aria-pressed", String(this.isEnabled(view)));
    action.setAttribute("aria-label", this.isEnabled(view) ? "Tắt dịch song ngữ khi đọc" : "Bật dịch song ngữ khi đọc");
  }

  private buildContext(view: MarkdownView, block: ReadingBlock): DocumentContextMeta {
    const file = view.file!;
    const tags = this.app.metadataCache.getFileCache(file)?.frontmatter?.tags;
    let heading = block.heading;
    if (!heading) {
      for (const element of Array.from(view.previewMode.containerEl.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
        if (element.compareDocumentPosition(block.sourceNodes[0]) & 4) heading = element.textContent?.trim();
      }
    }
    return {
      noteTitle: file.basename, folderPath: file.parent?.path === "/" ? undefined : file.parent?.path,
      tags: Array.isArray(tags) ? tags.map(String) : typeof tags === "string" ? tags.split(/[,\s]+/).filter(Boolean) : undefined,
      heading,
    };
  }

  private run(pane: PaneSession, section: Section, entry: BlockEntry): void {
    if (entry.pending || !this.blockValid(pane, section, entry.block)) return;
    entry.started = true; entry.pending = true;
    const retry = () => this.run(pane, section, entry);
    entry.view ??= this.renderer.mount(entry.block, retry);
    entry.view.loading();
    void section.transport.enqueue({
      blockId: entry.block.id, text: entry.block.text, cacheSeed: entry.block.cacheSeed,
      protectedTokens: entry.block.fragments.map(fragment => fragment.token),
      context: this.buildContext(pane.view, entry.block),
    }).then(result => {
      entry.pending = false;
      if (this.blockValid(pane, section, entry.block)) entry.view?.show(result);
    });
  }

  private observeSection(pane: PaneSession, section: Section): void {
    const targets = new Map<Element, BlockEntry[]>();
    for (const entry of section.entries) {
      const node = entry.block.sourceNodes[0];
      const target = node.nodeType === 1 ? node as Element : node.parentElement!;
      const entries = targets.get(target) || []; entries.push(entry); targets.set(target, entries);
    }
    const owner = pane.root.ownerDocument.defaultView;
    const Observer = owner?.IntersectionObserver;
    if (Observer) {
      const observer = new Observer(entries => {
        for (const event of entries) {
          if (!event.isIntersecting) continue;
          for (const entry of targets.get(event.target) || []) if (!entry.started) this.run(pane, section, entry);
          observer.unobserve(event.target);
        }
      }, { root: pane.root, rootMargin: "300px" });
      section.cleanup = () => observer.disconnect();
      targets.forEach((_entries, target) => observer.observe(target));
    } else {
      const check = () => {
        const bounds = pane.root.getBoundingClientRect();
        targets.forEach((entries, target) => {
          const rect = target.getBoundingClientRect();
          if (rect.bottom >= bounds.top - 300 && rect.top <= bounds.bottom + 300) {
            entries.forEach(entry => { if (!entry.started) this.run(pane, section, entry); });
          }
        });
      };
      pane.root.addEventListener("scroll", check, true); owner?.addEventListener("resize", check);
      section.cleanup = () => { pane.root.removeEventListener("scroll", check, true); owner?.removeEventListener("resize", check); };
      check();
    }
  }
}
