import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceLeaf } from "obsidian";
import { EnglishStudySidebar, VIEW_TYPE_ENGLISH_STUDY } from "../../src/ui/SidebarView";
import { LookupResult } from "../../src/types";
import { LRUCache } from "../../src/utils/lruCache";

describe("EnglishStudySidebar", () => {
  let leaf: WorkspaceLeaf;
  let sidebar: EnglishStudySidebar;
  let cache: LRUCache<LookupResult>;

  const mockResult1: LookupResult = {
    query: "ephemeral",
    type: "word",
    phonetic: "/ɪˈfem.ər.əl/",
    audioUrl: "https://example.com/audio1.mp3",
    vietnameseTranslation: "phù du, chóng tàn",
    definitions: [
      {
        partOfSpeech: "adjective",
        meaningEn: "Lasting for a very short time.",
        example: "Fame in the world of pop is largely ephemeral.",
      },
    ],
    aiGrammarNote: "Tính từ thường đứng trước danh từ hoặc sau to be.",
    contextSentence: "The beauty of cherry blossoms is ephemeral.",
    contextSentenceClean: "The beauty of cherry blossoms is ephemeral.",
    timestamp: Date.now() - 10000,
  };

  const mockResult2: LookupResult = {
    query: "serendipity",
    type: "word",
    phonetic: "/ˌser.ənˈdɪp.ə.ti/",
    audioUrl: "https://example.com/audio2.mp3",
    vietnameseTranslation: "sự tình cờ may mắn",
    definitions: [
      {
        partOfSpeech: "noun",
        meaningEn: "Finding valuable things by good fortune.",
        example: "Nature has created serendipity.",
      },
    ],
    contextSentence: "It was pure serendipity that we met.",
    contextSentenceClean: "It was pure serendipity that we met.",
    timestamp: Date.now(),
  };

  beforeEach(() => {
    leaf = new WorkspaceLeaf();
    sidebar = new EnglishStudySidebar(leaf);
    cache = new LRUCache<LookupResult>(10);
    sidebar.setCache(cache);
  });

  it("should have correct view type, display text, and icon", () => {
    expect(VIEW_TYPE_ENGLISH_STUDY).toBe("english-study-sidebar");
    expect(sidebar.getViewType()).toBe(VIEW_TYPE_ENGLISH_STUDY);
    expect(sidebar.getDisplayText()).toBe("Polyglot Study");
    expect(sidebar.getIcon()).toBe("book-open");
  });

  it("should render empty state when no result is set in deep-dive tab", async () => {
    await sidebar.onOpen();

    const contentEl = sidebar.contentEl;
    expect(contentEl).toBeDefined();

    const emptyState = contentEl.querySelector(".empty-state");
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain(
      "Chưa có dữ liệu tra cứu. Hãy bôi đen text trong ghi chú để tra từ hoặc dịch câu."
    );
  });

  it("should render populated deep-dive state when result is set", () => {
    sidebar.setResult(mockResult1);

    const contentEl = sidebar.contentEl;
    const queryEl = contentEl.querySelector(".vocab-query");
    expect(queryEl).not.toBeNull();
    expect(queryEl.textContent).toBe("ephemeral");

    const phoneticEl = contentEl.querySelector(".vocab-phonetic");
    expect(phoneticEl).not.toBeNull();
    expect(phoneticEl.textContent).toContain("/ɪˈfem.ər.əl/");

    const viEl = contentEl.querySelector(".vocab-meaning-vi");
    expect(viEl).not.toBeNull();
    expect(viEl.textContent).toBe("phù du, chóng tàn");

    const defItem = contentEl.querySelector(".vocab-def-item");
    expect(defItem).not.toBeNull();
    expect(defItem.textContent).toContain("Lasting for a very short time.");

    const aiNote = contentEl.querySelector(".vocab-ai-note");
    expect(aiNote).not.toBeNull();
    expect(aiNote.textContent).toContain("Tính từ thường đứng trước danh từ");

    const contextBox = contentEl.querySelector(".vocab-context-box");
    expect(contextBox).not.toBeNull();
    expect(contextBox.textContent).toContain("The beauty of cherry blossoms is ephemeral.");
  });

  it("should call onSaveCallback when clicking save button in deep-dive tab", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    sidebar.setSaveCallback(onSave);
    sidebar.setResult(mockResult1);

    const saveBtn = sidebar.contentEl.querySelector(".vocab-btn-save");
    expect(saveBtn).not.toBeNull();

    await saveBtn.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onSave).toHaveBeenCalledWith(mockResult1);
  });

  it("should toggle between Deep Dive tab and History tab", () => {
    sidebar.setResult(mockResult1);
    cache.set(mockResult1.query, mockResult1);
    sidebar.render();

    const historyTabBtn = sidebar.contentEl.querySelector(".tab-btn-history");
    expect(historyTabBtn).not.toBeNull();
    expect(historyTabBtn.textContent).toContain("Lịch sử phiên học (1)");

    // Switch to history tab
    historyTabBtn.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    // History tab should now be active
    const historyList = sidebar.contentEl.querySelector(".history-list");
    expect(historyList).not.toBeNull();

    const deepDiveTabBtn = sidebar.contentEl.querySelector(".tab-btn-deep-dive");
    expect(deepDiveTabBtn).not.toBeNull();

    // Switch back to deep-dive tab
    deepDiveTabBtn.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(sidebar.contentEl.querySelector(".deep-dive-container")).not.toBeNull();
  });

  it("should display history items and switch to deep-dive when clicking a history item", () => {
    cache.set(mockResult1.query, mockResult1);
    cache.set(mockResult2.query, mockResult2);

    sidebar.render();

    // Switch to history tab
    const historyTabBtn = sidebar.contentEl.querySelector(".tab-btn-history");
    historyTabBtn.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    const items = sidebar.contentEl.querySelectorAll(".history-item");
    expect(items.length).toBe(2);

    // Click on serendipity (second item or item with serendipity)
    const serendipityItem = items.find((it: any) => it.textContent.includes("serendipity"));
    expect(serendipityItem).toBeDefined();

    serendipityItem.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    // Should have switched to deep-dive tab displaying serendipity
    const queryEl = sidebar.contentEl.querySelector(".vocab-query");
    expect(queryEl).not.toBeNull();
    expect(queryEl.textContent).toBe("serendipity");
  });

  it("should clear cache and update view when clicking clear history button", () => {
    cache.set(mockResult1.query, mockResult1);
    sidebar.render();

    const clearBtn = sidebar.contentEl.querySelector(".btn-clear-history");
    expect(clearBtn).not.toBeNull();

    clearBtn.dispatchEvent({
      type: "click",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(cache.size).toBe(0);

    const historyTabBtn = sidebar.contentEl.querySelector(".tab-btn-history");
    expect(historyTabBtn.textContent).toContain("Lịch sử phiên học (0)");
  });

  it("should display language badge and transliteration in deep-dive tab", () => {
    const jaResult: LookupResult = {
      query: "勉強",
      type: "word",
      contextSentence: "勉強",
      contextSentenceClean: "勉強",
      vietnameseTranslation: "học tập",
      sourceLang: "ja",
      transliteration: "Benkyō",
      timestamp: Date.now(),
    };
    sidebar.setResult(jaResult);

    const badge = sidebar.contentEl.querySelector(".vocab-lang-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("JA");

    const translit = sidebar.contentEl.querySelector(".vocab-transliteration");
    expect(translit).not.toBeNull();
    expect(translit?.textContent).toContain("Benkyō");
  });

  it("should display loading chip when aiLoading is true and update to AI when aiTranslation is set", () => {
    const loadingResult: LookupResult = {
      query: "paradigm",
      type: "word",
      contextSentence: "paradigm",
      contextSentenceClean: "paradigm",
      vietnameseTranslation: "mô hình",
      aiLoading: true,
      timestamp: Date.now(),
    };
    sidebar.setResult(loadingResult);

    const viEl = sidebar.contentEl.querySelector(".vocab-meaning-vi");
    expect(viEl).not.toBeNull();
    expect(viEl.querySelector(".vocab-ai-loading-chip")).not.toBeNull();
    expect(viEl.textContent).toContain("mô hình");

    // AI completes
    sidebar.setResult({
      ...loadingResult,
      aiLoading: false,
      aiTranslation: "mô thức tư duy",
    });

    const updatedViEl = sidebar.contentEl.querySelector(".vocab-meaning-vi");
    expect(updatedViEl.querySelector(".vocab-ai-loading-chip")).toBeNull();
    expect(updatedViEl.querySelector(".vocab-ai-badge-inline")).not.toBeNull();
    expect(updatedViEl.textContent).toContain("mô thức tư duy");
  });
});
