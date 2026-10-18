import { setIcon } from "obsidian";
import { LookupResult } from "../types";
import { calculatePosition, RectLike } from "../utils/domHelper";
import { getLanguageMeta } from "../utils/languageHelper";
import { renderMarkdownToElement } from "../utils/markdownHelper";

export interface PopoverCallbacks {
  onSave: (result: LookupResult) => Promise<void> | void;
  onPinToSidebar?: (result: LookupResult) => void;
  onClose?: () => void;
}

export class FloatingPopover {
  private element: HTMLElement | null = null;
  private currentResult: LookupResult | null = null;
  private currentQuery: string | null = null;
  private customPosition: { left: number; top: number } | null = null;
  private isPlayingAudio: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private outsideTimeout: any = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private dragMouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private dragMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private dragMouseUpHandler: ((e?: MouseEvent) => void) | null = null;
  private isDragging: boolean = false;
  private justDraggedTimestamp: number = 0;

  /**
   * Hiển thị Card Popover:
   * 1. Tính toán vị trí bằng calculatePosition(rect, ...) hoặc sử dụng customPosition nếu đã di chuyển.
   * 2. Header:
   *    - Từ / Cụm từ (Font lớn, đậm)
   *    - Phiên âm IPA (nếu có)
   *    - Nút Loa phát âm (icon volume-2):
   *      + Nếu có audioUrl: phát bằng HTML5 Audio.
   *      + Fallback: phát qua window.speechSynthesis.
   *      + Hiển thị trạng thái đang phát (audio-playing).
   *    - Nút Ghim sang Sidebar (icon panel-right)
   *    - Nút Đóng (icon x)
   * 3. Body:
   *    - Nghĩa tiếng Việt (nổi bật, rõ ràng)
   *    - Danh sách định nghĩa tiếng Anh (definitions: partOfSpeech + meaningEn + example)
   *    - Badge phân tích AI (nếu có aiGrammarNote)
   * 4. Footer:
   *    - Hiển thị trích đoạn câu ngữ cảnh bài đọc
   *    - Nút "💾 Lưu vào sổ từ vựng" (gọi callbacks.onSave)
   *    - Nút "📋 Copy nghĩa" (copy vào clipboard)
   * 5. Sự kiện:
   *    - Tự ẩn khi click ra ngoài element (mousedown outside).
   *    - Tự ẩn khi bấm phím Escape.
   */
  show(
    rect: RectLike,
    result: LookupResult,
    callbacks: PopoverCallbacks,
    options?: {
      enableAiGrammar?: boolean;
      enableAiTranslation?: boolean;
    }
  ): void {
    const preservedPosition = this.customPosition;
    this.hide();
    this.customPosition = preservedPosition;

    this.currentResult = result;
    this.currentQuery = result.query;

    const popover = document.createElement("div");
    popover.className = "english-study-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Chi tiết từ vựng");

