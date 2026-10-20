import { ReadingHighlightItem } from "../../types";
import { HighlightColorKey } from "../../utils/textHighlighter";

export type HighlightHistoryAction =
  | { type: "add"; filePath: string; item: ReadingHighlightItem }
  | { type: "remove"; filePath: string; items: ReadingHighlightItem[] }
  | {
      type: "update";
      filePath: string;
      id: string;
      oldColor: HighlightColorKey;
      newColor: HighlightColorKey;
      text: string;
    }
  | { type: "clear-all"; filePath: string; items: ReadingHighlightItem[] };

interface FileHistoryStacks {
  undoStack: HighlightHistoryAction[];
  redoStack: HighlightHistoryAction[];
}

export class HighlightHistoryManager {
  private maxCapacity: number;
  private fileStacks: Map<string, FileHistoryStacks> = new Map();

  constructor(maxCapacity: number = 30) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  private normalizePath(filePath: string): string {
    if (!filePath) return "";
    return filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  private getOrCreateStacks(filePath: string): FileHistoryStacks {
    const norm = this.normalizePath(filePath);
    let stacks = this.fileStacks.get(norm);
    if (!stacks) {
      stacks = { undoStack: [], redoStack: [] };
      this.fileStacks.set(norm, stacks);
    }
    return stacks;
  }

  recordAdd(filePath: string, item: ReadingHighlightItem): void {
    const stacks = this.getOrCreateStacks(filePath);
    stacks.undoStack.push({
      type: "add",
      filePath: this.normalizePath(filePath),
      item: { ...item },
    });
    if (stacks.undoStack.length > this.maxCapacity) {
      stacks.undoStack.shift();
    }
    stacks.redoStack = [];
  }

  recordRemove(filePath: string, items: ReadingHighlightItem[]): void {
    if (!items || items.length === 0) return;
    const stacks = this.getOrCreateStacks(filePath);
    stacks.undoStack.push({
      type: "remove",
      filePath: this.normalizePath(filePath),
      items: items.map((it) => ({ ...it })),
    });
    if (stacks.undoStack.length > this.maxCapacity) {
      stacks.undoStack.shift();
    }
    stacks.redoStack = [];
  }

  recordUpdate(
    filePath: string,
    id: string,
    oldColor: HighlightColorKey,
    newColor: HighlightColorKey,
    text: string
  ): void {
    const stacks = this.getOrCreateStacks(filePath);
    stacks.undoStack.push({
      type: "update",
      filePath: this.normalizePath(filePath),
      id,
      oldColor,
      newColor,
      text,
    });
    if (stacks.undoStack.length > this.maxCapacity) {
      stacks.undoStack.shift();
    }
    stacks.redoStack = [];
  }

  recordClearAll(filePath: string, items: ReadingHighlightItem[]): void {
    if (!items || items.length === 0) return;
    const stacks = this.getOrCreateStacks(filePath);
    stacks.undoStack.push({
      type: "clear-all",
      filePath: this.normalizePath(filePath),
      items: items.map((it) => ({ ...it })),
    });
    if (stacks.undoStack.length > this.maxCapacity) {
      stacks.undoStack.shift();
    }
    stacks.redoStack = [];
  }

  canUndo(filePath: string): boolean {
    const norm = this.normalizePath(filePath);
    const stacks = this.fileStacks.get(norm);
    return Boolean(stacks && stacks.undoStack.length > 0);
  }

  canRedo(filePath: string): boolean {
    const norm = this.normalizePath(filePath);
    const stacks = this.fileStacks.get(norm);
    return Boolean(stacks && stacks.redoStack.length > 0);
  }

  undo(filePath: string): HighlightHistoryAction | null {
    if (!this.canUndo(filePath)) return null;
    const stacks = this.getOrCreateStacks(filePath);
    const action = stacks.undoStack.pop();
    if (!action) return null;

    stacks.redoStack.push(action);
    return action;
  }

  redo(filePath: string): HighlightHistoryAction | null {
    if (!this.canRedo(filePath)) return null;
    const stacks = this.getOrCreateStacks(filePath);
    const action = stacks.redoStack.pop();
    if (!action) return null;

    stacks.undoStack.push(action);
    return action;
  }

  clear(filePath?: string): void {
    if (filePath) {
      const norm = this.normalizePath(filePath);
      this.fileStacks.delete(norm);
    } else {
      this.fileStacks.clear();
    }
  }
}
