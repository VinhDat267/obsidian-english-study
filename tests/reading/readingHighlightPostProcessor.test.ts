// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ReadingHighlightService } from "../../src/services/storage/ReadingHighlightService";
import { createReadingHighlightPostProcessor } from "../../src/reading/readingHighlightPostProcessor";
import { mountReadingHtml, makeReadingView, makeReadingContext } from "../helpers/reading";
import { App } from "obsidian";
import { HIGHLIGHT_COLORS } from "../../src/utils/textHighlighter";

afterEach(() => {
  document.body.replaceChildren();
});

describe("readingHighlightPostProcessor", () => {
  it("does nothing if context or sourcePath is missing", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("doc.md", "hello", "yellow");

    const root = mountReadingHtml("<p>hello world</p>");
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(root, null as any);
    expect(root.querySelector(".polyglot-reading-highlight")).toBeNull();

    postProcessor(root, { sourcePath: "" } as any);
    expect(root.querySelector(".polyglot-reading-highlight")).toBeNull();
  });

  it("does nothing if there are no highlights for the source file", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("other.md", "hello", "yellow");

    const app = new App();
    const view = makeReadingView(app, "<p>hello world</p>", "notes/doc.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);
    expect(view.contentEl.querySelector(".polyglot-reading-highlight")).toBeNull();
  });

  it("wraps matching text with .polyglot-reading-highlight and color background", () => {
    const service = new ReadingHighlightService();
    const { item } = service.addHighlight("notes/lesson.md", "neural network", "green");

    const app = new App();
    const view = makeReadingView(app, "<p>A deep neural network learns features.</p>", "notes/lesson.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const mark = view.contentEl.querySelector(".polyglot-reading-highlight");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("neural network");
    expect(mark?.getAttribute("data-highlight-id")).toBe(item?.id);
    expect(mark?.getAttribute("data-color")).toBe("green");
    expect((mark as HTMLElement)?.style.backgroundColor).toBe(HIGHLIGHT_COLORS.green.bg);
  });

  it("highlights multiple different highlights in the same paragraph", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("article.md", "Apple", "yellow");
    service.addHighlight("article.md", "Google", "blue");

    const app = new App();
    const view = makeReadingView(app, "<p>Both Apple and Google build software.</p>", "article.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe("Apple");
    expect(marks[0].getAttribute("data-color")).toBe("yellow");
    expect(marks[1].textContent).toBe("Google");
    expect(marks[1].getAttribute("data-color")).toBe("blue");
  });

  it("highlights multiple occurrences of the same word", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("repeat.md", "data", "pink");

    const app = new App();
    const view = makeReadingView(app, "<p>Clean data makes good data models.</p>", "repeat.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe("data");
    expect(marks[1].textContent).toBe("data");
  });

  it("skips forbidden elements like code, pre, script, and style", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("code.md", "token", "orange");

    const html = `
      <p>Here is normal token text.</p>
      <code>let token = 1;</code>
      <pre>token in pre</pre>
      <script>const token = 2;</script>
    `;

    const app = new App();
    const view = makeReadingView(app, html, "code.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].parentElement?.tagName).toBe("P");
  });

  it("does not re-wrap already highlighted spans on subsequent runs", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("once.md", "once", "yellow");

    const app = new App();
    const view = makeReadingView(app, "<p>Highlight once only.</p>", "once.md");
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);
    expect(view.contentEl.querySelectorAll(".polyglot-reading-highlight")).toHaveLength(1);

    // Run again (e.g. on re-render)
    postProcessor(view.contentEl, ctx);
    expect(view.contentEl.querySelectorAll(".polyglot-reading-highlight")).toHaveLength(1);
  });

  it("does NOT match substrings inside other words (word boundary enforcement)", () => {
    const service = new ReadingHighlightService();
    service.addHighlight("boundary.md", "in", "yellow");

    const app = new App();
    const view = makeReadingView(
      app,
      "<p>Finding information in training requires administration.</p>",
      "boundary.md"
    );
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    // "in" should only match the standalone word "in", NOT inside "Finding", "information", "training", "administration"
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("in");
  });

  it("ignores accidental single-character highlights with length < 2", () => {
    const service = new ReadingHighlightService();
    // Directly simulate a corrupted single-letter highlight "o"
    (service as any).highlights["test.md"] = [
      { id: "bad-1", text: "o", color: "yellow", timestamp: 123 },
    ];

    const app = new App();
    const view = makeReadingView(
      app,
      "<p>F. Source Accuracy Drill — 5 questions</p>",
      "test.md"
    );
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    // "o" must NOT highlight every letter 'o' in the sentence!
    expect(marks).toHaveLength(0);
  });

  it("highlights text crossing inline tags like bold <strong> tags on reload", () => {
    const service = new ReadingHighlightService();
    service.addHighlight(
      "spm/week 2/notes.md",
      "A. A formal process that removes all uncertainty from software projects.",
      "yellow"
    );

    const app = new App();
    // Note that Obsidian renders **A.** as <strong>A.</strong> followed by text node
    const view = makeReadingView(
      app,
      "<p><strong>A.</strong> A formal process that removes all uncertainty from software projects.</p>",
      "spm/week 2/notes.md"
    );
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(view.contentEl.textContent).toContain(
      "A. A formal process that removes all uncertainty from software projects."
    );
  });

  it("treats sourcePath as a raw Vault path and isolates literal percent filenames", () => {
    const service = new ReadingHighlightService();
    service.addHighlight(
      "spm/week 2/notes.md",
      "Evolutionary Prototyping",
      "purple"
    );

    const app = new App();
    const view = makeReadingView(
      app,
      "<p>Begin Evolutionary Prototyping and address differences.</p>",
      "spm/week%202/notes.md"
    );
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks).toHaveLength(0);
    postProcessor(view.contentEl, { ...ctx, sourcePath: "spm/week 2/notes.md" });
    expect(view.contentEl.querySelector("mark")?.textContent).toBe("Evolutionary Prototyping");
  });

  it.each([
    ["日本語", "私は日本語を勉強します。"],
    ["中文", "我正在学习中文语言。"],
  ])("restores %s inside an unspaced CJK sentence after rerender", (text, sentence) => {
    const service = new ReadingHighlightService();
    const item = service.addHighlight("cjk.md", text, "yellow").item!;
    const processor = createReadingHighlightPostProcessor(service);
    const root = mountReadingHtml(`<p>${sentence}</p>`);
    processor(root, { sourcePath: "cjk.md" } as any);
    expect(root.querySelector("mark")?.textContent).toBe(text);
    expect(root.querySelector("mark")?.dataset.highlightId).toBe(item.id);
    expect(root.textContent).toBe(sentence);
  });

  it("highlights multi-line selections across separate paragraph blocks", () => {
    const service = new ReadingHighlightService();
    // User selected across two options with a newline
    service.addHighlight(
      "quiz.md",
      "A. Option one\nB. Option two",
      "green"
    );

    const app = new App();
    const view = makeReadingView(
      app,
      "<div><p>A. Option one</p><p>B. Option two</p></div>",
      "quiz.md"
    );
    const { ctx } = makeReadingContext(view);
    const postProcessor = createReadingHighlightPostProcessor(service);

    postProcessor(view.contentEl, ctx);

    const marks = view.contentEl.querySelectorAll(".polyglot-reading-highlight");
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe("A. Option one");
    expect(marks[1].textContent).toBe("B. Option two");
  });
});
