import { vi } from "vitest";

export interface RequestUrlParam {
  url: string;
  method?: string;
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  throw?: boolean;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: any;
  text: string;
}

export const requestUrl = vi.fn(
  async (params: string | RequestUrlParam): Promise<RequestUrlResponse> => {
    return {
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: {},
      text: "{}",
    };
  }
);

export const setIcon = vi.fn((parent: HTMLElement, iconId: string) => {});

export class Notice {
  public static instances: Notice[] = [];
  public message: string;
  public timeout?: number;
  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout;
    Notice.instances.push(this);
  }
  hide(): void {}
}

export class TAbstractFile {
  public path: string = "";
  public name: string = "";
  public parent: any = null;
  public vault: any = null;
}

export class TFile extends TAbstractFile {
  public stat: any = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  public basename: string = "";
  public extension: string = "md";
}

export class TFolder extends TAbstractFile {
  public children: TAbstractFile[] = [];
}

export class Vault {
  private files: Map<string, { file: TFile; content: string }> = new Map();
  private folders: Map<string, TFolder> = new Map();

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const fileEntry = this.files.get(normalized) || this.files.get(path);
    if (fileEntry) return fileEntry.file;
    const folderEntry = this.folders.get(normalized) || this.folders.get(path);
    if (folderEntry) return folderEntry;
    return null;
  }

  async read(file: TFile): Promise<string> {
    const normalized = file.path.replace(/^\/+|\/+$/g, "");
    const entry = this.files.get(normalized) || this.files.get(file.path);
    return entry ? entry.content : "";
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  async create(path: string, data: string): Promise<TFile> {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const file = new TFile();
    file.path = normalized;
    file.name = normalized.split("/").pop() || normalized;
    file.basename = file.name.replace(/\.[^/.]+$/, "");
    file.vault = this;
    this.files.set(normalized, { file, content: data });
    return file;
  }

  async createFolder(path: string): Promise<TFolder> {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    if (this.folders.has(normalized)) {
      throw new Error("Folder already exists.");
    }
    const folder = new TFolder();
    folder.path = normalized;
    folder.name = normalized.split("/").pop() || normalized;
    folder.vault = this;
    this.folders.set(normalized, folder);
    return folder;
  }

  async modify(file: TFile, data: string): Promise<void> {
    const normalized = file.path.replace(/^\/+|\/+$/g, "");
    this.files.set(normalized, { file, content: data });
  }

  async process(file: TFile, fn: (data: string) => string): Promise<string> {
    const current = await this.read(file);
    const updated = fn(current);
    await this.modify(file, updated);
    return updated;
  }

  async delete(file: TFile): Promise<void> {
    const normalized = file.path.replace(/^\/+|\/+$/g, "");
    this.files.delete(normalized);
    this.files.delete(file.path);
    this.folders.delete(normalized);
    this.folders.delete(file.path);
  }
}

export class WorkspaceLeaf {
  public view: any;
  public openFile = vi.fn();
  public setViewState = vi.fn(async (state: any) => {
    return;
  });
}

export class Workspace {
  public activeLeaf: WorkspaceLeaf | null = null;
  public on = vi.fn((name: string, callback: (...args: any[]) => any) => {
    return { name, callback };
  });
  public getLeavesOfType = vi.fn((type: string) => []);
  public getRightLeaf = vi.fn((split: boolean) => new WorkspaceLeaf());
  public revealLeaf = vi.fn();
  public getActiveViewOfType = vi.fn((type: any) => {
    if (this.activeLeaf?.view instanceof type) {
      return this.activeLeaf.view;
    }
    return null;
  });
}

export class App {
  public vault: Vault = new Vault();
  public workspace: Workspace = new Workspace();
}

