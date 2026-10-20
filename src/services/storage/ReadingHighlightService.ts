import { ReadingHighlightItem } from "../../types";
import { HIGHLIGHT_COLORS, HighlightColorKey } from "../../utils/textHighlighter";

// NUL cannot occur in a Vault path. Keep ownership-ambiguous legacy data
// persisted, but never expose it to a note or reassign it on a later startup.
const LEGACY_RECOVERY_PREFIX = "\0polyglot-legacy:";
const PATH_FORMAT_KEY = "\0polyglot-path-format:2";

function isHighlightItem(value: unknown): value is ReadingHighlightItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ReadingHighlightItem>;
  return typeof item.id === "string" && item.id.length > 0 &&
    typeof item.text === "string" && item.text.trim().length >= 2 &&
    typeof item.color === "string" && Object.prototype.hasOwnProperty.call(HIGHLIGHT_COLORS, item.color) &&
    typeof item.timestamp === "number" && Number.isFinite(item.timestamp);
}

export class ReadingHighlightService {
  private highlights: Record<string, ReadingHighlightItem[]>;
  private onSaveCallback?: () => Promise<void> | void;
  private hasCanonicalPaths = true;

  constructor(
    initialData: unknown = {},
    onSave?: () => Promise<void> | void
  ) {
    this.highlights = Object.create(null);
    this.setAllHighlights(initialData);
    this.onSaveCallback = onSave;
  }

  normalizePath(filePath: string): string {
    if (!filePath) return "";
    return filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  getHighlights(filePath: string): ReadingHighlightItem[] {
    const norm = this.normalizePath(filePath);
    if (norm.startsWith(LEGACY_RECOVERY_PREFIX)) return [];
    return this.highlights[norm] ? [...this.highlights[norm]] : [];
  }

  addHighlight(
    filePath: string,
    text: string,
    color: HighlightColorKey
  ): { action: "added" | "updated" | "removed"; item?: ReadingHighlightItem; oldColor?: HighlightColorKey } {
    const norm = this.normalizePath(filePath);
    const trimmedText = text.trim();
    if (!norm || norm.includes("\0") || !trimmedText || trimmedText.length < 2) return { action: "removed" };

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
        const oldColor = existing.color;
        existing.color = color;
        existing.timestamp = Date.now();
        this.triggerSave();
        return { action: "updated", item: existing, oldColor };
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

  restoreHighlights(filePath: string, items: ReadingHighlightItem[]): void {
    const norm = this.normalizePath(filePath);
    if (!norm || norm.includes("\0") || !Array.isArray(items) || items.length === 0) return;
    if (!this.highlights[norm]) {
      this.highlights[norm] = [];
    }
    const list = this.highlights[norm];
    for (const item of items) {
      const existingIdx = list.findIndex(h => h.id === item.id || h.text.toLowerCase() === item.text.toLowerCase());
      if (existingIdx !== -1) {
        list[existingIdx] = { ...item };
      } else {
        list.push({ ...item });
      }
    }
    this.triggerSave();
  }

  removeHighlight(filePath: string, textOrId: string): boolean {
    return this.removeHighlights(filePath, textOrId).length > 0;
  }

  removeHighlights(filePath: string, textOrId: string): ReadingHighlightItem[] {
    const norm = this.normalizePath(filePath);
    if (norm.includes("\0")) return [];
    const list = this.highlights[norm];
    if (!list || list.length === 0) return [];

    const trimmed = textOrId.trim();
    const lowerTrimmed = trimmed.toLowerCase();

    const exactId = list.some(h => h.id === textOrId);
    const removed = list.filter(h => {
      if (exactId) return h.id === textOrId;
      if (lowerTrimmed.length < 2) return false;
      const hText = h.text.trim().toLowerCase();
      return hText.includes(lowerTrimmed) || lowerTrimmed.includes(hText);
    });
    if (removed.length === 0) return [];
    const removedItems = new Set(removed);
    this.highlights[norm] = list.filter(h => !removedItems.has(h));
    if (this.highlights[norm].length === 0) delete this.highlights[norm];
    this.triggerSave();
    return removed;
  }

  clearHighlightsForFile(filePath: string): void {
    const norm = this.normalizePath(filePath);
    if (norm.includes("\0")) return;
    if (this.highlights[norm]) {
      delete this.highlights[norm];
      this.triggerSave();
    }
  }

  getAllHighlights(): Record<string, ReadingHighlightItem[]> {
    return this.highlights;
  }

  setAllHighlights(data: unknown): void {
    this.highlights = Object.create(null);
    this.hasCanonicalPaths = true;
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    const format = Object.prototype.hasOwnProperty.call(data, PATH_FORMAT_KEY)
      ? (data as Record<string, unknown>)[PATH_FORMAT_KEY] : undefined;
    this.hasCanonicalPaths = (Array.isArray(format) && format.length === 0) || Object.keys(data).length === 0;
    if (this.hasCanonicalPaths) this.highlights[PATH_FORMAT_KEY] = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === PATH_FORMAT_KEY) continue;
      if (!Array.isArray(val)) continue;
      const path = this.normalizePath(key);
      if (!path || (path.includes("\0") && !path.startsWith(LEGACY_RECOVERY_PREFIX))) continue;
      const valid = val.filter(isHighlightItem).map(item => ({ ...item }));
      if (valid.length > 0) {
        this.highlights[path] = [...(this.highlights[path] || []), ...valid];
      }
    }
  }

