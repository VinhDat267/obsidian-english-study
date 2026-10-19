import { setIcon } from "obsidian";
import { AiTutorChatService } from "../services/ai/AiTutorChatService";
import { GeminiService } from "../services/provider/GeminiService";
import { TutorSession } from "../types";
import { renderMarkdownToElement } from "../utils/markdownHelper";

export interface PopoverChatDrawerCallbacks {
  onResize?: () => void;
  onPinToSidebar?: (session: TutorSession) => void;
}

function safeSetIcon(element: HTMLElement, iconId: string, fallbackText: string): void {
  try {
    setIcon(element, iconId);
  } catch {
    // fallback if setIcon fails in non-obsidian or mocked environment
  }
  if (!element.innerHTML.trim() && fallbackText) {
    element.textContent = fallbackText;
  }
}

export class PopoverChatDrawer {
  private session: TutorSession | null = null;
  private containerEl: HTMLElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private chevronEl: HTMLElement | null = null;
  private drawerBody: HTMLElement | null = null;
  private messagesList: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private chipsContainer: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;

  private expanded: boolean = false;
  private isLoading: boolean = false;

  constructor(
    private chatService: AiTutorChatService,
    private geminiService: GeminiService,
    private apiKey: string,
    private callbacks?: PopoverChatDrawerCallbacks
  ) {}

  /**
   * Sets or updates the active tutor session.
   * If the drawer is already rendered, refreshes the message list.
   */
  setSession(session: TutorSession): void {
    this.session = session;
    if (this.messagesList) {
      this.renderMessages();
    }
  }

  /**
   * Returns whether the drawer is currently expanded.
   */
  isExpanded(): boolean {
    return this.expanded;
  }

  /**
   * Returns the active session attached to this drawer.
   */
  getSession(): TutorSession | null {
    return this.session;
  }

  /**
   * Returns whether this drawer has any messages recorded in its session.
   */
  hasMessages(): boolean {
    return (this.session?.messages?.length ?? 0) > 0;
  }

  /**
   * Toggles the accordion drawer between collapsed and expanded.
   * @param expand Optional explicit target state
   */
  toggle(expand?: boolean): void {
    const nextState = expand !== undefined ? expand : !this.expanded;
    if (this.expanded === nextState) return;
    this.expanded = nextState;

    if (this.containerEl) {
      this.containerEl.classList.toggle("expanded", this.expanded);
    }
    if (this.toggleBtn) {
      this.toggleBtn.classList.toggle("expanded", this.expanded);
    }
    if (this.chevronEl) {
      safeSetIcon(
        this.chevronEl,
        this.expanded ? "chevron-up" : "chevron-down",
        this.expanded ? "▲" : "▼"
      );
    }
    if (this.drawerBody) {
      this.drawerBody.classList.toggle("expanded", this.expanded);
      this.drawerBody.style.display = this.expanded ? "block" : "none";
    }

    this.callbacks?.onResize?.();
  }

