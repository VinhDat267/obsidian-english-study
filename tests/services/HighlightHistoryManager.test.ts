import { describe, it, expect, beforeEach } from "vitest";
import {
  HighlightHistoryManager,
  HighlightHistoryAction,
} from "../../src/services/history/HighlightHistoryManager";
import { ReadingHighlightItem } from "../../src/types";

describe("HighlightHistoryManager", () => {
  let manager: HighlightHistoryManager;
  const file1 = "Notes/English.md";
  const file2 = "Notes/Grammar.md";

  const sampleItem1: ReadingHighlightItem = {
    id: "hl-1",
    text: "ephemeral",
    color: "yellow",
    timestamp: 1000,
  };

  const sampleItem2: ReadingHighlightItem = {
    id: "hl-2",
    text: "serendipity",
    color: "green",
    timestamp: 2000,
  };

  beforeEach(() => {
    manager = new HighlightHistoryManager();
  });

  it("should initialize with empty stacks and report canUndo/canRedo false", () => {
    expect(manager.canUndo(file1)).toBe(false);
    expect(manager.canRedo(file1)).toBe(false);
    expect(manager.undo(file1)).toBeNull();
    expect(manager.redo(file1)).toBeNull();
  });

  it("should record 'add' action and support undo/redo cycle", () => {
    manager.recordAdd(file1, sampleItem1);

    expect(manager.canUndo(file1)).toBe(true);
    expect(manager.canRedo(file1)).toBe(false);

    // Undo
    const undone = manager.undo(file1);
    expect(undone).toEqual({
      type: "add",
      filePath: file1,
      item: sampleItem1,
    });
    expect(manager.canUndo(file1)).toBe(false);
    expect(manager.canRedo(file1)).toBe(true);

    // Redo
    const redone = manager.redo(file1);
    expect(redone).toEqual({
      type: "add",
      filePath: file1,
      item: sampleItem1,
    });
    expect(manager.canUndo(file1)).toBe(true);
    expect(manager.canRedo(file1)).toBe(false);
  });

  it("should clear redo stack when a new action is recorded", () => {
    manager.recordAdd(file1, sampleItem1);
    manager.undo(file1);
    expect(manager.canRedo(file1)).toBe(true);

    // Recording a new action must invalidate the redo stack
    manager.recordAdd(file1, sampleItem2);
    expect(manager.canRedo(file1)).toBe(false);
    expect(manager.canUndo(file1)).toBe(true);

    const undone = manager.undo(file1);
    expect(undone?.type).toBe("add");
    if (undone?.type === "add") {
      expect(undone.item.id).toBe(sampleItem2.id);
    }
  });

  it("should record 'remove' action with multiple items and support undo/redo", () => {
    const items = [sampleItem1, sampleItem2];
    manager.recordRemove(file1, items);

    expect(manager.canUndo(file1)).toBe(true);
    const undone = manager.undo(file1);
    expect(undone).toEqual({
      type: "remove",
      filePath: file1,
      items: items,
    });

    const redone = manager.redo(file1);
    expect(redone).toEqual({
      type: "remove",
      filePath: file1,
      items: items,
    });
  });

  it("should record 'update' action for color change and support undo/redo", () => {
    manager.recordUpdate(file1, "hl-1", "yellow", "blue", "ephemeral");

    const undone = manager.undo(file1);
    expect(undone).toEqual({
      type: "update",
      filePath: file1,
      id: "hl-1",
      oldColor: "yellow",
      newColor: "blue",
      text: "ephemeral",
    });

    const redone = manager.redo(file1);
    expect(redone).toEqual({
      type: "update",
      filePath: file1,
      id: "hl-1",
      oldColor: "yellow",
      newColor: "blue",
      text: "ephemeral",
    });
  });

  it("should record 'clear-all' action and support undo/redo", () => {
    manager.recordClearAll(file1, [sampleItem1, sampleItem2]);

    const undone = manager.undo(file1);
    expect(undone).toEqual({
      type: "clear-all",
      filePath: file1,
      items: [sampleItem1, sampleItem2],
    });

    const redone = manager.redo(file1);
    expect(redone).toEqual({
      type: "clear-all",
      filePath: file1,
      items: [sampleItem1, sampleItem2],
    });
  });

  it("should maintain independent history stacks for different files", () => {
    manager.recordAdd(file1, sampleItem1);
    manager.recordAdd(file2, sampleItem2);

    expect(manager.canUndo(file1)).toBe(true);
    expect(manager.canUndo(file2)).toBe(true);

    const undone1 = manager.undo(file1);
    expect(undone1?.filePath).toBe(file1);
    expect(manager.canUndo(file1)).toBe(false);
    expect(manager.canUndo(file2)).toBe(true);

    const undone2 = manager.undo(file2);
    expect(undone2?.filePath).toBe(file2);
    expect(manager.canUndo(file2)).toBe(false);
  });

  it("should enforce maximum capacity of 30 actions per file", () => {
    const customManager = new HighlightHistoryManager(30);

    for (let i = 0; i < 35; i++) {
      customManager.recordAdd(file1, {
        id: `hl-${i}`,
        text: `word-${i}`,
        color: "yellow",
        timestamp: Date.now() + i,
      });
    }

    // Should only have 30 items to undo
    let undoCount = 0;
    while (customManager.canUndo(file1)) {
      const action = customManager.undo(file1);
      expect(action).not.toBeNull();
      undoCount++;
    }
    expect(undoCount).toBe(30);
  });

  it("should clear history for a specific file or all files", () => {
    manager.recordAdd(file1, sampleItem1);
    manager.recordAdd(file2, sampleItem2);

    manager.clear(file1);
    expect(manager.canUndo(file1)).toBe(false);
    expect(manager.canUndo(file2)).toBe(true);

    manager.clear();
    expect(manager.canUndo(file2)).toBe(false);
  });
});
