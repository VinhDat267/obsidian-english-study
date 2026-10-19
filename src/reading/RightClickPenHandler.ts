import type { MarkdownView } from "obsidian";
import type { HighlightAction } from "../utils/textHighlighter";

export interface RightClickPenOptions {
  isPenActive: () => boolean;
  getPenAction: () => HighlightAction;
  onHighlight: (
    action: HighlightAction,
    text: string,
    range: Range | null,
    view: MarkdownView
  ) => void;
  getActiveView: () => MarkdownView | null;
}

export function createOrderedRange(
  startCaret: Range,
  currentCaret: Range,
  doc: Document = document
): Range {
  const range = doc.createRange();
  const startContainer = startCaret.startContainer;
  const startOffset = startCaret.startOffset;
  const endContainer = currentCaret.startContainer;
  const endOffset = currentCaret.startOffset;

  if (startContainer === endContainer) {
    if (startOffset <= endOffset) {
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
    } else {
      range.setStart(endContainer, endOffset);
      range.setEnd(startContainer, startOffset);
    }
  } else {
    const position = startContainer.compareDocumentPosition(endContainer);
    if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
    } else {
      range.setStart(endContainer, endOffset);
      range.setEnd(startContainer, startOffset);
    }
  }

  return range;
}

export class RightClickPenHandler {
  private isDragging = false;
  private didDragMove = false;
  private startPoint: { x: number; y: number } | null = null;
  private startRange: Range | null = null;
  private suppressContextMenu = false;

  constructor(private options: RightClickPenOptions) {}

  handleMouseDown(e: MouseEvent): void {
    if (e.button !== 2 || !this.options.isPenActive()) return;

    const view = this.options.getActiveView();
    if (!view || !view.contentEl || !view.contentEl.contains(e.target as Node)) {
      return;
    }

    this.isDragging = true;
    this.didDragMove = false;
    this.startPoint = { x: e.clientX, y: e.clientY };

    const doc = (e.target as Node)?.ownerDocument || document;
    if ((doc as any).caretRangeFromPoint) {
      try {
        this.startRange = (doc as any).caretRangeFromPoint(e.clientX, e.clientY);
      } catch {
        this.startRange = null;
      }
    }
  }

  handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging || (e.buttons & 2) === 0) return;

    if (this.startPoint) {
      const dx = Math.abs(e.clientX - this.startPoint.x);
      const dy = Math.abs(e.clientY - this.startPoint.y);
      if (dx > 4 || dy > 4) {
        this.didDragMove = true;
      }
    }

    if (this.didDragMove && this.startRange) {
      const doc = this.startRange.startContainer?.ownerDocument || document;
      if ((doc as any).caretRangeFromPoint) {
        try {
          const current = (doc as any).caretRangeFromPoint(e.clientX, e.clientY);
          if (current) {
            const range = createOrderedRange(this.startRange, current, doc);
            const sel = (doc.defaultView || window).getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        } catch {}
      }
    }
  }

  handleMouseUp(e: MouseEvent): void {
    if (e.button !== 2 || !this.isDragging) return;

    if (this.didDragMove) {
      this.suppressContextMenu = true;
      const view = this.options.getActiveView();
      const doc = (e.target as Node)?.ownerDocument || document;
      const sel = (doc.defaultView || window).getSelection();
      const text = sel ? sel.toString().trim() : "";

      if (text.length >= 2 && view) {
        let range: Range | null = null;
        if (sel && sel.rangeCount > 0) {
          try {
            range = sel.getRangeAt(0).cloneRange();
          } catch {}
        }
        const action = this.options.getPenAction();
        this.options.onHighlight(action, text, range, view);
      }

      if (sel) {
        try {
          sel.removeAllRanges();
        } catch {}
      }
    }

    this.reset();
  }

  handleContextMenu(e: MouseEvent): boolean {
    if (this.suppressContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      this.suppressContextMenu = false;
      return true;
    }
    return false;
  }

  reset(): void {
    this.isDragging = false;
    this.didDragMove = false;
    this.startPoint = null;
    this.startRange = null;
  }
}