  /**
   * Renders the complete PopoverChatDrawer DOM structure.
   */
  render(): HTMLElement {
    if (this.containerEl) {
      return this.containerEl;
    }

    // 1. Root container
    const container = document.createElement("div");
    container.className = "popover-chat-drawer";
    this.containerEl = container;

    // 2. Accordion Toggle Button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "drawer-toggle-btn";
    toggleBtn.setAttribute("type", "button");
    toggleBtn.setAttribute("aria-label", "Hỏi sâu Gia sư AI");

    const chatIcon = document.createElement("span");
    chatIcon.className = "drawer-toggle-icon";
    safeSetIcon(chatIcon, "message-square", "💬");
    toggleBtn.appendChild(chatIcon);

    const toggleText = document.createElement("span");
    toggleText.className = "drawer-toggle-text";
    toggleText.textContent = "Hỏi sâu Gia sư AI";
    toggleBtn.appendChild(toggleText);

    const chevron = document.createElement("span");
    chevron.className = "drawer-toggle-chevron";
    safeSetIcon(chevron, "chevron-down", "▼");
    this.chevronEl = chevron;
    toggleBtn.appendChild(chevron);

    toggleBtn.addEventListener("click", () => this.toggle());
    this.toggleBtn = toggleBtn;
    container.appendChild(toggleBtn);

    // 3. Drawer Body
    const drawerBody = document.createElement("div");
    drawerBody.className = "drawer-body";
    drawerBody.style.display = this.expanded ? "block" : "none";
    this.drawerBody = drawerBody;

    // 3.1 Top Toolbar
    const topToolbar = document.createElement("div");
    topToolbar.className = "drawer-top-toolbar";

    const titleGroup = document.createElement("div");
    titleGroup.className = "drawer-toolbar-title";
    const tutorBadgeIcon = document.createElement("span");
    tutorBadgeIcon.className = "drawer-title-icon";
    safeSetIcon(tutorBadgeIcon, "bot", "🤖");
    titleGroup.appendChild(tutorBadgeIcon);

    const titleText = document.createElement("span");
    titleText.className = "drawer-title-text";
    titleText.textContent = "Gia sư AI Polyglot";
    titleGroup.appendChild(titleText);
    topToolbar.appendChild(titleGroup);

    const toolbarActions = document.createElement("div");
    toolbarActions.className = "drawer-toolbar-actions";

    // Pin to sidebar button
    const pinBtn = document.createElement("button");
    pinBtn.className = "btn-pin-sidebar";
    pinBtn.setAttribute("type", "button");
    pinBtn.setAttribute("title", "Ghim vào thanh bên");
    pinBtn.setAttribute("aria-label", "Ghim vào thanh bên");
    safeSetIcon(pinBtn, "panel-right", "📌");
    pinBtn.addEventListener("click", () => {
      if (this.session) {
        this.callbacks?.onPinToSidebar?.(this.session);
      }
    });
    toolbarActions.appendChild(pinBtn);

    // Clear chat button
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn-clear-chat";
    clearBtn.setAttribute("type", "button");
    clearBtn.setAttribute("title", "Xóa đoạn chat");
    clearBtn.setAttribute("aria-label", "Xóa đoạn chat");
    safeSetIcon(clearBtn, "trash-2", "🗑️");
    clearBtn.addEventListener("click", () => {
      if (this.session) {
        this.chatService.clearSession(this.session.id);
      }
      this.renderMessages();
      this.callbacks?.onResize?.();
    });
    toolbarActions.appendChild(clearBtn);

    topToolbar.appendChild(toolbarActions);
    drawerBody.appendChild(topToolbar);

    // 3.2 Quick Action Chips
    const chipsContainer = document.createElement("div");
    chipsContainer.className = "drawer-quick-chips";
    this.chipsContainer = chipsContainer;
    this.renderChips();
    drawerBody.appendChild(chipsContainer);

    // 3.3 Messages List
    const messagesList = document.createElement("div");
    messagesList.className = "drawer-messages-list";
    this.messagesList = messagesList;
    this.renderMessages();
    drawerBody.appendChild(messagesList);

    // 3.4 Input Row
    const inputRow = document.createElement("div");
    inputRow.className = "drawer-input-row";

    const textarea = document.createElement("textarea");
    textarea.className = "drawer-input-textarea";
    textarea.placeholder = "Hỏi thêm gia sư AI... (Enter để gửi)";
    textarea.rows = 1;
    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.textarea = textarea;
    inputRow.appendChild(textarea);

    const sendBtn = document.createElement("button");
    sendBtn.className = "drawer-send-btn";
    sendBtn.setAttribute("type", "button");
    sendBtn.setAttribute("title", "Gửi tin nhắn");
    sendBtn.setAttribute("aria-label", "Gửi tin nhắn");
    safeSetIcon(sendBtn, "send", "➤");
    sendBtn.addEventListener("click", () => this.handleSend());
    this.sendBtn = sendBtn;
    inputRow.appendChild(sendBtn);

    drawerBody.appendChild(inputRow);
    container.appendChild(drawerBody);

    return container;
  }

  /**
   * Destroys component DOM and cleans up references.
   */
  destroy(): void {
    if (this.containerEl && this.containerEl.parentElement) {
      this.containerEl.parentElement.removeChild(this.containerEl);
    }
    this.containerEl = null;
    this.toggleBtn = null;
    this.chevronEl = null;
    this.drawerBody = null;
    this.messagesList = null;
    this.textarea = null;
    this.sendBtn = null;
    this.chipsContainer = null;
    this.loadingEl = null;
  }

