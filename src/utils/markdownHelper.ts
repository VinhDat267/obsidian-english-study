/**
 * Tiện ích format và render Markdown an toàn (XSS-safe)
 * Hỗ trợ: **in đậm**, *in nghiêng*, `inline code`, danh sách gạch đầu dòng (•, *, -), và ngắt dòng riêng biệt.
 */

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatInlineMarkdown(text: string): string {
  if (!text) return "";
  let escaped = escapeHtml(text);

  // 1. Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 2. Bold: **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // 3. Italic: *text* (chỉ match đơn lẻ)
  escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  return escaped;
}

export function renderMarkdownToHtml(markdownText: string): string {
  if (!markdownText || !markdownText.trim()) {
    return "";
  }

  const lines = markdownText.split("\n");
  const htmlLines: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    // Kiểm tra dòng gạch đầu dòng: •, hoặc - / * theo sau bởi khoảng trắng, hoặc số 1. / 1)
    const bulletMatch = trimmed.match(/^([•]\s*|[\*\-]\s+|\d+[\.\)]\s+)(.*)$/);

    if (bulletMatch) {
      const content = bulletMatch[2];
      htmlLines.push(
        `<div class="vocab-markdown-bullet"><span class="bullet-dot">•</span><span class="bullet-text">${formatInlineMarkdown(content)}</span></div>`
      );
    } else {
      htmlLines.push(
        `<div class="vocab-markdown-paragraph">${formatInlineMarkdown(trimmed)}</div>`
      );
    }
  }

  return htmlLines.join("");
}

export function renderMarkdownToElement(
  markdownText: string,
  container: HTMLElement
): void {
  if (!container) return;
  container.innerHTML = renderMarkdownToHtml(markdownText);
}