export function createMockObsidianElement(tag: string = "div"): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const attributes: Record<string, string> = {};
  const classListSet = new Set<string>();
  const children: any[] = [];
  let textContent = "";
  let classNameVal = "";

  const el: any = {
    tagName: tag.toUpperCase(),
    style: {} as Record<string, string>,
    get textContent() {
      if (children.length > 0) {
        return children.map((c) => c.textContent || "").join("");
      }
      return textContent;
    },
    set textContent(val: string) {
      textContent = val;
    },
    get className() {
      return classNameVal;
    },
    set className(val: string) {
      classNameVal = val;
      classListSet.clear();
      val
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classListSet.add(c));
    },
    innerHTML: "",
    parentElement: null as any,
    classList: {
      add: (...classes: string[]) => {
        classes.forEach((cls) => classListSet.add(cls));
        classNameVal = Array.from(classListSet).join(" ");
      },
      remove: (...classes: string[]) => {
        classes.forEach((cls) => classListSet.delete(cls));
        classNameVal = Array.from(classListSet).join(" ");
      },
      contains: (cls: string) => classListSet.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) classListSet.add(cls);
          else classListSet.delete(cls);
        } else {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        }
        classNameVal = Array.from(classListSet).join(" ");
      },
    },
    setAttribute: (name: string, val: string) => {
      attributes[name] = val;
    },
    getAttribute: (name: string) => attributes[name] || null,
    appendChild: (child: any) => {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    removeChild: (child: any) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    },
    remove: () => {
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
    empty: () => {
      children.forEach((c) => (c.parentElement = null));
      children.length = 0;
      textContent = "";
      el.innerHTML = "";
    },
    createEl: (tag: string, options?: any) => {
      const child = createMockObsidianElement(tag);
      if (options) {
        if (typeof options === "string") {
          child.className = options;
        } else {
          if (options.cls) child.className = options.cls;
          if (options.text) child.textContent = options.text;
          if (options.attr) {
            Object.entries(options.attr).forEach(([k, v]) => child.setAttribute(k, String(v)));
          }
          if (options.title) child.setAttribute("title", options.title);
          if (options.type) child.setAttribute("type", options.type);
          if (options.placeholder) child.setAttribute("placeholder", options.placeholder);
        }
      }
      el.appendChild(child);
      return child;
    },
    createDiv: (options?: any) => {
      return el.createEl("div", options);
    },
    createSpan: (options?: any) => {
      return el.createEl("span", options);
    },
    setText: (text: string) => {
      el.textContent = text;
      return el;
    },
    addClass: (cls: string) => {
      el.classList.add(cls);
      return el;
    },
    removeClass: (cls: string) => {
      el.classList.remove(cls);
      return el;
    },
    toggleClass: (cls: string, val?: boolean) => {
      el.classList.toggle(cls, val);
      return el;
    },
    hasClass: (cls: string) => {
      return el.classList.contains(cls);
    },
    addEventListener: (event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: any) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (eventObj: { type: string; [key: string]: any }) => {
      const handlers = listeners[eventObj.type] || [];
      handlers.forEach((h) => h(eventObj));
    },
    contains: (target: any) => {
      if (target === el) return true;
      return children.some((c) => c.contains?.(target) ?? c === target);
    },
    getBoundingClientRect: () => ({
      width: 300,
      height: 600,
      top: 0,
      left: 0,
      right: 300,
      bottom: 600,
    }),
    querySelector: (selector: string): any => {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        if (classListSet.has(className)) return el;
      }
      if (selector.toUpperCase() === tag.toUpperCase()) return el;
      for (const child of children) {
        if (selector.startsWith(".")) {
          const className = selector.slice(1);
          if (child.classList?.contains?.(className)) return child;
        }
        if (child.tagName === selector.toUpperCase()) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (selector: string): any[] => {
      const results: any[] = [];
      for (const child of children) {
        if (selector.startsWith(".")) {
          const className = selector.slice(1);
          if (child.classList?.contains?.(className)) results.push(child);
        }
        if (child.tagName === selector.toUpperCase()) results.push(child);
        if (child.querySelectorAll) {
          results.push(...child.querySelectorAll(selector));
        }
      }
      return results;
    },
    children,
    get childNodes() {
      return children;
    },
    hasChildNodes: () => children.length > 0,
  };

  return el;
}

