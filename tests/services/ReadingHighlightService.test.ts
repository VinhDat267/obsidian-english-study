import { describe, it, expect, vi } from "vitest";
import { ReadingHighlightService } from "../../src/services/storage/ReadingHighlightService";

describe("ReadingHighlightService", () => {
  it("initializes with empty or existing data", () => {
    const service1 = new ReadingHighlightService();
    expect(service1.getHighlights("test.md")).toEqual([]);

    const service2 = new ReadingHighlightService({
      "folder/note.md": [
        { id: "1", text: "sample text", color: "yellow", timestamp: 12345 },
      ],
    });
    expect(service2.getHighlights("folder/note.md")).toHaveLength(1);
    expect(service2.getHighlights("folder/note.md")[0].text).toBe("sample text");
  });

  it("normalizes file paths correctly", () => {
    const service = new ReadingHighlightService({
      "folder/note.md": [
        { id: "1", text: "hello", color: "yellow", timestamp: 100 },
      ],
    });

    expect(service.getHighlights("/folder/note.md")).toHaveLength(1);
    expect(service.getHighlights("folder\\note.md")).toHaveLength(1);
    expect(service.getHighlights("/folder/note.md/")).toHaveLength(1);
    expect(service.getHighlights("folder/note%2Emd")).toBeDefined();
  });

  it("normalizes URL-encoded paths with spaces correctly", () => {
    const service = new ReadingHighlightService({
      "spm/week 2/quiz.md": [
        { id: "1", text: "hello", color: "yellow", timestamp: 100 },
      ],
    });

    expect(service.getHighlights("spm/week%202/quiz.md")).toHaveLength(1);
    expect(service.getHighlights("spm/week 2/quiz.md")).toHaveLength(1);
  });

  it("adds a new highlight and triggers save callback", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    const res = service.addHighlight("notes/lesson.md", "artificial intelligence", "green");

    expect(res.action).toBe("added");
    expect(res.item).toBeDefined();
    expect(res.item?.text).toBe("artificial intelligence");
    expect(res.item?.color).toBe("green");
    expect(res.item?.id).toMatch(/^hl-/);

    const list = service.getHighlights("notes/lesson.md");
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe("artificial intelligence");
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("updates highlight color if text already exists with different color", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    service.addHighlight("doc.md", "keyword", "yellow");
    const res = service.addHighlight("doc.md", "keyword", "purple");

    expect(res.action).toBe("updated");
    expect(res.item?.color).toBe("purple");

    const list = service.getHighlights("doc.md");
    expect(list).toHaveLength(1);
    expect(list[0].color).toBe("purple");
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it("toggles off (removes) highlight if clicked with same color", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    service.addHighlight("doc.md", "keyword", "yellow");
    const res = service.addHighlight("doc.md", "keyword", "yellow");

    expect(res.action).toBe("removed");
    const list = service.getHighlights("doc.md");
    expect(list).toHaveLength(0);
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it("removes highlight by text (case-insensitive)", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    service.addHighlight("doc.md", "Neural Networks", "blue");
    expect(service.getHighlights("doc.md")).toHaveLength(1);

    const removed = service.removeHighlight("doc.md", "neural networks");
    expect(removed).toBe(true);
    expect(service.getHighlights("doc.md")).toHaveLength(0);
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it("removes highlight by id", () => {
    const service = new ReadingHighlightService();
    const res = service.addHighlight("doc.md", "transformer model", "pink");
    const id = res.item!.id;

    const removed = service.removeHighlight("doc.md", id);
    expect(removed).toBe(true);
    expect(service.getHighlights("doc.md")).toHaveLength(0);
  });

  it("clears all highlights for a note file", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    service.addHighlight("noteA.md", "word1", "yellow");
    service.addHighlight("noteA.md", "word2", "green");
    service.addHighlight("noteB.md", "word3", "blue");

    expect(service.getHighlights("noteA.md")).toHaveLength(2);
    expect(service.getHighlights("noteB.md")).toHaveLength(1);

    service.clearHighlightsForFile("noteA.md");
    expect(service.getHighlights("noteA.md")).toHaveLength(0);
    expect(service.getHighlights("noteB.md")).toHaveLength(1);
  });

  it("trims whitespace from text before adding/matching", () => {
    const service = new ReadingHighlightService();
    const res = service.addHighlight("doc.md", "  trimmed phrase   ", "orange");
    expect(res.item?.text).toBe("trimmed phrase");

    const res2 = service.addHighlight("doc.md", "trimmed phrase", "orange");
    expect(res2.action).toBe("removed"); // toggled off
  });

  it("removes highlight by substring match when dragging eraser over part of a phrase", () => {
    const saveFn = vi.fn();
    const service = new ReadingHighlightService({}, saveFn);

    service.addHighlight(
      "doc.md",
      "Deliver tested increments frequently while producing the necessary release records.",
      "yellow"
    );
    expect(service.getHighlights("doc.md")).toHaveLength(1);

    // Eraser dragged over only a substring
    const removed = service.removeHighlight("doc.md", "the necessary release records");
    expect(removed).toBe(true);
    expect(service.getHighlights("doc.md")).toHaveLength(0);
  });
});
