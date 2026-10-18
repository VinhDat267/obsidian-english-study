export function mountReadingHtml(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "markdown-preview-view markdown-rendered";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function flushPromises(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
import { App, MarkdownView, WorkspaceLeaf, TFile, MarkdownRenderChild, MarkdownPostProcessorContext } from "obsidian";

export function makeReadingView(app: App, html: string, path: string): MarkdownView {
  const leaf = new WorkspaceLeaf(), view = new MarkdownView(leaf);
  leaf.view = view; view.app = app; view.mode = "preview";
  const file = new TFile();
  file.path = path; file.name = path.split("/").pop()!;
  file.basename = file.name.replace(/\.md$/, "");
  file.parent = { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/" };
  view.file = file;
  const container = document.createElement("div");
  const content = mountReadingHtml(html);
  container.append(content); document.body.append(container);
  view.containerEl = container; view.contentEl = content;
  view.previewMode.containerEl = content;
  app.workspace.leaves.push(leaf);
  if (!app.workspace.activeLeaf) app.workspace.activeLeaf = leaf;
  return view;
}

let contextId = 0;
export function makeReadingContext(view: MarkdownView) {
  const children: MarkdownRenderChild[] = [];
  const ctx: MarkdownPostProcessorContext = {
    docId: String(++contextId), sourcePath: view.file!.path, frontmatter: null,
    addChild(child) { children.push(child); child.load(); },
    getSectionInfo: () => null,
  };
  return { ctx, unload: () => children.splice(0).forEach(child => child.unload()) };
}

export class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  targets = new Set<Element>();
  rootMargin: string;
  constructor(private callback: IntersectionObserverCallback, public options: IntersectionObserverInit) {
    this.rootMargin = options.rootMargin || "";
    TestIntersectionObserver.instances.push(this);
  }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  emitVisible() {
    this.callback(Array.from(this.targets, target => ({ target, isIntersecting: true } as IntersectionObserverEntry)), this as unknown as IntersectionObserver);
  }
}
