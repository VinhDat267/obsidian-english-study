import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingHighlightToolbar } from "../../src/ui/FloatingHighlightToolbar";

// The document installed below returns plain-object DOM doubles.
function asMockElement(element: HTMLElement | null | undefined): any { return element; }

describe("FloatingHighlightToolbar", () => {
  let docListeners: Record<string, ((...args: any[]) => void)[]>;
  let mockBody: any;

  function createMockElement(tag: string): any {
    const classListSet = new Set<string>();
    const attributes: Record<string, string> = {};
    const children: any[] = [];
    const listeners: Record<string, ((...args: any[]) => void)[]> = {};
    let textContent = "";
    let classNameVal = "";

    const el: any = {
      tagName: tag.toUpperCase(),
      style: {} as Record<string, string>,
      get className() {
        return classNameVal;
      },
      set className(val: string) {
        classNameVal = val;
        classListSet.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
      },
      get textContent() {
        if (children.length > 0) return children.map((c) => c.textContent || "").join("");
        return textContent;
      },
      set textContent(val: string) {
        textContent = val;
      },
      classList: {
        add: (...cls: string[]) => cls.forEach((c) => classListSet.add(c)),
        remove: (...cls: string[]) => cls.forEach((c) => classListSet.delete(c)),
        contains: (cls: string) => classListSet.has(cls),
      },
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      getAttribute: (k: string) => attributes[k] || null,
      appendChild: (child: any) => {
        child.parentElement = el;
        children.push(child);
        return child;
      },
      removeChild: (child: any) => {
        const idx = children.indexOf(child);
        if (idx !== -1) children.splice(idx, 1);
        return child;
      },
      remove: () => {
        if (el.parentElement) el.parentElement.removeChild(el);
      },
      addEventListener: (type: string, h: any) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(h);
      },
      removeEventListener: (type: string, h: any) => {
        if (listeners[type]) listeners[type] = listeners[type].filter((fn) => fn !== h);
      },
      dispatchEvent: (e: any) => {
        const handlers = listeners[e.type] || [];
        handlers.forEach((h) => h(e));
      },
      contains: (target: any) => {
        if (target === el) return true;
        return children.some((c) => c.contains?.(target) || c === target);
      },
      querySelector: (selector: string): any => {
        if (selector.startsWith(".")) {
          const cls = selector.slice(1);
          if (classListSet.has(cls)) return el;
        }
        for (const c of children) {
          if (selector.startsWith(".") && c.classList?.contains(selector.slice(1))) return c;
          if (c.tagName === selector.toUpperCase()) return c;
          const found = c.querySelector?.(selector);
          if (found) return found;
        }
        return null;
      },
      querySelectorAll: (selector: string): any[] => {
        const res: any[] = [];
        for (const c of children) {
          if (selector.startsWith(".") && c.classList?.contains(selector.slice(1))) res.push(c);
          if (c.tagName === selector.toUpperCase()) res.push(c);
          if (c.querySelectorAll) res.push(...c.querySelectorAll(selector));
        }
        return res;
      },
      children,
    };
    return el;
  }

  beforeEach(() => {
    docListeners = {};
    mockBody = createMockElement("body");

    (global as any).document = {
      createElement: (tag: string) => createMockElement(tag),
      body: mockBody,
      addEventListener: (type: string, h: any) => {
        if (!docListeners[type]) docListeners[type] = [];
        docListeners[type].push(h);
      },
      removeEventListener: (type: string, h: any) => {
        if (docListeners[type]) docListeners[type] = docListeners[type].filter((fn) => fn !== h);
      },
      dispatchEvent: (e: any) => {
        const handlers = docListeners[e.type] || [];
        handlers.forEach((h) => h(e));
      },
    };

    (global as any).window = {
      innerWidth: 1024,
      innerHeight: 768,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders floating toolbar with 6 color dots, clear dot, and lookup button", () => {
    const toolbar = new FloatingHighlightToolbar();
    const onHighlight = vi.fn();
    const onClear = vi.fn();
    const onLookup = vi.fn();

    toolbar.show(
      { top: 100, bottom: 120, left: 150, right: 250 },
      "machine learning",
      null,
      { onHighlight, onClear, onLookup }
    );

    expect(toolbar.isVisible()).toBe(true);
    const el = asMockElement(toolbar.getElement())!;
    expect(el).not.toBeNull();
    expect(el.classList.contains("polyglot-highlight-toolbar")).toBe(true);

    // 6 color dots
    const dots = el.querySelectorAll(".toolbar-color-dot");
    expect(dots.length).toBeGreaterThanOrEqual(6);

    // Clear dot
    const clearDot = el.querySelector(".dot-clear");
    expect(clearDot).not.toBeNull();

    // Lookup button
    const lookupBtn = el.querySelector(".toolbar-btn-lookup");
    expect(lookupBtn).not.toBeNull();

    toolbar.hide();
    expect(toolbar.isVisible()).toBe(false);
  });

  it("calls onHighlight with selected color when a color dot is clicked", () => {
    const toolbar = new FloatingHighlightToolbar();
    const onHighlight = vi.fn();

    toolbar.show(
      { top: 100, bottom: 120, left: 150, right: 250 },
      "machine learning",
      null,
      { onHighlight, onClear: vi.fn(), onLookup: vi.fn() }
    );

    const el = asMockElement(toolbar.getElement())!;
    const greenDot = el.querySelector(".dot-green");
    expect(greenDot).not.toBeNull();

    greenDot?.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onHighlight).toHaveBeenCalledWith("green");
    toolbar.hide();
  });

  it("calls onClear when clear dot is clicked", () => {
    const toolbar = new FloatingHighlightToolbar();
    const onClear = vi.fn();

    toolbar.show(
      { top: 100, bottom: 120, left: 150, right: 250 },
      "machine learning",
      null,
      { onHighlight: vi.fn(), onClear, onLookup: vi.fn() }
    );

    const el = asMockElement(toolbar.getElement())!;
    const clearDot = el.querySelector(".dot-clear");

    clearDot?.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    toolbar.hide();
  });

  it("calls onLookup when lookup button is clicked", () => {
    const toolbar = new FloatingHighlightToolbar();
    const onLookup = vi.fn();

    toolbar.show(
      { top: 100, bottom: 120, left: 150, right: 250 },
      "machine learning",
      null,
      { onHighlight: vi.fn(), onClear: vi.fn(), onLookup }
    );

    const el = asMockElement(toolbar.getElement())!;
    const lookupBtn = el.querySelector(".toolbar-btn-lookup");

    lookupBtn?.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onLookup).toHaveBeenCalledTimes(1);
    toolbar.hide();
  });

  it("prevents default on mousedown for buttons to keep text selection active", () => {
    const toolbar = new FloatingHighlightToolbar();
    toolbar.show(
      { top: 100, bottom: 120, left: 150, right: 250 },
      "machine learning",
      null,
      { onHighlight: vi.fn(), onClear: vi.fn(), onLookup: vi.fn() }
    );

    const el = asMockElement(toolbar.getElement())!;
    const yellowDot = el.querySelector(".dot-yellow")!;
    const preventDefault = vi.fn();

    yellowDot.dispatchEvent({
      type: "mousedown",
      preventDefault,
      stopPropagation: vi.fn(),
    });

    expect(preventDefault).toHaveBeenCalled();
    toolbar.hide();
  });
});
