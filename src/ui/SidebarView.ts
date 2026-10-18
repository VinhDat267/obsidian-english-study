import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { LookupResult } from "../types";
import { LRUCache } from "../utils/lruCache";
import { getLanguageMeta } from "../utils/languageHelper";
import { renderMarkdownToElement } from "../utils/markdownHelper";

export const VIEW_TYPE_ENGLISH_STUDY = "english-study-sidebar";

export class EnglishStudySidebar extends ItemView {
  private currentResult: LookupResult | null = null;
  private cache: LRUCache<LookupResult> | null = null;
  private activeTab: "deep-dive" | "history" = "deep-dive";
  private onSaveCallback?: (result: LookupResult) => Promise<void> | void;
  private isPlayingAudio: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ENGLISH_STUDY;
  }

  getDisplayText(): string {
    return "Polyglot Study";
  }

  getIcon(): string {
    return "book-open";
  }

  setResult(result: LookupResult): void {
    this.currentResult = result;
    this.activeTab = "deep-dive";
    this.render();
  }

  setCache(cache: LRUCache<LookupResult>): void {
    this.cache = cache;
    this.render();
  }

  setSaveCallback(cb: (result: LookupResult) => Promise<void> | void): void {
    this.onSaveCallback = cb;
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.stopAudio();
  }

  /**
   * Render giao diện Sidebar:
   * - Top nav tabs: [Chi tiết sâu] | [Lịch sử phiên học (N)] + Nút [Xóa lịch sử]
   * - Tab Chi tiết sâu:
   *   + Nếu chưa có từ nào: Empty state thân thiện.
   *   + Nếu có từ: Hiển thị Query, Phiên âm, Audio button, Nghĩa tiếng Việt,
   *     danh sách định nghĩa Anh-Anh, AI Grammar Note, câu ngữ cảnh, nút "💾 Lưu vào sổ từ vựng".
   * - Tab Lịch sử phiên học:
   *   + Render danh sách các từ đã tra lấy từ cache.values().
   *   + Click vào item bất kỳ -> chuyển sang Tab Chi tiết sâu hiển thị từ đó.
   *   + Nút "Xóa lịch sử" xóa sạch cache và cập nhật lại view.
   */
  render(): void {
    const container = this.contentEl;
    if (!container) return;
    container.empty();

    const root = container.createDiv({ cls: "english-study-sidebar-view" });

    // 1. Top nav tabs & actions
    const nav = root.createDiv({ cls: "sidebar-nav" });

    const tabsGroup = nav.createDiv({ cls: "sidebar-tabs" });

    const deepDiveBtn = tabsGroup.createEl("button", {
      cls: `sidebar-tab-btn tab-btn-deep-dive ${this.activeTab === "deep-dive" ? "active" : ""}`,
      text: "Chi tiết sâu",
    });
    deepDiveBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      this.activeTab = "deep-dive";
      this.render();
    });

    const historyCount = this.cache ? this.cache.size : 0;
    const historyBtn = tabsGroup.createEl("button", {
      cls: `sidebar-tab-btn tab-btn-history ${this.activeTab === "history" ? "active" : ""}`,
      text: `Lịch sử phiên học (${historyCount})`,
    });
    historyBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      this.activeTab = "history";
      this.render();
    });

    const clearBtn = nav.createEl("button", {
      cls: "sidebar-btn-clear btn-clear-history",
      text: "Xóa lịch sử",
    });
    clearBtn.setAttribute("title", "Xóa lịch sử tra cứu");
    clearBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      if (this.cache) {
        this.cache.clear();
      }
      this.render();
    });

    // 2. Main content body
    const body = root.createDiv({ cls: "sidebar-content" });

    if (this.activeTab === "deep-dive") {
      this.renderDeepDiveTab(body);
    } else {
      this.renderHistoryTab(body);
    }
  }

  private renderDeepDiveTab(parent: HTMLElement): void {
    const deepDiveContainer = parent.createDiv({ cls: "deep-dive-container" });

    if (!this.currentResult) {
      const emptyState = deepDiveContainer.createDiv({
        cls: "empty-state sidebar-empty-state",
      });
      const iconEl = emptyState.createDiv({ cls: "empty-state-icon" });
      try {
        setIcon(iconEl, "book-open");
      } catch {}
      if (!iconEl.innerHTML.trim()) {
        iconEl.setText("📖");
      }
      emptyState.createEl("p", {
        text: "Chưa có dữ liệu tra cứu. Hãy bôi đen text trong ghi chú để tra từ hoặc dịch câu.",
      });
      return;
    }

    const result = this.currentResult;

    // Header (Query + Phonetic + Audio)
    const header = deepDiveContainer.createDiv({ cls: "sidebar-detail-header" });
    const titleGroup = header.createDiv({ cls: "sidebar-title-group" });

    const langMeta = getLanguageMeta(result.sourceLang || "en");
    const langBadge = titleGroup.createEl("span", {
      cls: "vocab-lang-badge",
      text: langMeta.badge,
    });
    langBadge.setAttribute("title", langMeta.nameVi);

    titleGroup.createEl("span", {
      cls: "vocab-query",
      text: result.query,
    });

    if (result.phonetic) {
      const formattedPhonetic = result.phonetic.startsWith("/")
        ? result.phonetic
        : `/${result.phonetic}/`;
      titleGroup.createEl("span", {
        cls: "vocab-phonetic",
        text: formattedPhonetic,
      });
    }

    if (result.transliteration) {
      titleGroup.createEl("span", {
        cls: "vocab-transliteration",
        text: `[${result.transliteration}]`,
      });
    }

    const audioBtn = titleGroup.createEl("button", {
      cls: "audio-btn",
      attr: { "aria-label": "Phát âm", title: "Phát âm" },
    });
    try {
      setIcon(audioBtn, "volume-2");
    } catch {
      // ignore
    }
    if (!audioBtn.innerHTML || !audioBtn.innerHTML.trim()) {
      audioBtn.setText("🔊");
    }
    audioBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAudio(result.query, result.audioUrl, audioBtn, result.sourceLang);
    });

    // Body: Vietnamese meaning
    const displayTranslation = result.aiTranslation || result.vietnameseTranslation;
    if (displayTranslation) {
      const viMeaning = deepDiveContainer.createDiv({ cls: "vocab-meaning-vi" });
      if (result.aiTranslation) {
        viMeaning.createSpan({ cls: "vocab-ai-badge-inline", text: "✨ AI" });
        viMeaning.createSpan({ cls: "vocab-translation-text", text: ` ${result.aiTranslation}` });
      } else {
        viMeaning.setText(displayTranslation);
      }
    }

    // Body: English definitions
    if (result.definitions && result.definitions.length > 0) {
      const defsList = deepDiveContainer.createDiv({ cls: "vocab-definitions" });
      result.definitions.forEach((def) => {
        const item = defsList.createDiv({ cls: "vocab-def-item" });

        if (def.partOfSpeech) {
          const pos = item.createSpan({
            cls: "vocab-pos-tag",
            text: def.partOfSpeech,
          });
          pos.setAttribute("data-pos", def.partOfSpeech.toLowerCase().trim());
        }

        item.createSpan({
          cls: "vocab-meaning-en",
          text: def.meaningEn,
        });

        if (def.example) {
          item.createDiv({
            cls: "vocab-example",
            text: `"${def.example}"`,
          });
        }
      });
    }

    // AI Grammar Note
    if (result.aiGrammarNote) {
      const aiNote = deepDiveContainer.createDiv({ cls: "vocab-ai-note" });
      const aiBadge = aiNote.createDiv({ cls: "vocab-ai-badge" });

      const aiIcon = aiBadge.createSpan({ cls: "vocab-ai-icon" });
      try {
        setIcon(aiIcon, "sparkles");
      } catch {
        // fallback
      }
      if (!aiIcon.innerHTML.trim()) {
        aiIcon.setText("✨");
      }

      aiBadge.createSpan({
        cls: "vocab-ai-title",
        text: "Phân tích ngữ pháp AI",
      });

      const aiContent = aiNote.createDiv({
        cls: "vocab-ai-content",
      });
      renderMarkdownToElement(result.aiGrammarNote, aiContent);
    }

    // Context sentence
    const contextText = result.contextSentence || result.contextSentenceClean;
    if (contextText) {
      const contextBox = deepDiveContainer.createDiv({ cls: "vocab-context-box" });
      contextBox.createSpan({
        cls: "vocab-context-label",
        text: "Ngữ cảnh: ",
      });
      contextBox.createSpan({
        cls: "vocab-context-text",
        text: `"${contextText}"`,
      });
    }

    // Footer actions (Save & Copy)
    const actions = deepDiveContainer.createDiv({ cls: "vocab-actions" });

    const saveBtn = actions.createEl("button", {
      cls: "vocab-btn-save",
      attr: { type: "button" },
    });

    const saveIcon = saveBtn.createSpan({ cls: "btn-icon" });
    try {
      setIcon(saveIcon, "bookmark");
    } catch {
      // fallback
    }
    if (!saveIcon.innerHTML.trim()) {
      saveIcon.setText("💾");
    }

    const saveText = saveBtn.createSpan({
      cls: "btn-text",
      text: "Lưu vào sổ từ vựng",
    });

    saveBtn.addEventListener("click", async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.onSaveCallback) return;

      saveBtn.setAttribute("disabled", "true");
      (saveBtn as any).disabled = true;
      saveText.setText("Đang lưu...");

      try {
        await this.onSaveCallback(result);
        saveText.setText("Đã lưu ✓");
        saveBtn.addClass("saved");
        try {
          setIcon(saveIcon, "check");
        } catch {}
      } catch (err) {
        saveText.setText("Lỗi khi lưu ✕");
        saveBtn.removeAttribute("disabled");
        (saveBtn as any).disabled = false;
        setTimeout(() => {
          saveText.setText("Lưu vào sổ từ vựng");
        }, 2000);
      }
    });

    const copyBtn = actions.createEl("button", {
      cls: "vocab-btn-copy",
      attr: { type: "button" },
    });

    const copyIcon = copyBtn.createSpan({ cls: "btn-icon" });
    try {
      setIcon(copyIcon, "copy");
    } catch {
      // fallback
    }
    if (!copyIcon.innerHTML.trim()) {
      copyIcon.setText("📋");
    }

    const copyText = copyBtn.createSpan({
      cls: "btn-text",
      text: "Sao chép",
    });

    copyBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const textToCopy = `${result.query}${
        result.phonetic ? ` [${result.phonetic}]` : ""
      }\n- Nghĩa: ${result.vietnameseTranslation}${
        contextText ? `\n- Ngữ cảnh: "${contextText}"` : ""
      }`;

      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy);
      }
      copyText.setText("Đã copy ✓");
      try {
        setIcon(copyIcon, "check");
      } catch {}
      setTimeout(() => {
        copyText.setText("Sao chép");
        try {
          setIcon(copyIcon, "copy");
        } catch {}
      }, 2000);
    });
  }

  private renderHistoryTab(parent: HTMLElement): void {
    const historyContainer = parent.createDiv({ cls: "history-container" });
    const items = this.cache ? this.cache.values() : [];

    if (items.length === 0) {
      const emptyHist = historyContainer.createDiv({
        cls: "empty-state sidebar-empty-state",
      });
      emptyHist.createEl("p", {
        text: "Lịch sử tra cứu trống.",
      });
      return;
    }

    const historyList = historyContainer.createDiv({ cls: "history-list" });

    // Reverse to display newest items first
    const reversed = [...items].reverse();

    reversed.forEach((item) => {
      const itemEl = historyList.createDiv({ cls: "history-item" });

      const headerRow = itemEl.createDiv({ cls: "history-item-header" });
      headerRow.createSpan({
        cls: "history-query",
        text: item.query,
      });

      if (item.phonetic) {
        headerRow.createSpan({
          cls: "history-phonetic",
          text: item.phonetic,
        });
      }

      if (item.timestamp) {
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        headerRow.createSpan({
          cls: "history-time",
          text: timeStr,
        });
      }

      if (item.vietnameseTranslation) {
        itemEl.createDiv({
          cls: "history-meaning",
          text: item.vietnameseTranslation,
        });
      }

      itemEl.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        this.currentResult = item;
        this.activeTab = "deep-dive";
        this.render();
      });
    });
  }

  private toggleAudio(
    query: string,
    audioUrl?: string,
    audioBtn?: HTMLElement,
    sourceLang?: string
  ): void {
    if (this.isPlayingAudio) {
      this.stopAudio(audioBtn);
      return;
    }

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        this.setPlayingState(true, audioBtn);

        audio.onended = () => {
          this.setPlayingState(false, audioBtn);
          this.currentAudio = null;
        };

        audio.onerror = () => {
          this.currentAudio = null;
          this.playSpeechSynthesis(query, audioBtn, sourceLang);
        };

        audio.play().catch(() => {
          this.currentAudio = null;
          this.playSpeechSynthesis(query, audioBtn, sourceLang);
        });
      } catch {
        this.playSpeechSynthesis(query, audioBtn, sourceLang);
      }
    } else {
      this.playSpeechSynthesis(query, audioBtn, sourceLang);
    }
  }

  private playSpeechSynthesis(
    text: string,
    audioBtn?: HTMLElement,
    sourceLang?: string
  ): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const langMeta = getLanguageMeta(sourceLang || "en");
        utterance.lang = langMeta.speechLocale;

        if (typeof window.speechSynthesis.getVoices === "function") {
          const voices = window.speechSynthesis.getVoices();
          const matchedVoice = voices.find(
            (v) => v.lang === langMeta.speechLocale || v.lang.startsWith(langMeta.code)
          );
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        this.setPlayingState(true, audioBtn);

        utterance.onend = () => {
          this.setPlayingState(false, audioBtn);
        };

        utterance.onerror = () => {
          this.setPlayingState(false, audioBtn);
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        this.setPlayingState(false, audioBtn);
      }
    } else {
      this.setPlayingState(false, audioBtn);
    }
  }

  private stopAudio(audioBtn?: HTMLElement): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    this.setPlayingState(false, audioBtn);
  }

  private setPlayingState(playing: boolean, audioBtn?: HTMLElement): void {
    this.isPlayingAudio = playing;
    const btn =
      audioBtn || this.contentEl?.querySelector?.<HTMLElement>(".audio-btn");
    if (btn) {
      if (playing) {
        btn.addClass ? btn.addClass("audio-playing") : btn.classList.add("audio-playing");
      } else {
        btn.removeClass
          ? btn.removeClass("audio-playing")
          : btn.classList.remove("audio-playing");
      }
    }
  }
}
