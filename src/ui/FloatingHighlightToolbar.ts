import { calculatePosition, RectLike, safeSetIcon } from "../utils/domHelper";
import {
  HighlightColorKey,
  HIGHLIGHT_COLORS,
} from "../utils/textHighlighter";

export interface HighlightToolbarCallbacks {
  onHighlight: (color: HighlightColorKey) => void;
  onClear: () => void;
  onLookup: () => void;
  onClose?: () => void;
}

export class FloatingHighlightToolbar {
  private element: HTMLElement | null = null;
  private currentText: string = "";
  private currentRange: Range | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  show(
    rect: RectLike,
    selectedText: string,
    range: Range | null,
    callbacks: HighlightToolbarCallbacks
  ): void {
    this.hide();

    this.currentText = selectedText;
    this.currentRange = range;

    const toolbar = document.createElement("div");
    toolbar.className = "polyglot-highlight-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Thanh công cụ highlight nhanh");

    toolbar.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    // 1. Color dots container
    const dotsContainer = document.createElement("div");
    dotsContainer.className = "toolbar-dots-container";

    const colorKeys: HighlightColorKey[] = [
      "yellow",
      "green",
      "blue",
      "pink",
      "purple",
      "orange",
    ];

    colorKeys.forEach((ck) => {
      const dot = document.createElement("button");
      dot.className = `toolbar-color-dot dot-${ck}`;
      dot.setAttribute("data-color", ck);
      dot.setAttribute("title", HIGHLIGHT_COLORS[ck].label);
      dot.setAttribute("aria-label", HIGHLIGHT_COLORS[ck].label);
      dot.style.backgroundColor = HIGHLIGHT_COLORS[ck].dotColor;

      dot.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      });

      dot.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        callbacks.onHighlight(ck);
      });

      dotsContainer.appendChild(dot);
    });

    // 2. Clear dot
    const clearDot = document.createElement("button");
    clearDot.className = "toolbar-color-dot dot-clear";
    clearDot.setAttribute("data-color", "clear");
    clearDot.setAttribute("title", "Xóa highlight");
    safeSetIcon(clearDot, "eraser", "Xóa highlight");

    clearDot.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    clearDot.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onClear();
    });

    dotsContainer.appendChild(clearDot);
    toolbar.appendChild(dotsContainer);

    // 3. Separator
    const sep = document.createElement("div");
    sep.className = "toolbar-separator";
    toolbar.appendChild(sep);

    // 4. Lookup button
    const lookupBtn = document.createElement("button");
    lookupBtn.className = "toolbar-btn-lookup";
    lookupBtn.setAttribute("title", "Tra từ điển / Dịch AI");
    lookupBtn.setAttribute("aria-label", "Tra từ điển / Dịch AI");

    const iconSpan = document.createElement("span");
    iconSpan.className = "toolbar-lookup-icon";
    safeSetIcon(iconSpan, "search");
    lookupBtn.appendChild(iconSpan);

    const textSpan = document.createElement("span");
    textSpan.className = "toolbar-lookup-text";
    textSpan.textContent = "Dịch";
    lookupBtn.appendChild(textSpan);

    lookupBtn.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    lookupBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onLookup();
    });

    toolbar.appendChild(lookupBtn);

    // Calculate position (toolbar width ~280px, height ~38px)
    const { top, left } = calculatePosition(
      rect,
      280,
      38,
      (typeof window !== "undefined" && window.innerWidth) || 1024,
      (typeof window !== "undefined" && window.innerHeight) || 768
    );
    toolbar.style.position = "fixed";
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.style.zIndex = "1000";

    document.body.appendChild(toolbar);
    this.element = toolbar;

    // Dismiss on outside click (after 50ms)
    setTimeout(() => {
      this.outsideClickHandler = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (this.element && target && !this.element.contains(target)) {
          this.hide();
          callbacks.onClose?.();
        }
      };
      document.addEventListener("mousedown", this.outsideClickHandler);

      this.keydownHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          this.hide();
          callbacks.onClose?.();
        }
      };
      document.addEventListener("keydown", this.keydownHandler);
    }, 50);
  }

  hide(): void {
    if (this.outsideClickHandler) {
      document.removeEventListener("mousedown", this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.currentText = "";
    this.currentRange = null;
  }

  isVisible(): boolean {
    return Boolean(this.element && this.element.parentElement);
  }

  getElement(): HTMLElement | null {
    return this.element;
  }

  getCurrentText(): string {
    return this.currentText;
  }

  getCurrentRange(): Range | null {
    return this.currentRange;
  }
}
