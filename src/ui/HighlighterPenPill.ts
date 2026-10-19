import { setIcon } from "obsidian";
import {
  HighlightColorKey,
  HighlightAction,
  HIGHLIGHT_COLORS,
} from "../utils/textHighlighter";

export interface PenPillCallbacks {
  onColorChange: (action: HighlightAction) => void;
  onClose: () => void;
}

export class HighlighterPenPill {
  private element: HTMLElement | null = null;
  private currentAction: HighlightAction = "yellow";
  private currentColor: HighlightColorKey = "yellow";
  private callbacks: PenPillCallbacks | null = null;
  private paletteEl: HTMLElement | null = null;
  private colorBtnEl: HTMLElement | null = null;
  private colorDotEl: HTMLElement | null = null;
  private eraserBtnEl: HTMLElement | null = null;
  private iconSpanEl: HTMLElement | null = null;
  private labelSpanEl: HTMLElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  show(initialAction: HighlightAction, callbacks: PenPillCallbacks): void {
    this.hide();

    this.callbacks = callbacks;
    if (initialAction === "clear") {
      this.currentAction = "clear";
      this.currentColor = "yellow";
    } else {
      this.currentAction = initialAction;
      this.currentColor = initialAction;
    }

    const pill = document.createElement("div");
    pill.className = "polyglot-pen-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-label", "Chế độ bút dạ quang");

    pill.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    // 1. Icon
    const iconSpan = document.createElement("span");
    iconSpan.className = "pen-pill-icon";
    pill.appendChild(iconSpan);
    this.iconSpanEl = iconSpan;

    // 2. Label
    const labelSpan = document.createElement("span");
    labelSpan.className = "pen-pill-label";
    pill.appendChild(labelSpan);
    this.labelSpanEl = labelSpan;

    // 3. Current color button
    const colorBtn = document.createElement("button");
    colorBtn.className = "pen-pill-color-btn";
    colorBtn.setAttribute("title", "Chọn màu bút dạ quang");
    colorBtn.setAttribute("aria-label", "Chọn màu bút");

    const dot = document.createElement("span");
    dot.className = `pen-pill-current-dot dot-${this.currentColor}`;
    dot.style.backgroundColor = HIGHLIGHT_COLORS[this.currentColor].dotColor;
    colorBtn.appendChild(dot);
    this.colorDotEl = dot;

    const caretSpan = document.createElement("span");
    caretSpan.className = "pen-pill-caret";
    caretSpan.textContent = "▾";
    colorBtn.appendChild(caretSpan);

    this.colorBtnEl = colorBtn;

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
        this.setAction(ck);
        this.callbacks?.onColorChange(ck);
        this.closePalette();
      });

      palette.appendChild(pDot);
    });

    // 4.1. Clear dot in palette
    const pClearDot = document.createElement("button");
    pClearDot.className = "palette-dot palette-dot-clear";
    pClearDot.setAttribute("data-color", "clear");
    pClearDot.setAttribute("title", "Cục tẩy (Xóa highlight)");
    pClearDot.setAttribute("aria-label", "Xóa highlight");
    try {
      setIcon(pClearDot, "eraser");
    } catch {}
    if (!pClearDot.innerHTML || !pClearDot.innerHTML.trim()) {
      pClearDot.textContent = "✕";
    }

    pClearDot.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.setAction("clear");
      this.callbacks?.onColorChange("clear");
      this.closePalette();
    });

    palette.appendChild(pClearDot);

    colorBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePalette();
    });

    pill.appendChild(colorBtn);
    pill.appendChild(palette);

    // 5. Dedicated Eraser button on the pill
    const eraserBtn = document.createElement("button");
    eraserBtn.className = "pen-pill-eraser-btn";
    eraserBtn.setAttribute("title", "Chế độ tẩy xóa (Quét chuột để xóa highlight)");
    eraserBtn.setAttribute("aria-label", "Chế độ tẩy xóa");

    const eraserIconSpan = document.createElement("span");
    eraserIconSpan.className = "eraser-icon";
    try {
      setIcon(eraserIconSpan, "eraser");
    } catch {}
    if (!eraserIconSpan.innerHTML || !eraserIconSpan.innerHTML.trim()) {
      eraserIconSpan.textContent = "🧹";
    }
    eraserBtn.appendChild(eraserIconSpan);

    const eraserTextSpan = document.createElement("span");
    eraserTextSpan.className = "eraser-text";
    eraserTextSpan.textContent = "Tẩy";
    eraserBtn.appendChild(eraserTextSpan);

    eraserBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.setAction("clear");
      this.callbacks?.onColorChange("clear");
    });

    pill.appendChild(eraserBtn);
    this.eraserBtnEl = eraserBtn;

    // 6. Close button
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

    this.updateUi();

    // Click outside palette to close palette
    this.outsideClickHandler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (this.paletteEl && target && !colorBtn.contains(target) && !this.paletteEl.contains(target)) {
        this.closePalette();
      }
    };
    document.addEventListener("mousedown", this.outsideClickHandler);
  }

  setAction(action: HighlightAction): void {
    this.currentAction = action;
    if (action !== "clear") {
      this.currentColor = action;
    }
    this.updateUi();
  }

  getAction(): HighlightAction {
    return this.currentAction;
  }

  setColor(color: HighlightColorKey): void {
    this.currentColor = color;
    this.currentAction = color;
    this.updateUi();
  }

  getColor(): HighlightColorKey {
    return this.currentColor;
  }

  isEraser(): boolean {
    return this.currentAction === "clear";
  }

  private updateUi(): void {
    const isClear = this.currentAction === "clear";

    // Update label & icon
    if (this.labelSpanEl) {
      this.labelSpanEl.textContent = isClear ? "Bút tẩy xóa" : "Bút dạ quang";
    }

    if (this.iconSpanEl) {
      try {
        setIcon(this.iconSpanEl, isClear ? "eraser" : "highlighter");
      } catch {}
      if (!this.iconSpanEl.innerHTML || !this.iconSpanEl.innerHTML.trim()) {
        this.iconSpanEl.textContent = isClear ? "🧹" : "🖊️";
      }
    }

    // Update color dot
    if (this.colorDotEl) {
      this.colorDotEl.className = `pen-pill-current-dot dot-${this.currentColor}`;
      this.colorDotEl.style.backgroundColor = HIGHLIGHT_COLORS[this.currentColor]?.dotColor || "#facc15";
    }

    // Update active button highlights
    if (this.colorBtnEl) {
      if (!isClear) {
        this.colorBtnEl.classList.add("is-active");
      } else {
        this.colorBtnEl.classList.remove("is-active");
      }
    }

    if (this.eraserBtnEl) {
      if (isClear) {
        this.eraserBtnEl.classList.add("is-active");
      } else {
        this.eraserBtnEl.classList.remove("is-active");
      }
    }
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
    this.colorBtnEl = null;
    this.colorDotEl = null;
    this.eraserBtnEl = null;
    this.iconSpanEl = null;
    this.labelSpanEl = null;
    this.callbacks = null;
  }

  isVisible(): boolean {
    return Boolean(this.element && this.element.parentElement);
  }

  getElement(): HTMLElement | null {
    return this.element;
  }
}