export class Setting {
  public static instances: Setting[] = [];
  public containerEl: any;
  public name: string = "";
  public desc: string | DocumentFragment = "";
  public isHeading: boolean = false;
  public nameEl: any = {};
  public descEl: any = {};
  public controlEl: any = {};
  public textComponents: any[] = [];
  public dropdownComponents: any[] = [];
  public toggleComponents: any[] = [];
  public buttonComponents: any[] = [];

  constructor(containerEl: any) {
    this.containerEl = containerEl;
    Setting.instances.push(this);
  }

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.desc = desc;
    return this;
  }

  setHeading(): this {
    this.isHeading = true;
    return this;
  }

  setClass(cls: string): this {
    return this;
  }

  setTooltip(tooltip: string): this {
    return this;
  }

  setDisabled(disabled: boolean): this {
    return this;
  }

  addText(cb: (text: any) => any): this {
    const textComponent = {
      _value: "",
      _placeholder: "",
      _onChange: null as any,
      setValue: vi.fn((val: string) => {
        textComponent._value = val;
        return textComponent;
      }),
      getValue: vi.fn(() => textComponent._value),
      setPlaceholder: vi.fn((ph: string) => {
        textComponent._placeholder = ph;
        return textComponent;
      }),
      onChange: vi.fn((handler: (val: string) => any) => {
        textComponent._onChange = handler;
        return textComponent;
      }),
      inputEl: { type: "text" },
    };
    cb(textComponent);
    this.textComponents.push(textComponent);
    return this;
  }

  addDropdown(cb: (dropdown: any) => any): this {
    const dropdownComponent = {
      _value: "",
      _options: {} as Record<string, string>,
      _onChange: null as any,
      addOption: vi.fn((val: string, display: string) => {
        dropdownComponent._options[val] = display;
        return dropdownComponent;
      }),
      addOptions: vi.fn((opts: Record<string, string>) => {
        Object.assign(dropdownComponent._options, opts);
        return dropdownComponent;
      }),
      setValue: vi.fn((val: string) => {
        dropdownComponent._value = val;
        return dropdownComponent;
      }),
      getValue: vi.fn(() => dropdownComponent._value),
      onChange: vi.fn((handler: (val: string) => any) => {
        dropdownComponent._onChange = handler;
        return dropdownComponent;
      }),
      selectEl: {},
    };
    cb(dropdownComponent);
    this.dropdownComponents.push(dropdownComponent);
    return this;
  }

  addToggle(cb: (toggle: any) => any): this {
    const toggleComponent = {
      _value: false,
      _onChange: null as any,
      setValue: vi.fn((val: boolean) => {
        toggleComponent._value = val;
        return toggleComponent;
      }),
      getValue: vi.fn(() => toggleComponent._value),
      onChange: vi.fn((handler: (val: boolean) => any) => {
        toggleComponent._onChange = handler;
        return toggleComponent;
      }),
      toggleEl: {},
    };
    cb(toggleComponent);
    this.toggleComponents.push(toggleComponent);
    return this;
  }

  addButton(cb: (button: any) => any): this {
    const buttonComponent = {
      _buttonText: "",
      _icon: "",
      _cls: "",
      _tooltip: "",
      _onClick: null as any,
      setButtonText: vi.fn((text: string) => {
        buttonComponent._buttonText = text;
        return buttonComponent;
      }),
      setIcon: vi.fn((icon: string) => {
        buttonComponent._icon = icon;
        return buttonComponent;
      }),
      setClass: vi.fn((cls: string) => {
        buttonComponent._cls = cls;
        return buttonComponent;
      }),
      setTooltip: vi.fn((tooltip: string) => {
        buttonComponent._tooltip = tooltip;
        return buttonComponent;
      }),
      setWarning: vi.fn().mockReturnThis(),
      setCta: vi.fn().mockReturnThis(),
      onClick: vi.fn((handler: () => any) => {
        buttonComponent._onClick = handler;
        return buttonComponent;
      }),
      buttonEl: {},
    };
    cb(buttonComponent);
    this.buttonComponents.push(buttonComponent);
    return this;
  }
}

