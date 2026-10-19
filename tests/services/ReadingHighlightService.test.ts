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

  it("keeps literal percent-encoded filenames distinct from spaces", () => {
    const service = new ReadingHighlightService({
      "spm/week 2/quiz.md": [
        { id: "1", text: "hello", color: "yellow", timestamp: 100 },
      ],
    });

    expect(service.getHighlights("spm/week%202/quiz.md")).toHaveLength(0);
    expect(service.getHighlights("spm/week 2/quiz.md")).toHaveLength(1);
  });

  it("keeps case and markdown extensions in raw Vault identities", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("Week 2.md", "space note", "yellow");
    service.addHighlight("Week%202.md", "percent note", "blue");
    service.addHighlight("week 2.md", "lowercase note", "green");
    service.addHighlight("Week 2", "extensionless note", "pink");

    expect(service.getHighlights("Week 2.md").map(h => h.text)).toEqual(["space note"]);
    expect(service.getHighlights("Week%202.md").map(h => h.text)).toEqual(["percent note"]);
    expect(service.getHighlights("week 2.md").map(h => h.text)).toEqual(["lowercase note"]);
    expect(service.getHighlights("Week 2").map(h => h.text)).toEqual(["extensionless note"]);
  });

  it("removes every record touched by one eraser selection and returns their identities", () => {
    const service = new ReadingHighlightService();
    const alpha = service.addHighlight("doc.md", "alpha", "yellow").item!;
    const beta = service.addHighlight("doc.md", "beta", "blue").item!;
    service.addHighlight("doc.md", "untouched", "green");

    expect(service.removeHighlights("doc.md", "alpha and beta").map(h => h.id)).toEqual([alpha.id, beta.id]);
    expect(service.getHighlights("doc.md").map(h => h.text)).toEqual(["untouched"]);
  });

  it("removes all overlapping phrases but prioritizes an exact ID", () => {
    const service = new ReadingHighlightService();
    const phrase = service.addHighlight("doc.md", "neural network learns", "yellow").item!;
    const word = service.addHighlight("doc.md", "neural", "blue").item!;
    expect(service.removeHighlights("doc.md", word.id).map(h => h.id)).toEqual([word.id]);
    expect(service.removeHighlights("doc.md", "neural").map(h => h.id)).toEqual([phrase.id]);
    expect(service.removeHighlights("doc.md", " ")).toEqual([]);
  });

  it("moves one file and an entire folder without capturing sibling prefixes", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("folder/note.md", "first", "yellow");
    service.addHighlight("folder/sub/other.md", "second", "blue");
    service.addHighlight("folder-other/note.md", "sibling", "green");

    service.renamePath("folder/note.md", "folder/renamed.md");
    expect(service.getHighlights("folder/note.md")).toEqual([]);
    expect(service.getHighlights("folder/renamed.md")[0].text).toBe("first");
    service.renamePath("folder", "moved");
    expect(service.getHighlights("moved/renamed.md")[0].text).toBe("first");
    expect(service.getHighlights("moved/sub/other.md")[0].text).toBe("second");
    expect(service.getHighlights("folder-other/note.md")[0].text).toBe("sibling");
  });

  it("removes deleted files and folders and saves each mutation once", () => {
    const save = vi.fn();
    const service = new ReadingHighlightService({}, save);
    service.addHighlight("folder/one.md", "first", "yellow");
    service.addHighlight("folder/two.md", "second", "blue");
    service.addHighlight("folder-other/two.md", "sibling", "green");
    save.mockClear();

    service.removePath("folder/one.md");
    service.removePath("folder");
    service.removePath("missing.md");
    expect(service.getHighlights("folder/one.md")).toEqual([]);
    expect(service.getHighlights("folder/two.md")).toEqual([]);
    expect(service.getHighlights("folder-other/two.md")[0].text).toBe("sibling");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("migrates an unambiguous legacy path and retains canonical records", () => {
    const item = { id: "legacy", text: "saved phrase", color: "yellow" as const, timestamp: 10 };
    const service = new ReadingHighlightService({ "folder/week 2": [item] });
    service.migrateLegacyPaths(["Folder/Week 2.md", "unrelated.md"]);
    expect(service.getHighlights("Folder/Week 2.md")).toEqual([item]);
    expect(Object.keys(service.getAllHighlights()).filter(key => !key.includes("\0"))).toEqual(["Folder/Week 2.md"]);
    service.migrateLegacyPaths(["Folder/Week 2.md"]);
    expect(service.getHighlights("Folder/Week 2.md")).toEqual([item]);
  });

  it("retains ambiguous legacy data without attaching it to either colliding file", () => {
    const item = { id: "legacy", text: "unknown owner", color: "yellow" as const, timestamp: 10 };
    const service = new ReadingHighlightService({ "week 2": [item] });
    service.migrateLegacyPaths(["Week 2.md", "Week%202.md"]);
    expect(service.getHighlights("Week 2.md")).toEqual([]);
    expect(service.getHighlights("Week%202.md")).toEqual([]);
    expect(service.getAllHighlights()["\0polyglot-legacy:week 2"]).toEqual([item]);
    const reloaded = new ReadingHighlightService(JSON.parse(JSON.stringify(service.getAllHighlights())));
    reloaded.migrateLegacyPaths(["Week 2.md"]);
    expect(reloaded.getHighlights("Week 2.md")).toEqual([]);
    expect(reloaded.getAllHighlights()["\0polyglot-legacy:week 2"]).toEqual([item]);
  });

  it("supports prototype-named paths and validates malformed persisted records", () => {
    const service = new ReadingHighlightService({
      "bad.md": { unexpected: true },
      "mixed.md": [null, { id: "bad", text: 3 }, { id: "bad-color", text: "phrase", color: "constructor", timestamp: 1 },
        { id: "valid", text: "safe phrase", color: "green", timestamp: 1 }],
    } as any);
    expect(() => service.addHighlight("constructor.md", "constructor phrase", "yellow")).not.toThrow();
    expect(() => service.addHighlight("__proto__", "prototype phrase", "blue")).not.toThrow();
    expect(service.getHighlights("constructor.md")[0].text).toBe("constructor phrase");
    expect(service.getHighlights("__proto__")[0].text).toBe("prototype phrase");
    expect(service.getHighlights("bad.md")).toEqual([]);
    expect(service.getHighlights("mixed.md").map(h => h.id)).toEqual(["valid"]);
  });

  it("preserves all legacy records when a migration destination is also an ambiguous old key", () => {
    const first = { id: "first", text: "first owner", color: "yellow" as const, timestamp: 10 };
    const ambiguous = { id: "ambiguous", text: "unknown owner", color: "blue" as const, timestamp: 10 };
    const service = new ReadingHighlightService({ "foo": [first], "foo.md": [ambiguous] });
    service.migrateLegacyPaths(["foo.md", "foo.md.md"]);
    expect(service.getHighlights("foo.md")).toEqual([first]);
    expect(service.getHighlights("foo.md.md")).toEqual([]);
    expect(service.getAllHighlights()["\0polyglot-legacy:foo.md"]).toEqual([ambiguous]);
  });

  it("keeps current canonical data identifiable across reload even with double extensions", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("foo.md", "current owner", "green");
    const reloaded = new ReadingHighlightService(JSON.parse(JSON.stringify(service.getAllHighlights())));
    reloaded.migrateLegacyPaths(["foo.md", "foo.md.md"]);
    expect(reloaded.getHighlights("foo.md").map(h => h.text)).toEqual(["current owner"]);
    expect(reloaded.getHighlights("foo.md.md")).toEqual([]);
  });

  it("retains orphan legacy records without assigning them to a later new file", () => {
    const item = { id: "orphan", text: "old owner", color: "yellow" as const, timestamp: 10 };
    const service = new ReadingHighlightService({ "deleted": [item] });
    service.migrateLegacyPaths(["unrelated.md"]);
    expect(service.getAllHighlights()["\0polyglot-legacy:deleted"]).toEqual([item]);
    const reloaded = new ReadingHighlightService(JSON.parse(JSON.stringify(service.getAllHighlights())));
    reloaded.migrateLegacyPaths(["deleted.md"]);
    expect(reloaded.getHighlights("deleted.md")).toEqual([]);
    expect(reloaded.getAllHighlights()["\0polyglot-legacy:deleted"]).toEqual([item]);
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
