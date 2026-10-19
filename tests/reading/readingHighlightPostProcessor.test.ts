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
});