export class PluginSettingTab {
  public app: App;
  public plugin: Plugin;
  public containerEl: any;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createMockObsidianElement("div");
  }

  display(): any {}
  hide(): any {}
}

export class View {
  public app: App;
  public leaf: WorkspaceLeaf;
  public containerEl: any;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = new App();
    this.containerEl = createMockObsidianElement("div");
  }
}

export class ItemView extends View {
  public contentEl: any;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = createMockObsidianElement("div");
  }

  getViewType(): string {
    return "item-view";
  }

  getDisplayText(): string {
    return "Item View";
  }

  getIcon(): string {
    return "document";
  }

  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export interface Command {
  id: string;
  name: string;
  icon?: string;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: any, view: any) => any;
  editorCheckCallback?: (
    checking: boolean,
    editor: any,
    view: any
  ) => boolean | void;
  hotkeys?: any[];
}

export interface EventRef {
  [key: string]: any;
}

export class Editor {
  private content: string = "";
  private selection: string = "";
  private cursor: { line: number; ch: number } = { line: 0, ch: 0 };
  private lines: string[] = [""];

  constructor(content: string = "") {
    this.setValue(content);
  }

  getValue(): string {
    return this.content;
  }

  setValue(content: string): void {
    this.content = content;
    this.lines = content.split("\n");
  }

  getLine(line: number): string {
    return this.lines[line] ?? "";
  }

  setLine(line: number, text: string): void {
    this.lines[line] = text;
    this.content = this.lines.join("\n");
  }

  lineCount(): number {
    return this.lines.length;
  }

  getSelection(): string {
    return this.selection;
  }

  setSelection(anchor: any, head?: any): void {
    // mock
  }

  setSelectionText(text: string): void {
    this.selection = text;
  }

  getCursor(side?: "from" | "to" | "head" | "anchor"): { line: number; ch: number } {
    return this.cursor;
  }

  setCursor(pos: { line: number; ch: number } | number, ch?: number): void {
    if (typeof pos === "number") {
      this.cursor = { line: pos, ch: ch ?? 0 };
    } else {
      this.cursor = { ...pos };
    }
  }
}

export class MarkdownView extends View {
  public editor: Editor;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.editor = new Editor();
  }

  getViewType(): string {
    return "markdown";
  }
}

export class Plugin {
  public app: App;
  public manifest: any;
  private _data: any = {};
  public commands: Command[] = [];
  public views: Map<string, (leaf: WorkspaceLeaf) => View> = new Map();
  public settingTabs: PluginSettingTab[] = [];
  public ribbonIcons: { icon: string; title: string; callback: (evt: MouseEvent) => any }[] = [];
  public domEvents: { el: any; type: string; callback: any; options?: any }[] = [];
  public events: EventRef[] = [];

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  registerDomEvent<K extends keyof WindowEventMap>(
    el: Window | Document | HTMLElement,
    type: K,
    callback: (this: HTMLElement, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.domEvents.push({ el, type, callback, options });
  }

  registerEvent(eventRef: EventRef): void {
    this.events.push(eventRef);
  }

  registerView(
    type: string,
    viewCreator: (leaf: WorkspaceLeaf) => View
  ): void {
    this.views.set(type, viewCreator);
  }

  addSettingTab(settingTab: PluginSettingTab): void {
    this.settingTabs.push(settingTab);
  }

  addRibbonIcon(
    icon: string,
    title: string,
    callback: (evt: MouseEvent) => any
  ): HTMLElement {
    this.ribbonIcons.push({ icon, title, callback });
    return createMockObsidianElement("div");
  }

  async loadData(): Promise<any> {
    return this._data;
  }

  async saveData(data: any): Promise<void> {
    this._data = data;
  }

  async onload(): Promise<void> {}
  onunload(): void {}
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait?: number,
  immediate?: boolean
): T {
  let timeout: any;
  return function (this: any, ...args: any[]) {
    const context = this;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait || 0);
    if (callNow) func.apply(context, args);
  } as any as T;
}
