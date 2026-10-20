import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HighlighterPenPill } from "../../src/ui/HighlighterPenPill";

// The document installed below returns plain-object DOM doubles.
function asMockElement(element: HTMLElement | null | undefined): any { return element; }

describe("HighlighterPenPill", () => {
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
        toggle: (cls: string, force?: boolean) => {
          const has = classListSet.has(cls);
          const next = force !== undefined ? force : !has;
          if (next) classListSet.add(cls);
          else classListSet.delete(cls);
          return next;
        },
      },
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      getAttribute: (k: string) => attributes[k] || null,
      removeAttribute: (k: string) => { delete attributes[k]; },
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

    vi.stubGlobal("document", {
      body: mockBody,
      createElement: (tag: string) => createMockElement(tag),
      addEventListener: (type: string, h: any) => {
        if (!docListeners[type]) docListeners[type] = [];
        docListeners[type].push(h);
      },
      removeEventListener: (type: string, h: any) => {
        if (docListeners[type]) docListeners[type] = docListeners[type].filter((fn) => fn !== h);
      },
    });

    vi.stubGlobal("window", {
      innerWidth: 1200,
      innerHeight: 800,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should create and mount .polyglot-pen-pill on show()", () => {
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange: vi.fn(),
      onClose: vi.fn(),
    });

    expect(pill.isVisible()).toBe(true);
    const el = asMockElement(pill.getElement());
    expect(el).not.toBeNull();
    expect(el?.classList.contains("polyglot-pen-pill")).toBe(true);
    expect(el?.getAttribute("role")).toBe("status");
    expect(mockBody.children).toContain(el);
  });

  it("should display active color and update on setColor()", () => {
    const pill = new HighlighterPenPill();
    pill.show("green", {
      onColorChange: vi.fn(),
      onClose: vi.fn(),
    });

    expect(pill.getColor()).toBe("green");
    const colorBtn = asMockElement(pill.getElement())?.querySelector(".pen-pill-color-btn");
    expect(colorBtn).not.toBeNull();

    pill.setColor("pink");
    expect(pill.getColor()).toBe("pink");
  });

  it("should toggle color palette and invoke onColorChange when picking a color", () => {
    const onColorChange = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange,
      onClose: vi.fn(),
    });

    const el = asMockElement(pill.getElement())!;
    const colorBtn = el.querySelector(".pen-pill-color-btn");
    expect(colorBtn).toBeDefined();

    // Click colorBtn to open palette
    colorBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    const palette = el.querySelector(".pen-pill-palette");
    expect(palette).not.toBeNull();
    expect(palette.classList.contains("is-open")).toBe(true);

    // Pick a dot from palette, e.g. blue
    const blueDot = el.querySelector(".palette-dot-blue");
    expect(blueDot).not.toBeNull();
    blueDot.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    expect(onColorChange).toHaveBeenCalledWith("blue");
    expect(pill.getColor()).toBe("blue");
    expect(palette.classList.contains("is-open")).toBe(false);
  });

  it("should invoke onClose and hide when clicking close button", () => {
    const onClose = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange: vi.fn(),
      onClose,
    });

    const closeBtn = asMockElement(pill.getElement())?.querySelector(".pen-pill-close-btn");
    expect(closeBtn).toBeDefined();

    closeBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(onClose).toHaveBeenCalled();
    expect(pill.isVisible()).toBe(false);
  });

  it("should switch to eraser mode when clicking eraser button and invoke onColorChange('clear')", () => {
    const onColorChange = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange,
      onClose: vi.fn(),
    });

    const el = asMockElement(pill.getElement())!;
    const eraserBtn = el.querySelector(".pen-pill-eraser-btn");
    expect(eraserBtn).not.toBeNull();

    eraserBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    expect(onColorChange).toHaveBeenCalledWith("clear");
    expect(pill.getAction()).toBe("clear");
    expect(pill.isEraser()).toBe(true);
    expect(eraserBtn.classList.contains("is-active")).toBe(true);
  });

  it("should switch to eraser mode when picking clear dot from palette", () => {
    const onColorChange = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange,
      onClose: vi.fn(),
    });

    const el = asMockElement(pill.getElement())!;
    const colorBtn = el.querySelector(".pen-pill-color-btn");
    colorBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    const clearDot = el.querySelector(".palette-dot-clear");
    expect(clearDot).not.toBeNull();
    clearDot.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    expect(onColorChange).toHaveBeenCalledWith("clear");
    expect(pill.getAction()).toBe("clear");
    expect(pill.isEraser()).toBe(true);
  });

  it("should switch back to color mode when a color dot is selected after eraser mode", () => {
    const onColorChange = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange,
      onClose: vi.fn(),
    });

    pill.setAction("clear");
    expect(pill.isEraser()).toBe(true);

    const el = asMockElement(pill.getElement())!;
    const colorBtn = el.querySelector(".pen-pill-color-btn");
    colorBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    const greenDot = el.querySelector(".palette-dot-green");
    greenDot.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });

    expect(onColorChange).toHaveBeenCalledWith("green");
    expect(pill.getAction()).toBe("green");
    expect(pill.getColor()).toBe("green");
    expect(pill.isEraser()).toBe(false);
  });
  it("should render undo and redo buttons with disabled state by default", () => {
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange: vi.fn(),
      onClose: vi.fn(),
    });

    const el = asMockElement(pill.getElement())!;
    const undoBtn = el.querySelector(".pen-pill-undo-btn");
    const redoBtn = el.querySelector(".pen-pill-redo-btn");

    expect(undoBtn).not.toBeNull();
    expect(redoBtn).not.toBeNull();
    expect(undoBtn.classList.contains("is-disabled")).toBe(true);
    expect(redoBtn.classList.contains("is-disabled")).toBe(true);
    expect(undoBtn.getAttribute("aria-disabled")).toBe("true");
    expect(redoBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("setHistoryState toggles disabled state and aria attributes on undo/redo buttons", () => {
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange: vi.fn(),
      onClose: vi.fn(),
    });

    const el = asMockElement(pill.getElement())!;
    const undoBtn = el.querySelector(".pen-pill-undo-btn");
    const redoBtn = el.querySelector(".pen-pill-redo-btn");

    pill.setHistoryState(true, false);
    expect(undoBtn.classList.contains("is-disabled")).toBe(false);
    expect(undoBtn.getAttribute("aria-disabled")).toBeNull();
    expect(redoBtn.classList.contains("is-disabled")).toBe(true);

    pill.setHistoryState(false, true);
    expect(undoBtn.classList.contains("is-disabled")).toBe(true);
    expect(redoBtn.classList.contains("is-disabled")).toBe(false);
    expect(redoBtn.getAttribute("aria-disabled")).toBeNull();
  });

  it("clicking undo and redo triggers callbacks only when enabled", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const pill = new HighlighterPenPill();
    pill.show("yellow", {
      onColorChange: vi.fn(),
      onClose: vi.fn(),
      onUndo,
      onRedo,
    });

    const el = asMockElement(pill.getElement())!;
    const undoBtn = el.querySelector(".pen-pill-undo-btn");
    const redoBtn = el.querySelector(".pen-pill-redo-btn");

    // Disabled initially: clicks ignored
    undoBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });
    redoBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();

    // Enable both
    pill.setHistoryState(true, true);
    undoBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(onUndo).toHaveBeenCalledTimes(1);

    redoBtn.dispatchEvent({ type: "click", stopPropagation: vi.fn(), preventDefault: vi.fn() });
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