    // Prevent clicks and mouse releases inside popover from propagating to document
    popover.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });
    popover.addEventListener("mouseup", (e: MouseEvent) => {
      e.stopPropagation();
    });

    // 1. Header
    const header = document.createElement("div");
    header.className = "popover-header";

    const dragHandle = document.createElement("div");
    dragHandle.className = "popover-drag-handle";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.setAttribute("title", "Kéo để di chuyển");
    try {
      setIcon(dragHandle, "grip-horizontal");
    } catch {
      // fallback
    }
    if (!dragHandle.innerHTML.trim()) {
      dragHandle.textContent = "⋮⋮";
    }
    header.appendChild(dragHandle);

    const titleGroup = document.createElement("div");
    titleGroup.className = "popover-title-group";

    const langMeta = getLanguageMeta(result.sourceLang || "en");
    const langBadge = document.createElement("span");
    langBadge.className = "vocab-lang-badge";
    langBadge.textContent = langMeta.badge;
    langBadge.setAttribute("title", langMeta.nameVi);
    titleGroup.appendChild(langBadge);

    const queryEl = document.createElement("span");
    queryEl.className = "vocab-query";
    queryEl.textContent = result.query;
    titleGroup.appendChild(queryEl);

    if (result.phonetic) {
      const phoneticEl = document.createElement("span");
      phoneticEl.className = "vocab-phonetic";
      phoneticEl.textContent = result.phonetic.startsWith("/")
        ? result.phonetic
        : `/${result.phonetic}/`;
      titleGroup.appendChild(phoneticEl);
    }

    if (result.transliteration) {
      const translitEl = document.createElement("span");
      translitEl.className = "vocab-transliteration";
      translitEl.textContent = `[${result.transliteration}]`;
      titleGroup.appendChild(translitEl);
    }

    // Audio Button
    const audioBtn = document.createElement("button");
    audioBtn.className = "audio-btn";
    audioBtn.setAttribute("aria-label", "Phát âm");
    audioBtn.setAttribute("title", "Phát âm");
    try {
      setIcon(audioBtn, "volume-2");
    } catch {
      // fallback
    }
    if (!audioBtn.innerHTML.trim()) {
      audioBtn.textContent = "🔊";
    }

    audioBtn.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    audioBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAudio(result.query, result.audioUrl, audioBtn, result.sourceLang);
    });
    titleGroup.appendChild(audioBtn);

    header.appendChild(titleGroup);

    // Header Actions (Pin & Close)
    const headerActions = document.createElement("div");
    headerActions.className = "popover-header-actions";

    if (callbacks.onPinToSidebar) {
      const pinBtn = document.createElement("button");
      pinBtn.className = "popover-btn-pin";
      pinBtn.setAttribute("aria-label", "Ghim sang Sidebar");
      pinBtn.setAttribute("title", "Ghim sang Sidebar");
      try {
        setIcon(pinBtn, "panel-right");
      } catch {
        // fallback
      }
      if (!pinBtn.innerHTML.trim()) {
        pinBtn.textContent = "📌";
      }

      pinBtn.addEventListener("mousedown", (e: MouseEvent) => {
        e.stopPropagation();
      });

      pinBtn.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        callbacks.onPinToSidebar?.(result);
      });
      headerActions.appendChild(pinBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "popover-btn-close";
    closeBtn.setAttribute("aria-label", "Đóng");
    closeBtn.setAttribute("title", "Đóng");
    try {
      setIcon(closeBtn, "x");
    } catch {
      // fallback
    }
    if (!closeBtn.innerHTML.trim()) {
      closeBtn.textContent = "✕";
    }

    closeBtn.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    closeBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      callbacks.onClose?.();
    });
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    this.setupDraggable(header, popover);
    popover.appendChild(header);

    // 2. Body
    const body = document.createElement("div");
    body.className = "popover-body";

    // Vietnamese Translation
    const displayTranslation = result.aiTranslation || result.vietnameseTranslation;
    if (displayTranslation) {
      const viMeaning = document.createElement("div");
      viMeaning.className = "vocab-meaning-vi";
      if (result.aiTranslation) {
        const badge = document.createElement("span");
        badge.className = "vocab-ai-badge-inline";
        badge.textContent = "✨ AI";
        viMeaning.appendChild(badge);

        const textSpan = document.createElement("span");
        textSpan.className = "vocab-translation-text";
        textSpan.textContent = ` ${result.aiTranslation}`;
        viMeaning.appendChild(textSpan);
      } else {
        viMeaning.textContent = displayTranslation;
      }
      body.appendChild(viMeaning);
    }

    // English Definitions
    if (result.definitions && result.definitions.length > 0) {
      const defsList = document.createElement("div");
      defsList.className = "vocab-definitions";

      result.definitions.forEach((def) => {
        const item = document.createElement("div");
        item.className = "vocab-def-item";

        if (def.partOfSpeech) {
          const pos = document.createElement("span");
          pos.className = "vocab-pos-tag";
          pos.setAttribute("data-pos", def.partOfSpeech.toLowerCase().trim());
          pos.textContent = def.partOfSpeech;
          item.appendChild(pos);
        }

        const meaning = document.createElement("span");
        meaning.className = "vocab-meaning-en";
        meaning.textContent = def.meaningEn;
        item.appendChild(meaning);

        if (def.example) {
          const ex = document.createElement("div");
          ex.className = "vocab-example";
          ex.textContent = `"${def.example}"`;
          item.appendChild(ex);
        }

        defsList.appendChild(item);
      });

      body.appendChild(defsList);
    }

    // AI Grammar Note
    const isGrammarEnabled =
      options?.enableAiGrammar !== undefined
        ? options.enableAiGrammar
        : Boolean(result.aiGrammarNote);

    if (isGrammarEnabled) {
      if (result.aiGrammarNote) {
        const aiNote = document.createElement("div");
        aiNote.className = "vocab-ai-note";

        const aiBadge = document.createElement("div");
        aiBadge.className = "vocab-ai-badge";

        const aiIcon = document.createElement("span");
        aiIcon.className = "vocab-ai-icon";
        try {
          setIcon(aiIcon, "sparkles");
        } catch {
          // fallback
        }
        if (!aiIcon.innerHTML.trim()) {
          aiIcon.textContent = "✨";
        }
        aiBadge.appendChild(aiIcon);

        const aiTitle = document.createElement("span");
        aiTitle.className = "vocab-ai-title";
        aiTitle.textContent = "Phân tích ngữ pháp AI";
        aiBadge.appendChild(aiTitle);

        aiNote.appendChild(aiBadge);

        const aiContent = document.createElement("div");
        aiContent.className = "vocab-ai-content";
        renderMarkdownToElement(result.aiGrammarNote, aiContent);
        aiNote.appendChild(aiContent);

        body.appendChild(aiNote);
      } else if (result.aiLoading) {
        const aiNote = document.createElement("div");
        aiNote.className = "vocab-ai-note vocab-ai-loading";

        const aiBadge = document.createElement("div");
        aiBadge.className = "vocab-ai-badge";

        const aiIcon = document.createElement("span");
        aiIcon.className = "vocab-ai-icon";
        try {
          setIcon(aiIcon, "sparkles");
        } catch {
          // fallback
        }
        if (!aiIcon.innerHTML.trim()) {
          aiIcon.textContent = "✨";
        }
        aiBadge.appendChild(aiIcon);

        const aiTitle = document.createElement("span");
        aiTitle.className = "vocab-ai-title";
        aiTitle.textContent = "Phân tích ngữ pháp AI";
        aiBadge.appendChild(aiTitle);

        aiNote.appendChild(aiBadge);

        const aiContent = document.createElement("div");
        aiContent.className = "vocab-ai-content";
        aiContent.innerHTML = `<span class="vocab-ai-spinner">⏳</span> Đang phân tích ngữ pháp...`;
        aiNote.appendChild(aiContent);

        body.appendChild(aiNote);
      }
    }

    popover.appendChild(body);

    // 3. Footer
    const footer = document.createElement("div");
    footer.className = "popover-footer";

    // Context Sentence
    const contextText = result.contextSentence || result.contextSentenceClean;
    if (contextText) {
      const contextBox = document.createElement("div");
      contextBox.className = "vocab-context-box";

      const contextLabel = document.createElement("span");
      contextLabel.className = "vocab-context-label";
      contextLabel.textContent = "Ngữ cảnh: ";
      contextBox.appendChild(contextLabel);

      const contextSentence = document.createElement("span");
      contextSentence.className = "vocab-context-text";
      contextSentence.textContent = `"${contextText}"`;
      contextBox.appendChild(contextSentence);

      footer.appendChild(contextBox);
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "vocab-actions";

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.className = "vocab-btn-save";
    saveBtn.setAttribute("type", "button");

    const saveIcon = document.createElement("span");
    saveIcon.className = "btn-icon";
    try {
      setIcon(saveIcon, "bookmark");
    } catch {
      // fallback
    }
    if (!saveIcon.innerHTML.trim()) {
      saveIcon.textContent = "💾";
    }
    saveBtn.appendChild(saveIcon);

    const saveText = document.createElement("span");
    saveText.className = "btn-text";
    saveText.textContent = "Lưu vào sổ từ vựng";
    saveBtn.appendChild(saveText);

    saveBtn.addEventListener("click", async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      saveBtn.disabled = true;
      saveText.textContent = "Đang lưu...";
      try {
        const activeRes = this.currentResult || result;
        await callbacks.onSave(activeRes);
        saveText.textContent = "Đã lưu ✓";
        saveBtn.classList.add("saved");
        try {
          setIcon(saveIcon, "check");
        } catch {}
      } catch (err) {
        saveText.textContent = "Lỗi khi lưu ✕";
        saveBtn.disabled = false;
        setTimeout(() => {
          saveText.textContent = "Lưu vào sổ từ vựng";
        }, 2000);
      }
    });
    actions.appendChild(saveBtn);

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "vocab-btn-copy";
    copyBtn.setAttribute("type", "button");

    const copyIcon = document.createElement("span");
    copyIcon.className = "btn-icon";
    try {
      setIcon(copyIcon, "copy");
    } catch {
      // fallback
    }
    if (!copyIcon.innerHTML.trim()) {
      copyIcon.textContent = "📋";
    }
    copyBtn.appendChild(copyIcon);

    const copyText = document.createElement("span");
    copyText.className = "btn-text";
    copyText.textContent = "Sao chép";
    copyBtn.appendChild(copyText);

    copyBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const activeRes = this.currentResult || result;
      const displayMeaning = activeRes.aiTranslation || activeRes.vietnameseTranslation;
      const textToCopy = `${activeRes.query}${
        activeRes.phonetic ? ` [${activeRes.phonetic}]` : ""
      }\n- Nghĩa: ${displayMeaning}${
        contextText ? `\n- Ngữ cảnh: "${contextText}"` : ""
      }`;

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy);
      }
      copyText.textContent = "Đã copy ✓";
      try {
        setIcon(copyIcon, "check");
      } catch {}
      setTimeout(() => {
        if (copyText) copyText.textContent = "Sao chép";
        try {
          setIcon(copyIcon, "copy");
        } catch {}
      }, 2000);
    });
    actions.appendChild(copyBtn);

    footer.appendChild(actions);
    popover.appendChild(footer);

    // Measure and position
    popover.style.position = "fixed";
    popover.style.visibility = "hidden";
    document.body.appendChild(popover);

    const rectBounds = popover.getBoundingClientRect();
    const popoverWidth = rectBounds.width || 380;
    const popoverHeight = rectBounds.height || 280;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;

    if (this.customPosition) {
      const padding = 8;
      const maxLeft = Math.max(padding, vw - popoverWidth - padding);
      const maxTop = Math.max(padding, vh - popoverHeight - padding);
      const clampedLeft = Math.max(padding, Math.min(this.customPosition.left, maxLeft));
      const clampedTop = Math.max(padding, Math.min(this.customPosition.top, maxTop));
      popover.style.top = `${clampedTop}px`;
      popover.style.left = `${clampedLeft}px`;
      this.customPosition = { left: clampedLeft, top: clampedTop };
    } else {
      const pos = calculatePosition(rect, popoverWidth, popoverHeight, vw, vh, 8);
      popover.style.top = `${pos.top}px`;
      popover.style.left = `${pos.left}px`;
    }
    popover.style.visibility = "visible";

    this.element = popover;

    // Outside click event listener
    this.outsideClickHandler = (e: MouseEvent) => {
      if (this.element && !this.element.contains(e.target as Node)) {
        this.hide();
        callbacks.onClose?.();
      }
    };
    this.outsideTimeout = setTimeout(() => {
      if (this.outsideClickHandler && typeof document !== "undefined") {
        document.addEventListener("mousedown", this.outsideClickHandler);
      }
    }, 0);

    // Escape key listener
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
        callbacks.onClose?.();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.keydownHandler);
    }
  }

  /**
   * Cập nhật kết quả AI (Dịch thuật ngữ cảnh hoặc Phân tích ngữ pháp)
   * sau khi AI hoàn tất trong background (Progressive Loading).
   */
  updateAiContent(
    updatedResult: LookupResult,
    options?: {
      enableAiGrammar?: boolean;
      enableAiTranslation?: boolean;
    }
  ): void {
    if (!this.element || this.currentQuery !== updatedResult.query) {
      return;
    }
    this.currentResult = {
      ...(this.currentResult || {}),
      ...updatedResult,
    } as LookupResult;

    const body = this.element.querySelector(".popover-body");
    if (!body) return;

    // 1. Cập nhật AI Translation (nếu có)
    if (updatedResult.aiTranslation) {
      let viMeaning = body.querySelector(".vocab-meaning-vi") as HTMLElement;
      if (!viMeaning) {
        viMeaning = document.createElement("div");
        viMeaning.className = "vocab-meaning-vi";
        if (body.firstChild && typeof body.insertBefore === "function") {
          body.insertBefore(viMeaning, body.firstChild);
        } else {
          body.appendChild(viMeaning);
        }
      }
      viMeaning.innerHTML = "";
      const badge = document.createElement("span");
      badge.className = "vocab-ai-badge-inline vocab-fade-in";
      badge.textContent = "✨ AI";
      viMeaning.appendChild(badge);

      const textSpan = document.createElement("span");
      textSpan.className = "vocab-translation-text vocab-fade-in";
      textSpan.textContent = ` ${updatedResult.aiTranslation}`;
      viMeaning.appendChild(textSpan);
    }

    // 2. Cập nhật AI Grammar Note
    const isGrammarEnabled =
      options?.enableAiGrammar !== undefined
        ? options.enableAiGrammar
        : Boolean(updatedResult.aiGrammarNote);

    let aiNote = body.querySelector(".vocab-ai-note") as HTMLElement;
    if (!isGrammarEnabled) {
      // Nếu user tắt ngữ pháp -> xoá bỏ box ngữ pháp hoàn toàn
      if (aiNote) {
        aiNote.remove();
      }
    } else {
      if (updatedResult.aiGrammarNote) {
        if (!aiNote) {
          aiNote = document.createElement("div");
          aiNote.className = "vocab-ai-note";

          const aiBadge = document.createElement("div");
          aiBadge.className = "vocab-ai-badge";

          const aiIcon = document.createElement("span");
          aiIcon.className = "vocab-ai-icon";
          try {
            setIcon(aiIcon, "sparkles");
          } catch {}
          if (!aiIcon.innerHTML.trim()) {
            aiIcon.textContent = "✨";
          }
          aiBadge.appendChild(aiIcon);

          const aiTitle = document.createElement("span");
          aiTitle.className = "vocab-ai-title";
          aiTitle.textContent = "Phân tích ngữ pháp AI";
          aiBadge.appendChild(aiTitle);
          aiNote.appendChild(aiBadge);

          const aiContent = document.createElement("div");
          aiContent.className = "vocab-ai-content";
          aiNote.appendChild(aiContent);

          body.appendChild(aiNote);
        }

        aiNote.classList.remove("vocab-ai-loading");
        const aiContent = aiNote.querySelector(".vocab-ai-content");
        if (aiContent) {
          aiContent.classList.add("vocab-fade-in");
          renderMarkdownToElement(updatedResult.aiGrammarNote, aiContent as HTMLElement);
        }
      } else if (!updatedResult.aiLoading && aiNote) {
        // AI chạy xong nhưng không có note ngữ pháp -> xoá placeholder
        aiNote.remove();
      }
    }
  }

  /**
   * Hiển thị Card Loading nhỏ gọn trong khi chờ API tra cứu / dịch
   */
  showLoading(
    rect: RectLike,
    query: string,
    callbacks: { onClose?: () => void }
  ): void {
    if (this.currentQuery !== query) {
      this.customPosition = null;
    }
    const preservedPosition = this.customPosition;
    this.hide();
    this.customPosition = preservedPosition;
    this.currentQuery = query;

    const popover = document.createElement("div");
    popover.className = "english-study-popover popover-loading";
    popover.setAttribute("role", "status");
    popover.setAttribute("aria-live", "polite");
    popover.setAttribute("aria-label", `Đang tra cứu ${query}`);

    // Prevent clicks and mouse releases inside popover from propagating to document
    popover.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });
    popover.addEventListener("mouseup", (e: MouseEvent) => {
      e.stopPropagation();
    });

    // Header
    const header = document.createElement("div");
    header.className = "popover-header";

    const dragHandle = document.createElement("div");
    dragHandle.className = "popover-drag-handle";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.setAttribute("title", "Kéo để di chuyển");
    try {
      setIcon(dragHandle, "grip-horizontal");
    } catch {
      // fallback
    }
    if (!dragHandle.innerHTML.trim()) {
      dragHandle.textContent = "⋮⋮";
    }
    header.appendChild(dragHandle);

    const titleGroup = document.createElement("div");
    titleGroup.className = "popover-title-group";

    const spinner = document.createElement("span");
    spinner.className = "popover-loading-spinner";
    try {
      setIcon(spinner, "loader-2");
    } catch {
      // fallback
    }
    if (!spinner.innerHTML.trim()) {
      spinner.textContent = "⏳";
    }
    titleGroup.appendChild(spinner);

    const queryEl = document.createElement("span");
    queryEl.className = "vocab-query";
    queryEl.textContent = `Đang tra cứu "${query}"...`;
    titleGroup.appendChild(queryEl);

    header.appendChild(titleGroup);

    const headerActions = document.createElement("div");
    headerActions.className = "popover-header-actions";

    const closeBtn = document.createElement("button");
    closeBtn.className = "popover-btn-close";
    closeBtn.setAttribute("aria-label", "Đóng");
    closeBtn.setAttribute("title", "Hủy tra cứu");
    try {
      setIcon(closeBtn, "x");
    } catch {
      // fallback
    }
    if (!closeBtn.innerHTML.trim()) {
      closeBtn.textContent = "✕";
    }

    closeBtn.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });

    closeBtn.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      callbacks.onClose?.();
    });
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);

    this.setupDraggable(header, popover);
    popover.appendChild(header);

    // Measure and position
    popover.style.position = "fixed";
    popover.style.visibility = "hidden";
    document.body.appendChild(popover);

    const rectBounds = popover.getBoundingClientRect();
    const popoverWidth = rectBounds.width || 320;
    const popoverHeight = rectBounds.height || 64;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;

    if (this.customPosition) {
      const padding = 8;
      const maxLeft = Math.max(padding, vw - popoverWidth - padding);
      const maxTop = Math.max(padding, vh - popoverHeight - padding);
      const clampedLeft = Math.max(padding, Math.min(this.customPosition.left, maxLeft));
      const clampedTop = Math.max(padding, Math.min(this.customPosition.top, maxTop));
      popover.style.top = `${clampedTop}px`;
      popover.style.left = `${clampedLeft}px`;
      this.customPosition = { left: clampedLeft, top: clampedTop };
    } else {
      const pos = calculatePosition(rect, popoverWidth, popoverHeight, vw, vh, 8);
      popover.style.top = `${pos.top}px`;
      popover.style.left = `${pos.left}px`;
    }
    popover.style.visibility = "visible";

    this.element = popover;

    // Outside click event listener
    this.outsideClickHandler = (e: MouseEvent) => {
      if (this.element && !this.element.contains(e.target as Node)) {
        this.hide();
        callbacks.onClose?.();
      }
    };
    this.outsideTimeout = setTimeout(() => {
      if (this.outsideClickHandler && typeof document !== "undefined") {
        document.addEventListener("mousedown", this.outsideClickHandler);
      }
    }, 0);

    // Escape key listener
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
        callbacks.onClose?.();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.keydownHandler);
    }
  }

  hide(): void {
    this.cleanUpDragListeners();
    this.stopAudio();

    if (this.outsideTimeout) {
      clearTimeout(this.outsideTimeout);
      this.outsideTimeout = null;
    }

    if (this.outsideClickHandler) {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", this.outsideClickHandler);
      }
      this.outsideClickHandler = null;
    }

    if (this.keydownHandler) {
      if (typeof document !== "undefined") {
        document.removeEventListener("keydown", this.keydownHandler);
      }
      this.keydownHandler = null;
    }

    if (this.element) {
      if (this.element.parentElement) {
        this.element.parentElement.removeChild(this.element);
      }
      this.element = null;
    }

    this.currentResult = null;
    this.currentQuery = null;
    this.customPosition = null;
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

  getCurrentQuery(): string | null {
    return this.currentQuery;
  }

  getCustomPosition(): { left: number; top: number } | null {
    return this.customPosition ? { ...this.customPosition } : null;
  }

  resetCustomPosition(): void {
    this.customPosition = null;
  }

  isUserDragging(): boolean {
    return this.isDragging;
  }

  wasJustDragged(thresholdMs: number = 400): boolean {
    return Date.now() - this.justDraggedTimestamp < thresholdMs;
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
    const btn = audioBtn || this.element?.querySelector<HTMLElement>(".audio-btn");
    if (btn) {
      if (playing) {
        btn.classList.add("audio-playing");
      } else {
        btn.classList.remove("audio-playing");
      }
    }
  }

  private setupDraggable(header: HTMLElement, popover: HTMLElement): void {
    this.dragMouseDownHandler = (e: MouseEvent) => {
      // Only drag on primary left click
      if (e.button !== 0) return;

      // Ignore drag if clicking on buttons or interactive inputs in header
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "BUTTON" ||
          (typeof target.closest === "function" &&
            target.closest("button, input, select, textarea, a")))
      ) {
        return;
      }

      if (e.preventDefault) {
        e.preventDefault();
      }
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      this.isDragging = true;
      popover.classList.add("is-dragging");

      const startX = e.clientX;
      const startY = e.clientY;
      const rectBounds = popover.getBoundingClientRect();
      const initialLeft = parseFloat(popover.style.left) || rectBounds.left || 0;
      const initialTop = parseFloat(popover.style.top) || rectBounds.top || 0;
      let hasActuallyMoved = false;

      this.dragMouseMoveHandler = (moveEvent: MouseEvent) => {
        if (!this.isDragging) return;

        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          hasActuallyMoved = true;
        }

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // Viewport boundary clamping
        const rect = popover.getBoundingClientRect();
        const width = rect.width || 380;
        const height = rect.height || 280;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
        const vh = typeof window !== "undefined" ? window.innerHeight : 768;
        const padding = 8;

        const maxLeft = Math.max(padding, vw - width - padding);
        const maxTop = Math.max(padding, vh - height - padding);

        newLeft = Math.max(padding, Math.min(newLeft, maxLeft));
        newTop = Math.max(padding, Math.min(newTop, maxTop));

        popover.style.left = `${newLeft}px`;
        popover.style.top = `${newTop}px`;
        this.customPosition = { left: newLeft, top: newTop };
      };

      this.dragMouseUpHandler = (upEvent?: MouseEvent) => {
        this.justDraggedTimestamp = Date.now();
        if (upEvent && typeof upEvent.stopPropagation === "function") {
          upEvent.stopPropagation();
        }
        this.isDragging = false;
        popover.classList.remove("is-dragging");
        this.removeDragWindowListeners();
      };

      if (typeof window !== "undefined") {
        window.addEventListener("mousemove", this.dragMouseMoveHandler);
        window.addEventListener("mouseup", this.dragMouseUpHandler, true);
        window.addEventListener("mouseup", this.dragMouseUpHandler, false);
      }
    };

    header.addEventListener("mousedown", this.dragMouseDownHandler);
  }

  private removeDragWindowListeners(): void {
    if (typeof window !== "undefined") {
      if (this.dragMouseMoveHandler) {
        window.removeEventListener("mousemove", this.dragMouseMoveHandler);
        this.dragMouseMoveHandler = null;
      }
      if (this.dragMouseUpHandler) {
        window.removeEventListener("mouseup", this.dragMouseUpHandler, true);
        window.removeEventListener("mouseup", this.dragMouseUpHandler, false);
        this.dragMouseUpHandler = null;
      }
    }
  }

  private cleanUpDragListeners(): void {
    this.isDragging = false;
    this.removeDragWindowListeners();
    this.dragMouseDownHandler = null;
  }
}
