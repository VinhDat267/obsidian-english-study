import { restoreReadingFragments } from "./blockExtractor";
import type { ReadingBlock, ReadingTranslationResult, ReadingTranslationView } from "./types";

export class ReadingTranslationRenderer {
  mount(block: ReadingBlock, onRetry: () => void): ReadingTranslationView {
    const doc = block.sourceNodes[0].ownerDocument!;
    const element = doc.createElement("div");
    element.className = "polyglot-reading-translation";
    block.anchor.parent.insertBefore(element, block.anchor.before);
    let disposed = false;

    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      const button = target?.closest?.("button[data-reading-retry]");
      if (!disposed && button && element.contains(button)) onRetry();
    };
    element.addEventListener("click", onClick);
    const reset = (state: string) => {
      element.replaceChildren(); element.dataset.state = state;
    };
    const error = (code: string) => {
      reset("error");
      const message = doc.createElement("span");
      message.setAttribute("role", "status");
      message.textContent = code === "missing-key" ? "Cần cấu hình Gemini API key. "
        : code === "invalid-tokens" ? "Bản dịch chưa giữ được code hoặc công thức. " : "Chưa dịch được đoạn này. ";
      const button = doc.createElement("button");
      button.type = "button"; button.textContent = "Thử lại"; button.dataset.readingRetry = "";
      element.append(message, button);
    };
    const loading = () => {
      if (disposed) return;
      reset("loading");
      const status = doc.createElement("span");
      status.setAttribute("role", "status");
      status.textContent = "Đang dịch…";
      element.append(status);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      element.removeEventListener("click", onClick);
      element.remove();
    };
    const show = (result: ReadingTranslationResult) => {
      if (disposed) return;
      if (result.status === "cancelled") { dispose(); return; }
      if (result.status === "error") { error(result.code); return; }
      const fragment = restoreReadingFragments(result.text, block.fragments, doc);
      if (!fragment) { error("invalid-tokens"); return; }
      reset("success"); element.append(fragment);
    };
    loading();
    return { element, loading, show, dispose };
  }
}
