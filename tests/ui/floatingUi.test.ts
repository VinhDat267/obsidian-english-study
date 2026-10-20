import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FloatingTrigger } from "../../src/ui/FloatingTrigger";
import { FloatingPopover, PopoverCallbacks } from "../../src/ui/FloatingPopover";
import { LookupResult } from "../../src/types";

// This suite installs plain-object DOM doubles rather than browser elements.
function asMockElement(element: HTMLElement | null | undefined): any { return element; }
function dispatchMockEvent(target: Window | Document, event: Record<string, unknown>): void {
  target.dispatchEvent(event as unknown as Event);
}

// Helper to create a mock DOM element
function createMockElement(tag: string = "div"): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const attributes: Record<string, string> = {};
  const classListSet = new Set<string>();
  const children: any[] = [];
  let textContent = "";
  let classNameVal = "";
  let innerHtmlVal = "";

  const el = {
    tagName: tag.toUpperCase(),
    style: {} as Record<string, string>,
    get textContent() {
      if (children.length > 0) {
        return children.map((c) => c.textContent || "").join("");
      }
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
    get innerHTML() {
      return innerHtmlVal;
    },
    set innerHTML(val: string) {
      innerHtmlVal = val;
      textContent = val.replace(/<[^>]*>/g, "");
      if (val === "") {
        children.length = 0;
      }
    },
    get firstChild() {
      return children[0] || null;
    },
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
    insertBefore: (newChild: any, refChild: any) => {
      newChild.parentElement = el;
      const idx = children.indexOf(refChild);
      if (idx !== -1) {
        children.splice(idx, 0, newChild);
      } else {
        children.push(newChild);
      }
      return newChild;
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
      const el = asMockElement(trigger.getElement());
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
      expect(asMockElement(trigger.getElement())).toBeNull();
    });

    it("should flip below selection when rect.top is near top of screen", () => {
      const trigger = new FloatingTrigger();
      trigger.show(
        { top: 5, bottom: 25, left: 50, right: 80 },
        vi.fn()
      );

      const el = asMockElement(trigger.getElement());
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
      const el = asMockElement(popover.getElement());
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

    it("should clamp maxHeight to never exceed viewport bottom and isolate wheel events", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 50, bottom: 80, left: 100, right: 200 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement())!;
      expect(el.style.maxHeight).toBeDefined();
      const maxHeight = parseInt(el.style.maxHeight, 10);
      const top = parseInt(el.style.top, 10);
      expect(top + maxHeight).toBeLessThanOrEqual(window.innerHeight);

      // Verify wheel event stops propagation
      const stopPropagationSpy = vi.fn();
      el.dispatchEvent({
        type: "wheel",
        stopPropagation: stopPropagationSpy,
      });
      expect(stopPropagationSpy).toHaveBeenCalled();
      popover.hide();
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

      const el = asMockElement(popover.getElement());
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

      const el = asMockElement(popover.getElement());
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
      dispatchMockEvent(document, {
        type: "keydown",
        key: "Escape",
      });

      expect(popover.isVisible()).toBe(false);
      expect(onClose).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should copy text to clipboard when clicking copy button", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement());
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

      const el = asMockElement(popover.getElement());
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

      const el = asMockElement(popover.getElement())!;
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
      dispatchMockEvent(window, {
        type: "mousemove",
        clientX: 350,
        clientY: 230,
      });

      // Popover coordinates should have shifted
      expect(parseInt(el.style.left, 10)).toBe(initialLeft + 50);
      expect(parseInt(el.style.top, 10)).toBe(initialTop + 30);
      expect(el.classList.contains("is-dragging")).toBe(true);

      // Mouse up to end drag
      dispatchMockEvent(window, {
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

      const el = asMockElement(popover.getElement())!;
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
      dispatchMockEvent(window, {
        type: "mousemove",
        clientX: -500,
        clientY: -500,
      });

      // Left and top should be clamped to minimum 8px
      expect(parseInt(el.style.left, 10)).toBe(8);
      expect(parseInt(el.style.top, 10)).toBe(8);

      // Move way beyond bottom-right
      dispatchMockEvent(window, {
        type: "mousemove",
        clientX: 2000,
        clientY: 2000,
      });

      // Should be clamped to window width/height minus element dimensions and padding
      expect(parseInt(el.style.left, 10)).toBeLessThanOrEqual(window.innerWidth - 380 - 8);
      expect(parseInt(el.style.top, 10)).toBeLessThanOrEqual(window.innerHeight - 280 - 8);

      dispatchMockEvent(window, { type: "mouseup" });
      popover.hide();
    });

    it("should NOT initiate drag when mousedown occurs on action buttons inside header", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement())!;
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
      dispatchMockEvent(window, {
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

      const el = asMockElement(popover.getElement());
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

      const el = asMockElement(popover.getElement())!;
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

    it("should preserve dragged position when transitioning from showLoading to show", () => {
      const popover = new FloatingPopover();
      const rect = { top: 100, bottom: 120, left: 200, right: 280 };
      popover.showLoading(rect, "authentication", { onClose: vi.fn() });

      const el = asMockElement(popover.getElement())!;
      const header = el.querySelector(".popover-header")!;
      const initialLeft = parseInt(el.style.left, 10);
      const initialTop = parseInt(el.style.top, 10);

      // Drag loading card by (+150, +100)
      header.dispatchEvent({
        type: "mousedown",
        clientX: 300,
        clientY: 200,
        button: 0,
        target: header,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      dispatchMockEvent(window, {
        type: "mousemove",
        clientX: 450,
        clientY: 300,
      });
      dispatchMockEvent(window, {
        type: "mouseup",
        clientX: 450,
        clientY: 300,
      });

      expect(parseInt(el.style.left, 10)).toBe(initialLeft + 150);
      expect(parseInt(el.style.top, 10)).toBe(initialTop + 100);

      // Now lookup finishes and calls show() with result
      popover.show(rect, mockResult, { onSave: vi.fn() });

      const newEl = asMockElement(popover.getElement())!;
      // New element must stay at the dragged position, NOT snap back to rect!
      expect(parseInt(newEl.style.left, 10)).toBe(initialLeft + 150);
      expect(parseInt(newEl.style.top, 10)).toBe(initialTop + 100);

      popover.hide();
    });

    it("should report isUserDragging and wasJustDragged accurately", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement())!;
      const header = el.querySelector(".popover-header")!;

      expect(popover.isUserDragging()).toBe(false);
      expect(popover.wasJustDragged()).toBe(false);

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

      expect(popover.isUserDragging()).toBe(true);

      // End drag
      dispatchMockEvent(window, {
        type: "mouseup",
        clientX: 300,
        clientY: 200,
      });

      expect(popover.isUserDragging()).toBe(false);
      expect(popover.wasJustDragged()).toBe(true);

      popover.hide();
      expect(popover.getCustomPosition()).toBeNull();
    });

    it("should display language badge and transliteration when provided in LookupResult", () => {
      const popover = new FloatingPopover();
      const jaResult: LookupResult = {
        query: "こんにちは",
        type: "word",
        contextSentence: "こんにちは世界",
        contextSentenceClean: "こんにちは世界",
        vietnameseTranslation: "xin chào",
        sourceLang: "ja",
        transliteration: "Konnichiwa",
        timestamp: Date.now(),
      };
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        jaResult,
        { onSave: vi.fn() }
      );
      const el = asMockElement(popover.getElement())!;
      const badge = el.querySelector(".vocab-lang-badge");
      expect(badge).toBeDefined();
      expect(badge?.textContent).toContain("JA");

      const translit = el.querySelector(".vocab-transliteration");
      expect(translit).toBeDefined();
      expect(translit?.textContent).toContain("Konnichiwa");
      popover.hide();
    });

    it("should set speech utterance lang according to sourceLang on audio click", () => {
      const popover = new FloatingPopover();
      const speakMock = vi.fn();
      (window as any).speechSynthesis = {
        speak: speakMock,
        cancel: vi.fn(),
      };
      (global as any).SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
        text: string;
        lang: string = "";
        constructor(text: string) {
          this.text = text;
        }
      };

      const jaResult: LookupResult = {
        query: "こんにちは",
        type: "word",
        contextSentence: "こんにちは世界",
        contextSentenceClean: "こんにちは世界",
        vietnameseTranslation: "xin chào",
        sourceLang: "ja",
        timestamp: Date.now(),
      };
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        jaResult,
        { onSave: vi.fn() }
      );
      const el = asMockElement(popover.getElement())!;
      const audioBtn = el.querySelector(".audio-btn") as any;
      audioBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(speakMock).toHaveBeenCalled();
      const utterance = speakMock.mock.calls[0][0];
      expect(utterance.lang).toBe("ja-JP");
      popover.hide();
    });

    it("should NOT render .vocab-ai-note when enableAiGrammar is false even if aiGrammarNote exists", () => {
      const popover = new FloatingPopover();
      const mockResult: LookupResult = {
        query: "scrum",
        type: "word",
        contextSentence: "We use Scrum in Agile.",
        contextSentenceClean: "We use Scrum in Agile.",
        vietnameseTranslation: "phương pháp scrum",
        aiGrammarNote: "Danh từ riêng chỉ khung làm việc linh hoạt.",
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const aiNote = el.querySelector(".vocab-ai-note");
      expect(aiNote).toBeNull();

      popover.hide();
    });

    it("should render [AI] badge when aiTranslation is present", () => {
      const popover = new FloatingPopover();
      const mockResult: LookupResult = {
        query: "deployment",
        type: "word",
        contextSentence: "Production deployment started.",
        contextSentenceClean: "Production deployment started.",
        vietnameseTranslation: "triển khai",
        aiTranslation: "triển khai phần mềm",
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const viMeaning = el.querySelector(".vocab-meaning-vi");
      expect(viMeaning).not.toBeNull();
      const aiBadge = viMeaning?.querySelector(".vocab-ai-badge-inline");
      expect(aiBadge).not.toBeNull();
      expect(aiBadge?.textContent?.trim()).toBe("AI");
      expect(viMeaning?.textContent).toContain("triển khai phần mềm");

      popover.hide();
    });

    it("should render grammar loading skeleton when enableAiGrammar is true and aiLoading is true", () => {
      const popover = new FloatingPopover();
      const mockResult: LookupResult = {
        query: "architecture",
        type: "word",
        contextSentence: "System architecture is robust.",
        contextSentenceClean: "System architecture is robust.",
        vietnameseTranslation: "kiến trúc",
        aiLoading: true,
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() },
        { enableAiGrammar: true, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const aiNote = el.querySelector(".vocab-ai-note");
      expect(aiNote).not.toBeNull();
      expect(aiNote?.classList.contains("vocab-ai-loading")).toBe(true);

      popover.hide();
    });

    it("should update translation and grammar progressively via updateAiContent", () => {
      const popover = new FloatingPopover();
      const initialResult: LookupResult = {
        query: "pipeline",
        type: "word",
        contextSentence: "The CI/CD pipeline succeeded.",
        contextSentenceClean: "The CI/CD pipeline succeeded.",
        vietnameseTranslation: "đường ống",
        aiLoading: true,
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        initialResult,
        { onSave: vi.fn() },
        { enableAiGrammar: true, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const viMeaningInitial = el.querySelector(".vocab-meaning-vi");
      expect(viMeaningInitial?.textContent).toContain("đường ống");
      const loadingChipInitial = viMeaningInitial?.querySelector(".vocab-ai-loading-chip");
      expect(loadingChipInitial).not.toBeNull();

      // Progressive update from AI background call
      popover.updateAiContent(
        {
          ...initialResult,
          aiTranslation: "quy trình tự động hóa CI/CD",
          aiGrammarNote: "**Pipeline** là danh từ kỹ thuật trong phần mềm.",
          aiLoading: false,
        },
        { enableAiGrammar: true, enableAiTranslation: true }
      );

      const viMeaningUpdated = el.querySelector(".vocab-meaning-vi");
      expect(viMeaningUpdated?.textContent).toContain("quy trình tự động hóa CI/CD");
      const aiBadge = viMeaningUpdated?.querySelector(".vocab-ai-badge-inline");
      expect(aiBadge).not.toBeNull();
      expect(viMeaningUpdated?.querySelector(".vocab-ai-loading-chip")).toBeNull();

      const aiNote = el.querySelector(".vocab-ai-note");
      expect(aiNote).not.toBeNull();
      expect(aiNote?.classList.contains("vocab-ai-loading")).toBe(false);
      expect(aiNote?.textContent).toContain("Pipeline");

      popover.hide();
    });

    it("should gracefully remove loading chip if AI fails or returns undefined", () => {
      const popover = new FloatingPopover();
      const initialResult: LookupResult = {
        query: "eligible",
        type: "word",
        contextSentence: "He is eligible for the scholarship.",
        contextSentenceClean: "He is eligible for the scholarship.",
        vietnameseTranslation: "đủ điều kiện",
        aiLoading: true,
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        initialResult,
        { onSave: vi.fn() },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const viMeaning = el.querySelector(".vocab-meaning-vi");
      expect(viMeaning?.querySelector(".vocab-ai-loading-chip")).not.toBeNull();

      // AI call finishes with failure / undefined translation
      popover.updateAiContent(
        {
          ...initialResult,
          aiLoading: false,
          aiTranslation: undefined,
        },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      // Loading chip should be removed cleanly, base translation remains intact
      expect(viMeaning?.querySelector(".vocab-ai-loading-chip")).toBeNull();
      expect(viMeaning?.textContent).toContain("đủ điều kiện");

      popover.hide();
    });

    it("should match query in updateAiContent even with whitespace padding", () => {
      const popover = new FloatingPopover();
      const initialResult: LookupResult = {
        query: "architecture",
        type: "word",
        contextSentence: "System architecture.",
        contextSentenceClean: "System architecture.",
        vietnameseTranslation: "kiến trúc",
        aiLoading: true,
        timestamp: Date.now(),
      };

      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        initialResult,
        { onSave: vi.fn() },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      // Callback arrives with clean query
      popover.updateAiContent(
        {
          ...initialResult,
          query: "  architecture  ",
          aiTranslation: "kiến trúc hệ thống",
          aiLoading: false,
        },
        { enableAiGrammar: false, enableAiTranslation: true }
      );

      const el = asMockElement(popover.getElement())!;
      const viMeaning = el.querySelector(".vocab-meaning-vi");
      expect(viMeaning?.textContent).toContain("kiến trúc hệ thống");

      popover.hide();
    });

    it("should render popover-btn-highlight and toggle palette when onHighlight is provided and isReadingMode is true", () => {
      const popover = new FloatingPopover();
      const onHighlight = vi.fn();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn(), onHighlight },
        { isReadingMode: true }
      );

      const el = asMockElement(popover.getElement())!;
      const highlightBtn = el.querySelector(".popover-btn-highlight");
      expect(highlightBtn).not.toBeNull();

      const palette = el.querySelector(".popover-highlight-palette");
      expect(palette).not.toBeNull();
      expect(palette?.style.display).toBe("none");

      // Click highlight button to open palette
      highlightBtn?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      expect(palette?.style.display).toBe("flex");

      // Click again to close palette
      highlightBtn?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      expect(palette?.style.display).toBe("none");

      popover.hide();
    });

    it("should NOT render popover-btn-highlight when isReadingMode is false or omitted (Edit Mode)", () => {
      const popover = new FloatingPopover();
      const onHighlight = vi.fn();
      // Omitted options
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn(), onHighlight }
      );
      expect(asMockElement(popover.getElement())!.querySelector(".popover-btn-highlight")).toBeNull();
      popover.hide();

      // Explicit isReadingMode: false
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn(), onHighlight },
        { isReadingMode: false }
      );
      expect(asMockElement(popover.getElement())!.querySelector(".popover-btn-highlight")).toBeNull();
      popover.hide();
    });

    it("should invoke onHighlight with color and close palette when color dot is clicked", () => {
      const popover = new FloatingPopover();
      const onHighlight = vi.fn();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn(), onHighlight },
        { isReadingMode: true }
      );

      const el = asMockElement(popover.getElement())!;
      const palette = el.querySelector(".popover-highlight-palette")!;
      const greenDot = el.querySelector(".dot-green");
      expect(greenDot).not.toBeNull();

      greenDot?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onHighlight).toHaveBeenCalledWith("green");
      expect(palette.style.display).toBe("none");

      // Click clear dot
      const clearDot = el.querySelector(".dot-clear");
      expect(clearDot).not.toBeNull();

      clearDot?.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onHighlight).toHaveBeenCalledWith("clear");

      popover.hide();
    });

    it("should call preventDefault on mousedown for highlight button and color dots to preserve editor focus", () => {
      const popover = new FloatingPopover();
      const onHighlight = vi.fn();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn(), onHighlight },
        { isReadingMode: true }
      );

      const el = asMockElement(popover.getElement())!;
      const highlightBtn = el.querySelector(".popover-btn-highlight")!;
      const preventDefaultMock = vi.fn();

      highlightBtn.dispatchEvent({
        type: "mousedown",
        preventDefault: preventDefaultMock,
        stopPropagation: vi.fn(),
      });

      expect(preventDefaultMock).toHaveBeenCalled();

      const yellowDot = el.querySelector(".dot-yellow")!;
      const preventDefaultDotMock = vi.fn();
      yellowDot.dispatchEvent({
        type: "mousedown",
        preventDefault: preventDefaultDotMock,
        stopPropagation: vi.fn(),
      });

      expect(preventDefaultDotMock).toHaveBeenCalled();

      popover.hide();
    });
    it("should render window pin button (.popover-btn-pin-window) and report isPinnedPopover", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement())!;
      const pinWindowBtn = el.querySelector(".popover-btn-pin-window");
      expect(pinWindowBtn).not.toBeNull();
      expect(pinWindowBtn?.getAttribute("title")).toContain("Ghim");
      expect(popover.isPinnedPopover()).toBe(false);

      popover.hide();
    });

    it("should toggle pinned state when pin button is clicked", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );

      const el = asMockElement(popover.getElement())!;
      const pinWindowBtn = el.querySelector(".popover-btn-pin-window")!;

      pinWindowBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(popover.isPinnedPopover()).toBe(true);
      expect(pinWindowBtn.classList.contains("is-pinned")).toBe(true);
      expect(pinWindowBtn.getAttribute("title")).toContain("Bỏ ghim");

      pinWindowBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(popover.isPinnedPopover()).toBe(false);
      expect(pinWindowBtn.classList.contains("is-pinned")).toBe(false);

      popover.hide();
    });

    it("should NOT hide on outside click when pinned, but hide when unpinned", () => {
      vi.useFakeTimers();
      const popover = new FloatingPopover();
      const onClose = vi.fn();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onClose }
      );

      popover.setPinned(true);
      vi.runAllTimers();

      const outsideEl = createMockElement("div");
      (global as any).document.dispatchEvent({
        type: "mousedown",
        target: outsideEl,
      });

      expect(popover.isVisible()).toBe(true);
      expect(onClose).not.toHaveBeenCalled();

      // Unpin and trigger outside click
      popover.setPinned(false);
      (global as any).document.dispatchEvent({
        type: "mousedown",
        target: outsideEl,
      });

      expect(popover.isVisible()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });

    it("should preserve pinned state when updating popover with new search result", () => {
      const popover = new FloatingPopover();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onSave: vi.fn() }
      );
      popover.setPinned(true);

      const nextResult: LookupResult = {
        query: "transformer",
        type: "word",
        vietnameseTranslation: "mô hình transformer",
        definitions: [],
        timestamp: Date.now(),
      };
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        nextResult,
        { onSave: vi.fn() }
      );

      expect(popover.isPinnedPopover()).toBe(true);
      const el = asMockElement(popover.getElement())!;
      const pinWindowBtn = el.querySelector(".popover-btn-pin-window")!;
      expect(pinWindowBtn.classList.contains("is-pinned")).toBe(true);

      popover.hide();
    });

    it("should unpin and hide when close button is clicked", () => {
      const popover = new FloatingPopover();
      const onClose = vi.fn();
      popover.show(
        { top: 100, bottom: 120, left: 200, right: 280 },
        mockResult,
        { onClose }
      );
      popover.setPinned(true);

      const el = asMockElement(popover.getElement())!;
      const closeBtn = el.querySelector(".popover-btn-close")!;

      closeBtn.dispatchEvent({
        type: "click",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(popover.isVisible()).toBe(false);
      expect(popover.isPinnedPopover()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
