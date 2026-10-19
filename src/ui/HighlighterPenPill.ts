import { setIcon } from "obsidian";
import {
  HighlightColorKey,
  HIGHLIGHT_COLORS,
} from "../utils/textHighlighter";

export interface PenPillCallbacks {
  onColorChange: (color: HighlightColorKey) => void;
  onClose: () => void;
}

export class HighlighterPenPill {
  private element: HTMLElement | null = null;
  private activeColor: HighlightColorKey = "yellow";
  private callbacks: PenPillCallbacks | null = null;
  private paletteEl: HTMLElement | null = null;
  private colorDotEl: HTMLElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  show(activeColor: HighlightColorKey, callbacks: PenPillCallbacks): void {
    this.hide();

    this.activeColor = activeColor;
    this.callbacks = callbacks;

    const pill = document.createElement("div");
    pill.className = "polyglot-pen-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-label", "Chế độ bút dạ quang");

    pill.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    // 1. Icon pen
    const iconSpan = document.createElement("span");
    iconSpan.className = "pen-pill-icon";
    try {
      setIcon(iconSpan, "highlighter");
    } catch {}
    if (!iconSpan.innerHTML || !iconSpan.innerHTML.trim()) {
      iconSpan.textContent = "🖊️";
    }
    pill.appendChild(iconSpan);

    // 2. Label
    const labelSpan = document.createElement("span");
    labelSpan.className = "pen-pill-label";
    labelSpan.textContent = "Bút dạ quang";
    pill.appendChild(labelSpan);

    // 3. Current color button
    const colorBtn = document.createElement("button");
    colorBtn.className = "pen-pill-color-btn";
    colorBtn.setAttribute("title", `Đổi màu bút (${HIGHLIGHT_COLORS[this.activeColor].label})`);
    colorBtn.setAttribute("aria-label", "Đổi màu bút");

    const dot = document.createElement("span");
    dot.className = `pen-pill-current-dot dot-${this.activeColor}`;
    dot.style.backgroundColor = HIGHLIGHT_COLORS[this.activeColor].dotColor;
    colorBtn.appendChild(dot);
    this.colorDotEl = dot;

    const caretSpan = document.createElement("span");
    caretSpan.className = "pen-pill-caret";
    caretSpan.textContent = "▾";
    colorBtn.appendChild(caretSpan);

    // 4. Color Palette popup
    const palette = document.createElement("div");
    palette.className = "pen-pill-palette";
    this.paletteEl = palette;

    const colorKeys: HighlightColorKey[] = [
      "yellow",
      "green",
      "blue",
      "pink",
      "purple",
      "orange",
    ];

    colorKeys.forEach((ck) => {
      const pDot = document.createElement("button");
      pDot.className = `palette-dot palette-dot-${ck}`;
      pDot.setAttribute("data-color", ck);
      pDot.setAttribute("title", HIGHLIGHT_COLORS[ck].label);
      pDot.setAttribute("aria-label", HIGHLIGHT_COLORS[ck].label);
      pDot.style.backgroundColor = HIGHLIGHT_COLORS[ck].dotColor;

      pDot.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.setColor(ck);
        this.callbacks?.onColorChange(ck);
        this.closePalette();
      });

      palette.appendChild(pDot);
    });

    colorBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePalette();
    });

    pill.appendChild(colorBtn);
    pill.appendChild(palette);

    // 5. Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "pen-pill-close-btn";
    closeBtn.setAttribute("title", "Tắt chế độ bút (Esc)");
    closeBtn.setAttribute("aria-label", "Tắt chế độ bút");
    closeBtn.textContent = "✕";

    closeBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.callbacks;
      this.hide();
      cb?.onClose();
    });

    pill.appendChild(closeBtn);

    document.body.appendChild(pill);
    this.element = pill;

    // Click outside palette to close palette
    this.outsideClickHandler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (this.paletteEl && target && !colorBtn.contains(target) && !this.paletteEl.contains(target)) {
        this.closePalette();
      }
    };
    document.addEventListener("mousedown", this.outsideClickHandler);
  }

  setColor(color: HighlightColorKey): void {
    this.activeColor = color;
    if (this.colorDotEl) {
      this.colorDotEl.className = `pen-pill-current-dot dot-${color}`;
      this.colorDotEl.style.backgroundColor = HIGHLIGHT_COLORS[color].dotColor;
    }
  }

  getColor(): HighlightColorKey {
    return this.activeColor;
  }

  togglePalette(): void {
    if (!this.paletteEl) return;
    this.paletteEl.classList.toggle("is-open");
  }

  closePalette(): void {
    if (this.paletteEl) {
      this.paletteEl.classList.remove("is-open");
    }
  }

  hide(): void {
    if (this.outsideClickHandler) {
      document.removeEventListener("mousedown", this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.paletteEl = null;
    this.colorDotEl = null;
    this.callbacks = null;
  }

  isVisible(): boolean {
    return Boolean(this.element && this.element.parentElement);
  }

  getElement(): HTMLElement | null {
    return this.element;
  }
}
