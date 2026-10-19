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

  it("safely highlights across multiple elements without losing text or structure", () => {
    container.innerHTML = `
      <p id="p1">D. Deliver tested increments frequently while producing the necessary release records.</p>
      <p id="p2"><strong>Q16 · L2 Slides 29–30</strong> — A product has well-defined requirements...</p>
    `;

    const p1 = container.querySelector("#p1")!;
    const p2 = container.querySelector("#p2")!;
    const initialText = container.textContent;

    const t1 = p1.firstChild!;
    const startOffset = t1.nodeValue!.indexOf("y while");

    const t2 = p2.childNodes[1]!; // after strong
    const endOffset = t2.nodeValue!.indexOf("well-defined");

    const range = document.createRange();
    range.setStart(t1, startOffset);
    range.setEnd(t2, endOffset);

    // 1. Wrap
    const firstMark = wrapRangeWithHighlight(range, "hl-cross", "yellow", "rgba(250, 204, 21, 0.4)");
    expect(firstMark).not.toBeNull();
    // Absolutely NO text dropped during highlight
    expect(container.textContent).toBe(initialText);
    // Block structures intact: p1 and p2 both still exist and are separate
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(p1.textContent).toContain("frequentl");
    expect(p1.textContent).toContain("y while producing the necessary release records.");
    expect(p2.textContent).toContain("Q16 · L2 Slides 29–30");
    expect(p2.textContent).toContain("well-defined requirements...");

    // 2. Unwrap
    const unwrapped = unwrapHighlightsByText(container, "y while producing");
    expect(unwrapped).toBeGreaterThan(0);
    // Text content is completely preserved
    expect(container.textContent).toBe(initialText);
  });
});


