import { App, TFile, Notice } from "obsidian";
import { LookupResult, PluginSettings, VocabFormat } from "../../types";
import {
  getDefaultTemplate,
  formatTableRow,
  formatCallout,
  insertRowAtTableEnd,
  isWordInContent,
  appendContextToExisting,
} from "../../utils/vocabFormatter";

export interface SaveVocabResult {
  success: boolean;
  isDuplicate: boolean;
  filePath: string;
  error?: string;
}

export class VocabService {
  constructor(private app: App, private settings: PluginSettings) {}

  updateSettings(settings: PluginSettings): void {
    this.settings = { ...settings };
  }

  /**
   * Resolves the target storage file path based on current settings:
   * - If settings.useDailyNote = true:
   *   + Formats today's date as YYYY-MM-DD.md
   *   + Checks Daily Notes core plugin folder configuration if present
   *   + Checks if root YYYY-MM-DD.md exists
   *   + Defaults to `Daily Notes/YYYY-MM-DD.md`
   * - If settings.useDailyNote = false:
   *   + Uses settings.vocabFilePath (defaults to 'Vocabulary.md', ensuring .md extension)
   *   + If settings.separateVocabFileByLanguage = true: appends _<lang> before .md (e.g. Vocabulary_ja.md)
   */
  getResolvedFilePath(settingsOverride?: PluginSettings, sourceLang?: string): string {
    const s = settingsOverride || this.settings;

    if (s.useDailyNote) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}.md`;

      // 1. Check daily notes core plugin configuration if available
      const appAny = this.app as any;
      const dailyPlugin =
        appAny.internalPlugins?.plugins?.["daily-notes"]?.instance ||
        appAny.internalPlugins?.getPluginById?.("daily-notes")?.instance;

      if (dailyPlugin?.options?.folder) {
        const folder = dailyPlugin.options.folder.replace(/^\/+|\/+$/g, "");
        return folder ? `${folder}/${dateStr}` : dateStr;
      }

      // 2. If date file already exists at root, prefer root path
      if (this.app.vault.getAbstractFileByPath(dateStr)) {
        return dateStr;
      }

      // 3. Default to Daily Notes/YYYY-MM-DD.md
      return `Daily Notes/${dateStr}`;
    }

    let filePath = s.vocabFilePath?.trim() || "Vocabulary.md";
    filePath = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!filePath.endsWith(".md")) {
      filePath = `${filePath}.md`;
    }

    if (s.separateVocabFileByLanguage && sourceLang && sourceLang !== "auto") {
      const baseWithoutExt = filePath.slice(0, -3);
      filePath = `${baseWithoutExt}_${sourceLang}.md`;
    }

    return filePath;
  }

  /**
   * Ensures all nested parent directories exist before creating a file.
   */
  private async ensureParentDirs(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash === -1) {
      return;
    }

    const folderPath = normalized.substring(0, lastSlash);
    const segments = folderPath.split("/").filter(Boolean);

    let current = "";
    for (const seg of segments) {
      current = current ? `${current}/${seg}` : seg;
      const fileOrFolder = this.app.vault.getAbstractFileByPath(current);
      if (!fileOrFolder) {
        if (typeof (this.app.vault as any).createFolder === "function") {
          try {
            await (this.app.vault as any).createFolder(current);
          } catch (err: any) {
            if (!err?.message?.includes("Folder already exists")) {
              throw err;
            }
          }
        }
      }
    }
  }

  /**
   * Saves LookupResult into the Obsidian Vault:
   * 1. Resolves target path via getResolvedFilePath.
   * 2. Ensures target file and parent directories exist.
   * 3. Performs atomic write via vault.process with 100% synchronous callback.
   * 4. Shows appropriate Obsidian Notice.
   * 5. Returns SaveVocabResult.
   */
  async saveVocab(
    result: LookupResult,
    settingsOverride?: PluginSettings
  ): Promise<SaveVocabResult> {
    const s = settingsOverride || this.settings;
    const lang = result.sourceLang || (s.sourceLanguage !== "auto" ? s.sourceLanguage : "en");
    const targetPath = this.getResolvedFilePath(s, lang);
    const format: VocabFormat = s.vocabFormat || "table";

    try {
      let file = this.app.vault.getAbstractFileByPath(targetPath);

      if (!file) {
        await this.ensureParentDirs(targetPath);
        const initialContent = format === "table" ? getDefaultTemplate(lang) : "";
        file = await this.app.vault.create(targetPath, initialContent);
      }

      if (!(file instanceof TFile)) {
        throw new Error(`Đường dẫn '${targetPath}' không phải là file hợp lệ.`);
      }

      let isDuplicate = false;

      // Atomic write: callback must be 100% synchronous
      await this.app.vault.process(file, (content: string): string => {
        if (isWordInContent(content, result.query)) {
          isDuplicate = true;
          if (format === "table") {
            return appendContextToExisting(content, result);
          }
          return content;
        }

        isDuplicate = false;
        if (format === "table") {
          const row = formatTableRow(result, s.highlightWordInContext);
          return insertRowAtTableEnd(content, row);
        } else {
          const callout = formatCallout(result);
          const trimmed = content.trim();
          return trimmed ? `${content.trimEnd()}\n\n${callout}\n` : `${callout}\n`;
        }
      });

      if (isDuplicate) {
        new Notice(
          `Từ '${result.query}' đã có trong sổ. Đã bổ sung thêm ngữ cảnh mới!`
        );
      } else {
        new Notice(`Đã lưu '${result.query}' vào sổ từ vựng!`);
      }

      return {
        success: true,
        isDuplicate,
        filePath: targetPath,
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      new Notice(`Không thể ghi vào file từ vựng: ${errorMessage}`);
      return {
        success: false,
        isDuplicate: false,
        filePath: targetPath,
        error: errorMessage,
      };
    }
  }
}
