import { setIcon } from "obsidian";
import { RectLike } from "../utils/domHelper";

export class FloatingTrigger {
  private element: HTMLElement | null = null;

  /**
   * Hiển thị icon nhỏ [📖] (kích thước 22x22px, bo tròn, bóng đổ nhẹ)
   * tại góc trên bên phải của vùng chọn (hoặc sát cạnh vùng chọn).
   * Khi người dùng click vào icon -> gọi onClick callback.
   */
  show(rect: RectLike, onClick: (e: MouseEvent) => void): void {
    this.hide();

    const trigger = document.createElement("button");
    trigger.className = "english-study-trigger";
    trigger.setAttribute("aria-label", "Tra từ (English Study)");
    trigger.setAttribute("title", "Tra từ (English Study)");
    trigger.setAttribute("tabindex", "0");

    try {
      setIcon(trigger, "book-open");
    } catch {
      // In mock environment or if setIcon fails
    }

    if (!trigger.innerHTML.trim()) {
      trigger.textContent = "📖";
    }

    const triggerSize = 24;
    const margin = 4;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;

    // Position at top-right of the selection
    let top = rect.top - triggerSize - margin;
    if (top < 8) {
      // If overflowing top edge, place slightly below bottom of selection
      top = rect.bottom + margin;
    }

    let left = rect.right + margin;
    // If overflowing right edge of viewport, place inside right border of selection
    if (left + triggerSize + 8 > vw) {
      left = Math.max(8, rect.right - triggerSize);
    }
    if (left < 8) {
      left = 8;
    }

    trigger.style.position = "fixed";
    trigger.style.top = `${top}px`;
    trigger.style.left = `${left}px`;

    // Prevent mousedown from clearing text selection in Obsidian editor
    trigger.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    trigger.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    });

    document.body.appendChild(trigger);
    this.element = trigger;
  }

  hide(): void {
    if (this.element) {
      if (this.element.parentElement) {
        this.element.parentElement.removeChild(this.element);
      }
      this.element = null;
    }
  }

  isVisible(): boolean {
    return (
      this.element !== null &&
      typeof document !== "undefined" &&
      document.body.contains(this.element)
    );
  }

  getElement(): HTMLElement | null {
    return this.element;
  }
}
