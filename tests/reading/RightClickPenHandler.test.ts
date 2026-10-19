// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RightClickPenHandler,
  createOrderedRange,
} from "../../src/reading/RightClickPenHandler";

describe("RightClickPenHandler", () => {
  let container: HTMLElement;
  let mockView: any;
  let onHighlightSpy: any;
  let isPenActive: boolean;
  let penAction: any;
  let handler: RightClickPenHandler;

  beforeEach(() => {
    container = document.createElement("div");
    container.className = "markdown-preview-view";
    document.body.appendChild(container);

    mockView = {
      contentEl: container,
      getMode: () => "preview",
    };

    isPenActive = true;
    penAction = "yellow";
    onHighlightSpy = vi.fn();

    handler = new RightClickPenHandler({
      isPenActive: () => isPenActive,
      getPenAction: () => penAction,
      onHighlight: onHighlightSpy,
      getActiveView: () => mockView,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  describe("createOrderedRange", () => {
    it("orders range within the same text node forward", () => {
      const p = document.createElement("p");
      p.textContent = "Hello world";
      container.appendChild(p);
      const textNode = p.firstChild!;

      const start = document.createRange();
      start.setStart(textNode, 0);
      const end = document.createRange();
      end.setStart(textNode, 5);

      const ordered = createOrderedRange(start, end, document);
      expect(ordered.startOffset).toBe(0);
      expect(ordered.endOffset).toBe(5);
      expect(ordered.toString()).toBe("Hello");
    });

    it("orders range within the same text node backward", () => {
      const p = document.createElement("p");
      p.textContent = "Hello world";
      container.appendChild(p);
      const textNode = p.firstChild!;

      const start = document.createRange();
      start.setStart(textNode, 5);
      const end = document.createRange();
      end.setStart(textNode, 0);

      const ordered = createOrderedRange(start, end, document);
      expect(ordered.startOffset).toBe(0);
      expect(ordered.endOffset).toBe(5);
      expect(ordered.toString()).toBe("Hello");
    });
  });

  describe("Mouse Event Handling", () => {
    function eventAt(type: string, target: Node, x: number): MouseEvent {
      const event = new MouseEvent(type, { button: 2, buttons: 2, clientX: x, clientY: 10 });
      Object.defineProperty(event, "target", { value: target });
      return event;
    }

    function startDrag(target: HTMLElement): void {
      const range = document.createRange();
      range.selectNodeContents(target);
      const start = document.createRange();
      start.setStart(target.firstChild!, 0);
      const end = document.createRange();
      end.setStart(target.firstChild!, target.textContent!.length);
      let calls = 0;
      (document as any).caretRangeFromPoint = () => calls++ === 0 ? start : end;
      handler.handleMouseDown(eventAt("mousedown", target, 10));
      handler.handleMouseMove(eventAt("mousemove", target, 80));
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    }

    it("rejects source mode before a right drag is admitted", () => {
      container.innerHTML = "<p>editable selection</p>";
      const p = container.querySelector("p")!;
      mockView.getMode = () => "source";
      startDrag(p);
      handler.handleMouseUp(eventAt("mouseup", p, 80));
      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it.each(["cm-editor", "contenteditable"])("rejects %s targets inside a preview view", kind => {
      container.innerHTML = kind === "cm-editor"
        ? '<div class="cm-editor"><p>editable selection</p></div>'
        : '<div contenteditable="true"><p>editable selection</p></div>';
      const p = container.querySelector("p")!;
      startDrag(p);
      handler.handleMouseUp(eventAt("mouseup", p, 80));
      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("cancels on a mode change during move even if preview returns before release", () => {
      container.innerHTML = "<p>reading selection</p>";
      const p = container.querySelector("p")!;
      startDrag(p);
      mockView.getMode = () => "source";
      handler.handleMouseMove(eventAt("mousemove", p, 90));
      mockView.getMode = () => "preview";
      handler.handleMouseUp(eventAt("mouseup", p, 90));
      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("rechecks preview and pen activity at release", () => {
      container.innerHTML = "<p>reading selection</p>";
      const p = container.querySelector("p")!;
      startDrag(p);
      mockView.getMode = () => "source";
      handler.handleMouseUp(eventAt("mouseup", p, 80));
      expect(onHighlightSpy).not.toHaveBeenCalled();
      mockView.getMode = () => "preview";
      startDrag(p);
      isPenActive = false;
      handler.handleMouseUp(eventAt("mouseup", p, 80));
      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("rejects a drag whose selection reaches into an editable region", () => {
      container.innerHTML = '<p>reading selection</p><div class="cm-editor">editable text</div>';
      const p = container.querySelector("p")!;
      startDrag(p);
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.setEnd(container.querySelector(".cm-editor")!.firstChild!, 5);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      handler.handleMouseUp(eventAt("mouseup", p, 80));
      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("does nothing when pen mode is inactive", () => {
      isPenActive = false;

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      handler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 100, clientY: 10 });
      handler.handleMouseMove(moveEvent);

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 100, clientY: 10 });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("does nothing if mouse button is not right click (button !== 2)", () => {
      const downEvent = new MouseEvent("mousedown", { button: 0, clientX: 10, clientY: 10 });
      handler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 1, clientX: 100, clientY: 10 });
      handler.handleMouseMove(moveEvent);

      const upEvent = new MouseEvent("mouseup", { button: 0, clientX: 100, clientY: 10 });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).not.toHaveBeenCalled();
    });

    it("does NOT highlight on simple right click without dragging, and leaves contextmenu untouched", () => {
      const p = document.createElement("p");
      p.textContent = "Simple text";
      container.appendChild(p);

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 20, clientY: 20 });
      Object.defineProperty(downEvent, "target", { value: p });
      handler.handleMouseDown(downEvent);

      // Minimal move <= 4px
      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 22, clientY: 21 });
      handler.handleMouseMove(moveEvent);

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 22, clientY: 21 });
      Object.defineProperty(upEvent, "target", { value: p });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).not.toHaveBeenCalled();

      // contextmenu should NOT be suppressed
      const contextEvent = new MouseEvent("contextmenu");
      const preventDefaultSpy = vi.spyOn(contextEvent, "preventDefault");
      const handled = handler.handleContextMenu(contextEvent);

      expect(handled).toBe(false);
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it("highlights and suppresses contextmenu when right-dragging text", () => {
      const p = document.createElement("p");
      p.textContent = "Continuous reading highlight test";
      container.appendChild(p);
      const textNode = p.firstChild!;

      const mockStartRange = document.createRange();
      mockStartRange.setStart(textNode, 0);

      const mockEndRange = document.createRange();
      mockEndRange.setStart(textNode, 10);

      let caretCallCount = 0;
      (document as any).caretRangeFromPoint = vi.fn((x: number, y: number) => {
        caretCallCount++;
        return caretCallCount === 1 ? mockStartRange : mockEndRange;
      });

      // 1. Right mousedown
      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvent, "target", { value: p });
      handler.handleMouseDown(downEvent);

      // 2. Right mousemove (> 4px drag)
      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 80, clientY: 10 });
      handler.handleMouseMove(moveEvent);

      // Mock window.getSelection() toString to return the selected slice
      const mockRange = document.createRange();
      mockRange.setStart(textNode, 0);
      mockRange.setEnd(textNode, 10);

      const removeAllRangesSpy = vi.fn();
      vi.spyOn(window, "getSelection").mockReturnValue({
        rangeCount: 1,
        toString: () => "Continuous",
        getRangeAt: () => mockRange,
        removeAllRanges: removeAllRangesSpy,
        addRange: vi.fn(),
      } as any);

      // 3. Right mouseup
      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 80, clientY: 10 });
      Object.defineProperty(upEvent, "target", { value: p });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).toHaveBeenCalledWith("yellow", "Continuous", expect.anything(), mockView);
      expect(removeAllRangesSpy).toHaveBeenCalled();

      // 4. Contextmenu should be suppressed
      const contextEvent = new MouseEvent("contextmenu");
      const preventDefaultSpy = vi.spyOn(contextEvent, "preventDefault");
      const handled = handler.handleContextMenu(contextEvent);

      expect(handled).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("triggers clear action when penAction is 'clear'", () => {
      penAction = "clear";

      const p = document.createElement("p");
      p.textContent = "Delete this highlight";
      container.appendChild(p);
      const textNode = p.firstChild!;

      const mockRange = document.createRange();
      mockRange.setStart(textNode, 0);
      mockRange.setEnd(textNode, 6);

      (document as any).caretRangeFromPoint = vi.fn(() => mockRange);

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvent, "target", { value: p });
      handler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 70, clientY: 10 });
      handler.handleMouseMove(moveEvent);

      vi.spyOn(window, "getSelection").mockReturnValue({
        rangeCount: 1,
        toString: () => "Delete",
        getRangeAt: () => mockRange,
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
      } as any);

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 70, clientY: 10 });
      Object.defineProperty(upEvent, "target", { value: p });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).toHaveBeenCalledWith("clear", "Delete", expect.anything(), mockView);
    });

    it("ignores right-drag selections shorter than 2 characters", () => {
      const p = document.createElement("p");
      p.textContent = "A word";
      container.appendChild(p);

      const mockRange = document.createRange();
      (document as any).caretRangeFromPoint = vi.fn(() => mockRange);

      const downEvent = new MouseEvent("mousedown", { button: 2, clientX: 10, clientY: 10 });
      Object.defineProperty(downEvent, "target", { value: p });
      handler.handleMouseDown(downEvent);

      const moveEvent = new MouseEvent("mousemove", { buttons: 2, clientX: 50, clientY: 10 });
      handler.handleMouseMove(moveEvent);

      vi.spyOn(window, "getSelection").mockReturnValue({
        rangeCount: 1,
        toString: () => "A", // length 1 -> must be ignored!
        getRangeAt: () => mockRange,
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
      } as any);

      const upEvent = new MouseEvent("mouseup", { button: 2, clientX: 50, clientY: 10 });
      Object.defineProperty(upEvent, "target", { value: p });
      handler.handleMouseUp(upEvent);

      expect(onHighlightSpy).not.toHaveBeenCalled();
    });
  });
});
