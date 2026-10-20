import { ItemView, WorkspaceLeaf } from "obsidian";
import { LookupResult, TutorSession } from "../types";
import { LRUCache } from "../utils/lruCache";
import { getLanguageMeta } from "../utils/languageHelper";
import { renderMarkdownToElement } from "../utils/markdownHelper";
import { safeSetIcon } from "../utils/domHelper";
import { AiTutorChatService } from "../services/ai/AiTutorChatService";
import { GeminiService } from "../services/provider/GeminiService";

export const VIEW_TYPE_ENGLISH_STUDY = "english-study-sidebar";

export class EnglishStudySidebar extends ItemView {
  private currentResult: LookupResult | null = null;
  private cache: LRUCache<LookupResult> | null = null;
  private activeTab: "deep-dive" | "history" | "ai-tutor" = "deep-dive";
  private onSaveCallback?: (result: LookupResult) => Promise<void> | void;
  private isPlayingAudio: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;

  private activeTutorSession: TutorSession | null = null;
  private tutorChatService: AiTutorChatService | null = null;
  private geminiService: GeminiService | null = null;
  private geminiApiKey: string = "";
  private isTutorLoading: boolean = false;
  private tutorRequestGeneration = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  setTutorDependencies(
    chatService: AiTutorChatService,
    geminiService: GeminiService,
    apiKey: string
  ): void {
    this.tutorChatService = chatService;
    this.geminiService = geminiService;
    this.geminiApiKey = apiKey;
    if (this.currentResult?.query) {
      this.setActiveTutorSession(chatService.getOrCreateSession({
        query: this.currentResult.query,
        contextSentence:
          this.currentResult.contextSentence ||
          this.currentResult.contextSentenceClean ||
          "",
        docContext: this.currentResult.docContext,
        sourceLang: this.currentResult.sourceLang,
        targetLang: this.currentResult.targetLang,
      }));
    }
  }

  openTutorSession(session: TutorSession): void {
    this.setActiveTutorSession(session);
    this.activeTab = "ai-tutor";
    this.render();
  }

  getActiveTutorSession(): TutorSession | null {
    return this.activeTutorSession;
  }

  setActiveTutorSession(session: TutorSession): void {
    if (this.activeTutorSession !== session) {
      this.tutorRequestGeneration++;
      this.isTutorLoading = false;
    }
    this.activeTutorSession = session;
  }

  followPendingTutorTurn(session: TutorSession, turn: Promise<void>): void {
    if (this.activeTutorSession !== session) return;
    const generation = ++this.tutorRequestGeneration;
    this.isTutorLoading = true;
    this.render();
    const finish = () => {
      if (generation !== this.tutorRequestGeneration || this.activeTutorSession !== session) return;
      this.isTutorLoading = false;
      this.render();
    };
    void turn.then(finish, finish);
  }