  private renderChips(): void {
    if (!this.chipsContainer) return;
    this.chipsContainer.innerHTML = "";

    const chips = this.chatService.getQuickPromptChips();
    for (const chip of chips) {
      const chipBtn = document.createElement("button");
      chipBtn.className = "quick-prompt-chip";
      chipBtn.setAttribute("type", "button");
      chipBtn.setAttribute("data-chip-id", chip.id);

      if (chip.icon) {
        const iconSpan = document.createElement("span");
        iconSpan.className = "chip-icon";
        safeSetIcon(iconSpan, chip.icon, "");
        chipBtn.appendChild(iconSpan);
      }

      const labelSpan = document.createElement("span");
      labelSpan.className = "chip-label";
      labelSpan.textContent = chip.label;
      chipBtn.appendChild(labelSpan);

      chipBtn.addEventListener("click", () => {
        if (this.isLoading) return;
        const prompt = chip.promptTemplate(
          this.session?.query || "",
          this.session?.contextSentence || ""
        );
        this.sendMessage(prompt);
      });

      this.chipsContainer.appendChild(chipBtn);
    }
  }

  private renderMessages(): void {
    if (!this.messagesList) return;
    this.messagesList.innerHTML = "";

    if (!this.session || !Array.isArray(this.session.messages)) return;

    for (const msg of this.session.messages) {
      if (msg.role === "user") {
        this.appendUserBubble(msg.content);
      } else if (msg.role === "model") {
        this.appendModelBubble(msg.content);
      }
    }
    this.scrollToBottom();
  }

  private handleSend(): void {
    if (this.isLoading || !this.textarea) return;
    const text = this.textarea.value.trim();
    if (!text) return;

    this.textarea.value = "";
    this.sendMessage(text);
  }

  private async sendMessage(content: string): Promise<void> {
    if (this.isLoading) return;

    if (!this.session) {
      this.session = this.chatService.createSession({
        query: content,
        contextSentence: "",
      });
    }

    // 1. Add user message to session & append to DOM
    this.chatService.addMessage(this.session.id, "user", content);
    this.appendUserBubble(content);

    // 2. Loading state & resize notification
    this.setLoading(true);
    this.showLoadingIndicator();
    this.callbacks?.onResize?.();

    // 3. Dispatch to Gemini
    try {
      const systemPrompt = this.chatService.buildSystemInstruction(this.session);
      const reply = await this.geminiService.chatWithTutor(
        this.session,
        this.apiKey,
        "gemini-flash-latest",
        systemPrompt
      );

      this.removeLoadingIndicator();

      if (reply && reply.trim()) {
        this.chatService.addMessage(this.session.id, "model", reply.trim());
        this.appendModelBubble(reply.trim());
      } else {
        this.appendErrorBubble(
          "Không thể kết nối đến Gemini AI. Vui lòng kiểm tra lại API Key hoặc mạng."
        );
      }
    } catch {
      this.removeLoadingIndicator();
      this.appendErrorBubble(
        "Không thể kết nối đến Gemini AI. Vui lòng kiểm tra lại API Key hoặc mạng."
      );
    } finally {
      this.setLoading(false);
      this.callbacks?.onResize?.();
    }
  }

  private appendUserBubble(content: string): void {
    if (!this.messagesList) return;
    const userBubble = document.createElement("div");
    userBubble.className = "tutor-message-user";
    userBubble.textContent = content;
    this.messagesList.appendChild(userBubble);
    this.scrollToBottom();
  }

  private appendModelBubble(content: string): void {
    if (!this.messagesList) return;
    const modelBubble = document.createElement("div");
    modelBubble.className = "tutor-message-model";
    renderMarkdownToElement(content, modelBubble);
    this.messagesList.appendChild(modelBubble);
    this.scrollToBottom();
  }

  private appendErrorBubble(errorMessage: string): void {
    if (!this.messagesList) return;
    const errorBubble = document.createElement("div");
    errorBubble.className = "tutor-message-model tutor-message-error";
    errorBubble.textContent = errorMessage;
    this.messagesList.appendChild(errorBubble);
    this.scrollToBottom();
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    if (this.textarea) {
      this.textarea.disabled = loading;
    }
    if (this.sendBtn) {
      this.sendBtn.disabled = loading;
    }
  }

  private showLoadingIndicator(): void {
    if (!this.messagesList) return;
    this.removeLoadingIndicator();

    const loadingEl = document.createElement("div");
    loadingEl.className = "tutor-message-loading";
    loadingEl.textContent = "Gia sư AI đang suy nghĩ...";
    this.loadingEl = loadingEl;
    this.messagesList.appendChild(loadingEl);
    this.scrollToBottom();
  }

  private removeLoadingIndicator(): void {
    if (this.loadingEl && this.loadingEl.parentElement) {
      this.loadingEl.parentElement.removeChild(this.loadingEl);
    }
    this.loadingEl = null;
  }

  private scrollToBottom(): void {
    if (this.messagesList) {
      this.messagesList.scrollTop = this.messagesList.scrollHeight;
    }
  }
}
