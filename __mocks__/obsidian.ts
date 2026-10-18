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
}

export class Workspace {
  public activeLeaf: WorkspaceLeaf | null = null;
  public on = vi.fn((name: string, callback: (...args: any[]) => any) => {
    return { name, callback };
  });
  public getLeavesOfType = vi.fn((type: string) => []);
  public getRightLeaf = vi.fn((split: boolean) => new WorkspaceLeaf());
  public revealLeaf = vi.fn();
}

export class App {
  public vault: Vault = new Vault();
  public workspace: Workspace = new Workspace();
}

export class Setting {
  public containerEl: any;
  public nameEl: any = {};
  public descEl: any = {};
  public controlEl: any = {};

  constructor(containerEl: any) {
    this.containerEl = containerEl;
  }

  setName(name: string): this {
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
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
      setValue: vi.fn().mockReturnThis(),
      getValue: vi.fn().mockReturnValue(""),
      setPlaceholder: vi.fn().mockReturnThis(),
      onChange: vi.fn().mockReturnThis(),
      inputEl: { type: "text" },
    };
    cb(textComponent);
    return this;
  }

  addDropdown(cb: (dropdown: any) => any): this {
    const dropdownComponent = {
      addOption: vi.fn().mockReturnThis(),
      addOptions: vi.fn().mockReturnThis(),
      setValue: vi.fn().mockReturnThis(),
      getValue: vi.fn().mockReturnValue(""),
      onChange: vi.fn().mockReturnThis(),
      selectEl: {},
    };
    cb(dropdownComponent);
    return this;
  }

  addToggle(cb: (toggle: any) => any): this {
    const toggleComponent = {
      setValue: vi.fn().mockReturnThis(),
      getValue: vi.fn().mockReturnValue(false),
      onChange: vi.fn().mockReturnThis(),
      toggleEl: {},
    };
    cb(toggleComponent);
    return this;
  }

  addButton(cb: (button: any) => any): this {
    const buttonComponent = {
      setButtonText: vi.fn().mockReturnThis(),
      setIcon: vi.fn().mockReturnThis(),
      setClass: vi.fn().mockReturnThis(),
      setTooltip: vi.fn().mockReturnThis(),
      setWarning: vi.fn().mockReturnThis(),
      setCta: vi.fn().mockReturnThis(),
      onClick: vi.fn().mockReturnThis(),
      buttonEl: {},
    };
    cb(buttonComponent);
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
    this.containerEl = {
      empty: vi.fn(),
      createEl: vi.fn((tag: string, attrs?: any) => ({
        setText: vi.fn(),
        addClass: vi.fn(),
        setAttribute: vi.fn(),
        style: {},
      })),
      createDiv: vi.fn(() => ({
        setText: vi.fn(),
        addClass: vi.fn(),
        style: {},
      })),
    };
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
    this.containerEl = {
      empty: vi.fn(),
      createEl: vi.fn(() => ({})),
      createDiv: vi.fn(() => ({})),
    };
  }
}

export class ItemView extends View {
  public contentEl: any = {
    empty: vi.fn(),
    createEl: vi.fn((tag: string, attrs?: any) => ({
      setText: vi.fn(),
      createEl: vi.fn(),
      createDiv: vi.fn(),
      addEventListener: vi.fn(),
      style: {},
    })),
    createDiv: vi.fn((attrs?: any) => ({
      setText: vi.fn(),
      createEl: vi.fn(),
      createDiv: vi.fn(),
      addEventListener: vi.fn(),
      style: {},
    })),
  };

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

export class Plugin {
  public app: App;
  public manifest: any;
  private _data: any = {};

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(command: Command): Command {
    return command;
  }

  registerDomEvent<K extends keyof WindowEventMap>(
    el: Window | Document | HTMLElement,
    type: K,
    callback: (this: HTMLElement, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void {}

  registerEvent(eventRef: EventRef): void {}

  registerView(
    type: string,
    viewCreator: (leaf: WorkspaceLeaf) => View
  ): void {}

  addSettingTab(settingTab: PluginSettingTab): void {}

  addRibbonIcon(
    icon: string,
    title: string,
    callback: (evt: MouseEvent) => any
  ): HTMLElement {
    return {} as HTMLElement;
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
