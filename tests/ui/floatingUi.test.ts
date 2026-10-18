import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FloatingTrigger } from "../../src/ui/FloatingTrigger";
import { FloatingPopover, PopoverCallbacks } from "../../src/ui/FloatingPopover";
import { LookupResult } from "../../src/types";

// Helper to create a mock DOM element
function createMockElement(tag: string = "div"): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const attributes: Record<string, string> = {};
  const classListSet = new Set<string>();
  const children: any[] = [];
  let textContent = "";
  let classNameVal = "";

  const el = {
    tagName: tag.toUpperCase(),
    style: {} as Record<string, string>,
    get textContent() {
      return textContent;
    },
    set textContent(val: string) {
      textContent = val;
    },
    get className() {
      return classNameVal;
    },
    set className(val: string) {
      classNameVal = val;
      classListSet.clear();
      val
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classListSet.add(c));
    },
    innerHTML: "",
    parentElement: null as any,
    classList: {
      add: (cls: string) => classListSet.add(cls),
      remove: (cls: string) => classListSet.delete(cls),
      contains: (cls: string) => classListSet.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) classListSet.add(cls);
          else classListSet.delete(cls);
        } else {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        }
      },
    },
    setAttribute: (name: string, val: string) => {
      attributes[name] = val;
    },
    getAttribute: (name: string) => attributes[name] || null,
    appendChild: (child: any) => {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    removeChild: (child: any) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    },
    remove: () => {
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
    addEventListener: (event: string, handler: any) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: any) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    },
    _getListeners: (event: string) => listeners[event] || [],
    dispatchEvent: (eventObj: { type: string; [key: string]: any }) => {
      let current: any = el;
      let stopped = false;
      const originalStop = eventObj.stopPropagation;
      eventObj.stopPropagation = () => {
        stopped = true;
        if (originalStop) originalStop.call(eventObj);
      };
      while (current && !stopped) {
        const handlers = current._getListeners ? current._getListeners(eventObj.type) : [];
        handlers.forEach((h: any) => h(eventObj));
        current = current.parentElement;
      }
    },
    contains: (target: any) => {
      if (target === el) return true;
      return children.some((c) => c.contains?.(target) ?? c === target);
    },
    getBoundingClientRect: () => ({
      width: 380,
      height: 280,
      top: 0,
      left: 0,
      right: 380,
      bottom: 280,
    }),
    querySelector: (selector: string) => {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        if (classListSet.has(className)) return el;
        for (const child of children) {
          const found = child.querySelector?.(selector);
          if (found) return found;
        }
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const results: any[] = [];
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        if (classListSet.has(className)) results.push(el);
      }
      for (const child of children) {
        if (child.querySelectorAll) {
          results.push(...child.querySelectorAll(selector));
        }
      }
      return results;
    },
    closest: (selector: string) => {
      let cur: any = el;
      while (cur) {
        if (selector.startsWith(".") && cur.classList?.contains(selector.slice(1))) {
          return cur;
        }
        if (cur.tagName && cur.tagName.toLowerCase() === selector.toLowerCase()) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
    children,
    get childNodes() {
      return children;
    },
    hasChildNodes: () => children.length > 0,
  };

  return el;
}