  renamePath(oldPath: string, newPath: string): void {
    const oldKey = this.normalizePath(oldPath);
    const newKey = this.normalizePath(newPath);
    if (!oldKey || !newKey || oldKey === newKey || oldKey.includes("\0") || newKey.includes("\0")) return;
    const moved = Object.entries(this.highlights).filter(([key]) =>
      !key.includes("\0") && (key === oldKey || key.startsWith(`${oldKey}/`))
    );
    for (const [key] of moved) delete this.highlights[key];
    for (const [key, items] of moved) {
      const destination = newKey + key.slice(oldKey.length);
      this.highlights[destination] = [...(this.highlights[destination] || []), ...items];
    }
    if (moved.length > 0) this.triggerSave();
  }

  removePath(path: string): void {
    const norm = this.normalizePath(path);
    if (!norm || norm.includes("\0")) return;
    let changed = false;
    for (const key of Object.keys(this.highlights)) {
      if (!key.includes("\0") && (key === norm || key.startsWith(`${norm}/`))) {
        delete this.highlights[key];
        changed = true;
      }
    }
    if (changed) this.triggerSave();
  }

  migrateLegacyPaths(knownPaths: readonly string[]): void {
    if (this.hasCanonicalPaths) return;
    const known = new Set(knownPaths.map(path => this.normalizePath(path)).filter(Boolean));
    const legacyOwners = new Map<string, Set<string>>();
    for (const path of known) {
      // Decode only to recognize keys written by the old, lossy storage format.
      // Raw Vault identities never use this conversion.
      let legacy = path;
      try { legacy = decodeURIComponent(legacy); } catch {}
      legacy = legacy.toLowerCase().replace(/\.md$/, "");
      const owners = legacyOwners.get(legacy) || new Set<string>();
      owners.add(path);
      legacyOwners.set(legacy, owners);
    }
    const migrated: Record<string, ReadingHighlightItem[]> = Object.create(null);
    for (const [key, items] of Object.entries(this.highlights)) {
      const owners = new Set(legacyOwners.get(key));
      if (known.has(key)) owners.add(key);
      const destination = key.startsWith(LEGACY_RECOVERY_PREFIX) ? key
        : owners.size === 1 ? owners.values().next().value as string
        : LEGACY_RECOVERY_PREFIX + key;
      migrated[destination] = [...(migrated[destination] || []), ...items];
    }
    migrated[PATH_FORMAT_KEY] = [];
    this.highlights = migrated;
    this.hasCanonicalPaths = true;
    this.triggerSave();
  }

  private triggerSave(): void {
    if (this.onSaveCallback) {
      try {
        this.onSaveCallback();
      } catch {}
    }
  }
}
