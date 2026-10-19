// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  wrapRangeWithHighlight,
  unwrapHighlightElement,
  unwrapHighlightsByText,
  unwrapAllHighlights,
} from "../../src/utils/domHighlightHelper";

describe("domHighlightHelper", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("returns null if range is collapsed or empty", () => {
    container.innerHTML = "<p>Sample text</p>";
    const textNode = container.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 2);

    expect(wrapRangeWithHighlight(range, "hl-1", "yellow", "#facc15")).toBeNull();
  });

  it("wraps a single text node range with mark element smoothly", () => {
    container.innerHTML = "<p>Artificial intelligence is growing</p>";
    const textNode = container.querySelector("p")!.firstChild!;
    const range = document.createRange();
    // Select "intelligence" (index 11 to 23)
    range.setStart(textNode, 11);
    range.setEnd(textNode, 23);

    const mark = wrapRangeWithHighlight(range, "hl-123", "green", "rgba(34, 197, 94, 0.35)");

    expect(mark).not.toBeNull();
    expect(mark?.tagName).toBe("MARK");
    expect(mark?.className).toBe("polyglot-reading-highlight");
    expect(mark?.getAttribute("data-highlight-id")).toBe("hl-123");
    expect(mark?.getAttribute("data-color")).toBe("green");
    expect(mark?.textContent).toBe("intelligence");
    expect(mark?.style.backgroundColor).toBe("rgba(34, 197, 94, 0.35)");

    // Parent paragraph contents preserved
    expect(container.querySelector("p")?.textContent).toBe("Artificial intelligence is growing");
  });

  it("unwraps a highlight element cleanly without losing child text", () => {
    container.innerHTML = '<p>Hello <mark class="polyglot-reading-highlight" data-highlight-id="1">world</mark>!</p>';
    const mark = container.querySelector("mark")!;

    unwrapHighlightElement(mark);

    expect(container.querySelector("mark")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Hello world!");
  });

  it("unwraps highlights matching target text in a container", () => {
    container.innerHTML = `
      <p>
        Learn <mark class="polyglot-reading-highlight" data-highlight-id="1">React</mark> and
        <mark class="polyglot-reading-highlight" data-highlight-id="2">Vue</mark> with
        <mark class="polyglot-reading-highlight" data-highlight-id="3">React</mark> Native.
      </p>
    `;

    const count = unwrapHighlightsByText(container, "react");

    expect(count).toBe(2);
    const remaining = container.querySelectorAll(".polyglot-reading-highlight");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toBe("Vue");
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toContain("Learn React and Vue with React Native.");
  });

  it("unwraps all highlights in a container cleanly", () => {
    container.innerHTML = `
      <p>
        <mark class="polyglot-reading-highlight" data-highlight-id="1">First</mark>
        <mark class="polyglot-reading-highlight" data-highlight-id="2">Second</mark>
        <mark class="polyglot-reading-highlight" data-highlight-id="3">Third</mark>
      </p>
    `;

    const count = unwrapAllHighlights(container);

    expect(count).toBe(3);
    expect(container.querySelectorAll(".polyglot-reading-highlight")).toHaveLength(0);
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe("First Second Third");
  });
});