  getCurrentResult(): LookupResult | null {
    return this.currentResult;
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
    if (this.tutorChatService) {
      this.setActiveTutorSession(this.tutorChatService.getOrCreateSession({
        query: result.query,
        contextSentence:
          result.contextSentence || result.contextSentenceClean || "",
        docContext: result.docContext,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
      }));
    }
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
    this.tutorRequestGeneration++;
    this.isTutorLoading = false;
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

    const tutorBtn = tabsGroup.createEl("button", {
      cls: `sidebar-tab-btn tab-btn-ai-tutor ${this.activeTab === "ai-tutor" ? "active" : ""}`,
      text: "Gia sư AI",
    });
    tutorBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      this.activeTab = "ai-tutor";
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
    } else if (this.activeTab === "history") {
      this.renderHistoryTab(body);
    } else if (this.activeTab === "ai-tutor") {
      this.renderAiTutorTab(body);
    }
  }

  private renderDeepDiveTab(parent: HTMLElement): void {
    const deepDiveContainer = parent.createDiv({ cls: "deep-dive-container" });

    if (!this.currentResult) {
      const emptyState = deepDiveContainer.createDiv({
        cls: "empty-state sidebar-empty-state",
      });
      const iconEl = emptyState.createDiv({ cls: "empty-state-icon" });
      safeSetIcon(iconEl, "book-open");
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
    safeSetIcon(audioBtn, "volume-2", "Phát âm");
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
        const badge = viMeaning.createSpan({ cls: "vocab-ai-badge-inline" });
        safeSetIcon(badge, "sparkles");
        badge.createSpan({ text: " AI" });
        viMeaning.createSpan({ cls: "vocab-translation-text", text: ` ${result.aiTranslation}` });
      } else if (result.aiLoading) {
        const loadingChip = viMeaning.createSpan({ cls: "vocab-ai-badge-inline vocab-ai-loading-chip" });
        const spinner = loadingChip.createSpan({ cls: "vocab-ai-spinner" });
        safeSetIcon(spinner, "sparkles");
        loadingChip.createSpan({ text: " AI..." });
        viMeaning.createSpan({ cls: "vocab-translation-text", text: ` ${displayTranslation}` });
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
      safeSetIcon(aiIcon, "sparkles");

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
    safeSetIcon(saveIcon, "bookmark");

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
        saveText.setText("Đã lưu");
        saveBtn.addClass("saved");
        safeSetIcon(saveIcon, "check");
      } catch (err) {
        saveText.setText("Lỗi khi lưu");
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
    safeSetIcon(copyIcon, "copy");

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
      copyText.setText("Đã sao chép");
      safeSetIcon(copyIcon, "check");
      setTimeout(() => {
        copyText.setText("Sao chép");
        safeSetIcon(copyIcon, "copy");
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

  private renderAiTutorTab(parent: HTMLElement): void {
    const tutorContainer = parent.createDiv({
      cls: "sidebar-tutor-container sidebar-ai-tutor-container",
    });

    if (!this.activeTutorSession && this.tutorChatService) {
      if (this.currentResult?.query) {
        this.activeTutorSession = this.tutorChatService.getOrCreateSession({
          query: this.currentResult.query,
          contextSentence:
            this.currentResult.contextSentence ||
            this.currentResult.contextSentenceClean ||
            "",
          docContext: this.currentResult.docContext,
          sourceLang: this.currentResult.sourceLang,
          targetLang: this.currentResult.targetLang,
        });
      } else {
        const latest = this.tutorChatService.getLatestSession();
        if (latest && latest.messages.length > 0) {
          this.activeTutorSession = latest;
        }
      }
    } else if (this.tutorChatService && this.currentResult?.query) {
      if (
        this.activeTutorSession &&
        this.activeTutorSession.query.toLowerCase() !==
          this.currentResult.query.trim().toLowerCase()
      ) {
        this.activeTutorSession = this.tutorChatService.getOrCreateSession({
          query: this.currentResult.query,
          contextSentence:
            this.currentResult.contextSentence ||
            this.currentResult.contextSentenceClean ||
            "",
          docContext: this.currentResult.docContext,
          sourceLang: this.currentResult.sourceLang,
          targetLang: this.currentResult.targetLang,
        });
      }
    }

    if (!this.activeTutorSession) {
      const emptyState = tutorContainer.createDiv({
        cls: "sidebar-tutor-empty empty-state",
      });
      const iconEl = emptyState.createDiv({
        cls: "sidebar-tutor-empty-icon empty-state-icon",
      });
      safeSetIcon(iconEl, "bot");
      emptyState.createEl("p", {
        cls: "sidebar-tutor-empty-text",
        text: "Chưa có phiên học Gia sư AI nào. Hãy chọn từ trong ghi chú hoặc nhấn 'Hỏi sâu Gia sư AI' từ cửa sổ tra từ.",
      });
      return;
    }

    const session = this.activeTutorSession;

    // Header: Query + Context Excerpt + Clear Chat
    const header = tutorContainer.createDiv({ cls: "sidebar-tutor-header" });
    const headerInfo = header.createDiv({ cls: "sidebar-tutor-header-info" });

    headerInfo.createSpan({
      cls: "sidebar-tutor-query",
      text: session.query,
    });

    if (session.contextSentence) {
      headerInfo.createSpan({
        cls: "sidebar-tutor-context",
        text: `"${session.contextSentence}"`,
      });
    }

    const clearBtn = header.createEl("button", {
      cls: "sidebar-tutor-clear-btn btn-clear-chat",
      attr: { type: "button", title: "Xóa đoạn chat", "aria-label": "Xóa đoạn chat" },
    });
    safeSetIcon(clearBtn, "trash-2", "Xóa đoạn chat");
    clearBtn.addEventListener("click", (e: MouseEvent) => {
      e?.preventDefault?.();
      this.tutorRequestGeneration++;
      this.isTutorLoading = false;
      if (this.activeTutorSession) {
        if (this.tutorChatService) {
          this.tutorChatService.clearSession(this.activeTutorSession.id);
        }
        this.activeTutorSession.messages = [];
      }
      this.render();
    });

    // Quick Chips Bar
    const chipsBar = tutorContainer.createDiv({ cls: "sidebar-tutor-chips" });
    const chips = this.tutorChatService ? this.tutorChatService.getQuickPromptChips() : [];
    for (const chip of chips) {
      const chipBtn = chipsBar.createEl("button", {
        cls: "quick-prompt-chip sidebar-tutor-chip",
        attr: { type: "button", "data-chip-id": chip.id },
      });
      if (chip.icon) {
        const iconSpan = chipBtn.createSpan({ cls: "chip-icon" });
        safeSetIcon(iconSpan, chip.icon);
      }
      chipBtn.createSpan({ cls: "chip-label", text: chip.label });

      chipBtn.addEventListener("click", () => {
        if (this.isTutorLoading) return;
        const prompt = chip.promptTemplate(
          this.activeTutorSession?.query || "",
          this.activeTutorSession?.contextSentence || ""
        );
        this.sendTutorMessage(prompt, messagesContainer, textarea, sendBtn);
      });
    }

    // Messages Container
    const messagesContainer = tutorContainer.createDiv({
      cls: "sidebar-tutor-messages",
    });
    for (const msg of session.messages) {
      if (msg.role === "user") {
        const userBubble = messagesContainer.createDiv({ cls: "tutor-message-user" });
        userBubble.setText(msg.content);
      } else if (msg.role === "model") {
        const modelBubble = messagesContainer.createDiv({ cls: "tutor-message-model" });
        renderMarkdownToElement(msg.content, modelBubble);
      }
    }
    if (this.isTutorLoading) {
      messagesContainer.createDiv({ cls: "tutor-message-loading", text: "Gia sư AI đang suy nghĩ..." });
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Input row
    const inputRow = tutorContainer.createDiv({ cls: "sidebar-tutor-input-row" });
    const textarea = inputRow.createEl("textarea", {
      cls: "sidebar-tutor-textarea",
      attr: {
        placeholder: "Hỏi thêm gia sư AI... (Enter để gửi, Shift+Enter xuống dòng)",
        rows: "1",
      },
    }) as HTMLTextAreaElement;

    const sendBtn = inputRow.createEl("button", {
      cls: "sidebar-tutor-send-btn",
      attr: { type: "button", title: "Gửi tin nhắn", "aria-label": "Gửi tin nhắn" },
    }) as HTMLButtonElement;
    safeSetIcon(sendBtn, "send", "Gửi tin nhắn");
    textarea.disabled = this.isTutorLoading;
    sendBtn.disabled = this.isTutorLoading;

    const adjustTextareaHeight = () => {
      textarea.style.height = "auto";
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 34), 110);
      textarea.style.height = `${newHeight}px`;
    };
    textarea.addEventListener("input", adjustTextareaHeight);

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e?.preventDefault?.();
        const text = (textarea.value || "").trim();
        if (text && !this.isTutorLoading) {
          textarea.value = "";
          textarea.style.height = "";
          this.sendTutorMessage(text, messagesContainer, textarea, sendBtn);
        }
      }
    });

    sendBtn.addEventListener("click", () => {
      const text = (textarea.value || "").trim();
      if (text && !this.isTutorLoading) {
        textarea.value = "";
        textarea.style.height = "";
        this.sendTutorMessage(text, messagesContainer, textarea, sendBtn);
      }
    });
  }

  private async sendTutorMessage(
    content: string,
    messagesContainer: HTMLElement,
    textarea?: HTMLTextAreaElement,
    sendBtn?: HTMLButtonElement
  ): Promise<void> {
    if (this.isTutorLoading) return;

    if (!this.activeTutorSession) {
      if (this.tutorChatService) {
        this.activeTutorSession = this.tutorChatService.createSession({
          query: content,
          contextSentence: "",
        });
      } else {
        const now = Date.now();
        this.activeTutorSession = {
          id: `tutor_${now}`,
          query: content,
          contextSentence: "",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    const session = this.activeTutorSession;
    const messages = session.messages;
    const generation = ++this.tutorRequestGeneration;
    const chatService = this.tutorChatService;
    const isCurrent = () => generation === this.tutorRequestGeneration && this.activeTutorSession === session &&
      session.messages === messages && (!chatService || chatService.getSession(session.id) === session);

    // 1. Add user message
    if (this.tutorChatService) {
      this.tutorChatService.addMessage(session.id, "user", content);
    } else {
      session.messages.push({
        id: `msg_${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      });
    }

    const userBubble = messagesContainer.createDiv({ cls: "tutor-message-user" });
    userBubble.setText(content);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 2. Loading state
    this.isTutorLoading = true;
    if (textarea) textarea.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    const loadingBubble = messagesContainer.createDiv({ cls: "tutor-message-loading" });
    const dots = loadingBubble.createSpan({ cls: "tutor-typing-dots" });
    dots.createSpan();
    dots.createSpan();
    dots.createSpan();
    loadingBubble.createSpan({ text: "Gia sư AI đang suy nghĩ..." });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 3. Dispatch to Gemini
    let errorText: string | undefined;
    try {
      if (this.geminiService) {
        const systemPrompt = this.tutorChatService
          ? this.tutorChatService.buildSystemInstruction(session)
          : undefined;
        const reply = await this.geminiService.chatWithTutor(
          session,
          this.geminiApiKey,
          "gemini-flash-latest",
          systemPrompt
        );
        if (!isCurrent()) return;

        if (typeof loadingBubble.remove === "function") {
          loadingBubble.remove();
        } else if (loadingBubble.parentElement) {
          loadingBubble.parentElement.removeChild(loadingBubble);
        }

        if (reply && reply.trim()) {
          const trimmedReply = reply.trim();
          if (this.tutorChatService) {
            this.tutorChatService.addMessage(session.id, "model", trimmedReply);
          } else {
            session.messages.push({
              id: `msg_${Date.now()}`,
              role: "model",
              content: trimmedReply,
              timestamp: Date.now(),
            });
          }
          const modelBubble = messagesContainer.createDiv({ cls: "tutor-message-model" });
          renderMarkdownToElement(trimmedReply, modelBubble);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
          errorText = "Không thể kết nối đến Gemini AI. Vui lòng kiểm tra lại API Key hoặc mạng.";
          const errorBubble = messagesContainer.createDiv({
            cls: "tutor-message-model tutor-message-error",
          });
          errorBubble.setText(errorText);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      } else {
        if (typeof loadingBubble.remove === "function") {
          loadingBubble.remove();
        } else if (loadingBubble.parentElement) {
          loadingBubble.parentElement.removeChild(loadingBubble);
        }
      }
    } catch {
      if (!isCurrent()) return;
      errorText = "Không thể kết nối đến Gemini AI. Vui lòng kiểm tra lại API Key hoặc mạng.";
      if (typeof loadingBubble.remove === "function") {
        loadingBubble.remove();
      } else if (loadingBubble.parentElement) {
        loadingBubble.parentElement.removeChild(loadingBubble);
      }
      const errorBubble = messagesContainer.createDiv({
        cls: "tutor-message-model tutor-message-error",
      });
      errorBubble.setText(errorText);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } finally {
      if (typeof loadingBubble.remove === "function") loadingBubble.remove();
      if (generation === this.tutorRequestGeneration) {
        this.isTutorLoading = false;
        if (textarea) textarea.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (isCurrent() && this.activeTab === "ai-tutor") {
          if (this.contentEl.querySelector(".sidebar-tutor-messages") !== messagesContainer) {
            this.render();
            if (errorText) this.contentEl.querySelector(".sidebar-tutor-messages")?.createDiv({
              cls: "tutor-message-model tutor-message-error", text: errorText,
            });
          }
          const activeTextarea = this.contentEl.querySelector(".sidebar-tutor-textarea") as HTMLTextAreaElement | null;
          activeTextarea?.focus?.();
        }
      }
    }
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
      audioBtn || this.contentEl?.querySelector?.(".audio-btn") as HTMLElement | undefined;
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