describe("UI Layer - FloatingTrigger & FloatingPopover", () => {
  let originalDocument: any;
  let originalWindow: any;
  let originalNavigator: any;
  let mockBody: any;
  let docListeners: Record<string, ((...args: any[]) => void)[]>;
  let winListeners: Record<string, ((...args: any[]) => void)[]>;

  beforeEach(() => {
    originalDocument = (global as any).document;
    originalWindow = (global as any).window;

    docListeners = {};
    winListeners = {};
    mockBody = createMockElement("body");

    (global as any).document = {
      createElement: (tag: string) => createMockElement(tag),
      body: mockBody,
      addEventListener: (event: string, handler: any) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: any) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
      dispatchEvent: (eventObj: { type: string; [key: string]: any }) => {
        const handlers = docListeners[eventObj.type] || [];
        handlers.forEach((h) => h(eventObj));
      },
    };

    (global as any).window = {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: (event: string, handler: any) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: any) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
      dispatchEvent: (eventObj: { type: string; [key: string]: any }) => {
        const handlers = winListeners[eventObj.type] || [];
        handlers.forEach((h) => h(eventObj));
      },
      speechSynthesis: {
        speak: vi.fn(),
        cancel: vi.fn(),
      },
    };

    try {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    (global as any).document = originalDocument;
    (global as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe("FloatingTrigger", () => {
    it("should show trigger button at calculated position and trigger onClick", () => {
      const trigger = new FloatingTrigger();
      const onClick = vi.fn();

      expect(trigger.isVisible()).toBe(false);

      trigger.show(
        { top: 100, bottom: 120, left: 100, right: 150 },
        onClick
      );

      expect(trigger.isVisible()).toBe(true);
      const el = trigger.getElement();
      expect(el).not.toBeNull();
      expect(el?.className).toContain("english-study-trigger");
      expect(el?.style.position).toBe("fixed");

      // Click the trigger
      el?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      expect(onClick).toHaveBeenCalledTimes(1);

      // Hide trigger
      trigger.hide();
      expect(trigger.isVisible()).toBe(false);
      expect(trigger.getElement()).toBeNull();
    });

    it("should flip below selection when rect.top is near top of screen", () => {
      const trigger = new FloatingTrigger();
      trigger.show(
        { top: 5, bottom: 25, left: 50, right: 80 },
        vi.fn()
      );

      const el = trigger.getElement();
      expect(el?.style.top).toBe("29px"); // 25 + 4
      trigger.hide();
    });
  });

  describe("FloatingPopover", () => {
    const mockResult: LookupResult = {
      query: "ephemeral",
      type: "word",
      phonetic: "ɪˈfem.ər.əl",
      audioUrl: "https://example.com/audio.mp3",
      vietnameseTranslation: "phù du, chóng tàn",
      definitions: [
        {
          partOfSpeech: "adjective",
          meaningEn: "Lasting for a very short time.",
          example: "Fame in the world of pop is largely ephemeral.",
        },
      ],
      aiGrammarNote: "Tính từ thường đứng trước danh từ hoặc sau to be.",
      contextSentence: "The beauty of cherry blossoms is ephemeral.",
      contextSentenceClean: "The beauty of cherry blossoms is ephemeral.",
      timestamp: Date.now(),
    };

    it("should render card popover with query, phonetic, translation, and definitions", () => {
      const popover = new FloatingPopover();
      const callbacks: PopoverCallbacks = {
        onSave: vi.fn(),
        onPinToSidebar: vi.fn(),
        onClose: vi.fn(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        callbacks
      );

      expect(popover.isVisible()).toBe(true);
      const el = popover.getElement();
      expect(el).not.toBeNull();

      const queryEl = el?.querySelector(".vocab-query");
      expect(queryEl?.textContent).toBe("ephemeral");

      const phoneticEl = el?.querySelector(".vocab-phonetic");
      expect(phoneticEl?.textContent).toBe("/ɪˈfem.ər.əl/");

      const viEl = el?.querySelector(".vocab-meaning-vi");
      expect(viEl?.textContent).toBe("phù du, chóng tàn");

      const defItem = el?.querySelector(".vocab-def-item");
      expect(defItem).not.toBeNull();

      const aiNote = el?.querySelector(".vocab-ai-note");
      expect(aiNote).not.toBeNull();

      const contextBox = el?.querySelector(".vocab-context-box");
      expect(contextBox).not.toBeNull();

      popover.hide();
      expect(popover.isVisible()).toBe(false);
    });

    it("should call onSave when clicking save button", async () => {
      const popover = new FloatingPopover();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const callbacks: PopoverCallbacks = { onSave };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        callbacks
      );

      const el = popover.getElement();
      const saveBtn = el?.querySelector(".vocab-btn-save");
      expect(saveBtn).not.toBeNull();

      await saveBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onSave).toHaveBeenCalledWith(mockResult);
      popover.hide();
    });

    it("should call onPinToSidebar when clicking pin button", () => {
      const popover = new FloatingPopover();
      const onPin = vi.fn();
      const callbacks: PopoverCallbacks = {
        onSave: vi.fn(),
        onPinToSidebar: onPin,
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        callbacks
      );

      const el = popover.getElement();
      const pinBtn = el?.querySelector(".popover-btn-pin");
      expect(pinBtn).not.toBeNull();

      pinBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onPin).toHaveBeenCalledWith(mockResult);
      popover.hide();
    });

    it("should hide on Escape key and trigger onClose", () => {
      const popover = new FloatingPopover();
      const onClose = vi.fn();
      const callbacks: PopoverCallbacks = {
        onSave: vi.fn(),
        onClose,
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        callbacks
      );

      expect(popover.isVisible()).toBe(true);

      // Dispatch Escape key
      document.dispatchEvent({
        type: "keydown",
        key: "Escape",
      });

      expect(popover.isVisible()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });

    it("should copy text to clipboard when clicking copy button", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = popover.getElement();
      const copyBtn = el?.querySelector(".vocab-btn-copy");
      expect(copyBtn).not.toBeNull();

      copyBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      popover.hide();
    });

    it("should render drag handle affordance in popover header", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = popover.getElement();
      const dragHandle = el?.querySelector(".popover-drag-handle");
      expect(dragHandle).not.toBeNull();
      popover.hide();
    });

    it("should update popover position when dragging header", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = popover.getElement()!;
      const header = el.querySelector(".popover-header");
      expect(header).not.toBeNull();

      const initialLeft = parseInt(el.style.left, 10);
      const initialTop = parseInt(el.style.top, 10);

      // Start drag at (300, 200)
      header.dispatchEvent({
        type: "mousedown",
        clientX: 300,
        clientY: 200,
        button: 0,
        target: header,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      // Move mouse by (+50, +30)
      window.dispatchEvent({
        type: "mousemove",
        clientX: 350,
        clientY: 230,
      });

      // Popover coordinates should have shifted
      expect(parseInt(el.style.left, 10)).toBe(initialLeft + 50);
      expect(parseInt(el.style.top, 10)).toBe(initialTop + 30);
      expect(el.classList.contains("is-dragging")).toBe(true);

      // Mouse up to end drag
      window.dispatchEvent({
        type: "mouseup",
        clientX: 350,
        clientY: 230,
      });

      expect(el.classList.contains("is-dragging")).toBe(false);
      popover.hide();
    });

    it("should clamp popover position within viewport boundaries when dragged too far", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = popover.getElement()!;
      const header = el.querySelector(".popover-header");

      // Start drag
      header.dispatchEvent({
        type: "mousedown",
        clientX: 300,
        clientY: 200,
        button: 0,
        target: header,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      // Move way beyond top-left (negative coordinates)
      window.dispatchEvent({
        type: "mousemove",
        clientX: -500,
        clientY: -500,
      });

      // Left and top should be clamped to minimum 8px
      expect(parseInt(el.style.left, 10)).toBe(8);
      expect(parseInt(el.style.top, 10)).toBe(8);

      // Move way beyond bottom-right
      window.dispatchEvent({
        type: "mousemove",
        clientX: 2000,
        clientY: 2000,
      });

      // Should be clamped to window width/height minus element dimensions and padding
      expect(parseInt(el.style.left, 10)).toBeLessThanOrEqual(window.innerWidth - 380 - 8);
      expect(parseInt(el.style.top, 10)).toBeLessThanOrEqual(window.innerHeight - 280 - 8);

      window.dispatchEvent({ type: "mouseup" });
      popover.hide();
    });

    it("should NOT initiate drag when mousedown occurs on action buttons inside header", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = popover.getElement()!;
      const audioBtn = el.querySelector(".audio-btn");
      expect(audioBtn).not.toBeNull();

      const initialLeft = el.style.left;
      const initialTop = el.style.top;

      // Mouse down on audio button
      audioBtn.dispatchEvent({
        type: "mousedown",
        clientX: 300,
        clientY: 200,
        button: 0,
        target: audioBtn,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      // Mouse move
      window.dispatchEvent({
        type: "mousemove",
        clientX: 400,
        clientY: 300,
      });

      // Position should not have moved
      expect(el.style.left).toBe(initialLeft);
      expect(el.style.top).toBe(initialTop);
      expect(el.classList.contains("is-dragging")).toBe(false);

      popover.hide();
    });

    it("should render compact loading card with query title, spinner, and drag handle via showLoading()", () => {
      const popover = new FloatingPopover();
      popover.showLoading(
        { top: 100, bottom: 120, left: 200, right: 280 },
        "serendipity",
        { onClose: vi.fn() }
      );

      const el = popover.getElement();
      expect(el).not.toBeNull();
      expect(el?.classList.contains("popover-loading")).toBe(true);

      const queryEl = el?.querySelector(".vocab-query");
      expect(queryEl?.textContent).toContain("serendipity");

      const spinner = el?.querySelector(".popover-loading-spinner");
      expect(spinner).not.toBeNull();

      const dragHandle = el?.querySelector(".popover-drag-handle");
      expect(dragHandle).not.toBeNull();

      popover.hide();
    });

    it("should cancel loading and invoke onClose callback when close button clicked in loading state", () => {
      const popover = new FloatingPopover();
      const onClose = vi.fn();
      popover.showLoading(
        { top: 100, bottom: 120, left: 200, right: 280 },
        "serendipity",
        { onClose }
      );

      const el = popover.getElement()!;
      const closeBtn = el.querySelector(".popover-btn-close");
      expect(closeBtn).not.toBeNull();

      closeBtn?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(popover.isVisible()).toBe(false);
    });
  });
});
