import { ReadingHighlightItem } from "../../types";
import { HighlightColorKey } from "../../utils/textHighlighter";

export class ReadingHighlightService {
  private highlights: Record<string, ReadingHighlightItem[]>;
  private onSaveCallback?: () => Promise<void> | void;

  constructor(
    initialData: Record<string, ReadingHighlightItem[]> = {},
    onSave?: () => Promise<void> | void
  ) {
    this.highlights = {};
    this.setAllHighlights(initialData);
    this.onSaveCallback = onSave;
  }

  normalizePath(filePath: string): string {
    if (!filePath) return "";
    let clean = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (clean.endsWith(".md")) {
      clean = clean.slice(0, -3);
    }
    return clean;
  }

  getHighlights(filePath: string): ReadingHighlightItem[] {
    const norm = this.normalizePath(filePath);
    return this.highlights[norm] ? [...this.highlights[norm]] : [];
  }

  addHighlight(
    filePath: string,
    text: string,
    color: HighlightColorKey
  ): { action: "added" | "updated" | "removed"; item?: ReadingHighlightItem } {
    const norm = this.normalizePath(filePath);
    const trimmedText = text.trim();
    if (!trimmedText) return { action: "removed" };

    if (!this.highlights[norm]) {
      this.highlights[norm] = [];
    }

    const list = this.highlights[norm];
    const existingIdx = list.findIndex(
      (h) => h.text.toLowerCase() === trimmedText.toLowerCase()
    );

    if (existingIdx !== -1) {
      const existing = list[existingIdx];
      if (existing.color === color) {
        // Toggle off: remove
        list.splice(existingIdx, 1);
        this.triggerSave();
        return { action: "removed", item: existing };
      } else {
        // Update color
        existing.color = color;
        existing.timestamp = Date.now();
        this.triggerSave();
        return { action: "updated", item: existing };
      }
    }

    const newItem: ReadingHighlightItem = {
      id: `hl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text: trimmedText,
      color,
      timestamp: Date.now(),
    };
    list.push(newItem);
    this.triggerSave();
    return { action: "added", item: newItem };
  }

  removeHighlight(filePath: string, textOrId: string): boolean {
    const norm = this.normalizePath(filePath);
    const list = this.highlights[norm];
    if (!list || list.length === 0) return false;

    const trimmed = textOrId.trim();
    const idx = list.findIndex(
      (h) => h.id === textOrId || h.text.toLowerCase() === trimmed.toLowerCase()
    );

    if (idx !== -1) {
      list.splice(idx, 1);
      this.triggerSave();
      return true;
    }
    return false;
  }

  clearHighlightsForFile(filePath: string): void {
    const norm = this.normalizePath(filePath);
    if (this.highlights[norm]) {
      delete this.highlights[norm];
      this.triggerSave();
    }
  }

  getAllHighlights(): Record<string, ReadingHighlightItem[]> {
    return this.highlights;
  }

  setAllHighlights(data: Record<string, ReadingHighlightItem[]>): void {
    this.highlights = {};
    for (const [key, val] of Object.entries(data || {})) {
      this.highlights[this.normalizePath(key)] = [...val];
    }
  }

  private triggerSave(): void {
    if (this.onSaveCallback) {
      try {
        this.onSaveCallback();
      } catch {}
    }
  }
}
