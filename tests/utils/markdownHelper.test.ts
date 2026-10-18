import { describe, it, expect } from "vitest";
import {
  renderMarkdownToHtml,
  renderMarkdownToElement,
  formatInlineMarkdown,
} from "../../src/utils/markdownHelper";

describe("markdownHelper", () => {
  it("should handle empty or whitespace text", () => {
    expect(renderMarkdownToHtml("")).toBe("");
    expect(renderMarkdownToHtml("   ")).toBe("");

    const mockContainer: any = { innerHTML: "initial" };
    renderMarkdownToElement("", mockContainer);
    expect(mockContainer.innerHTML).toBe("");
  });

  it("should format inline bold (**text**) and italic (*text*)", () => {
    const formatted = formatInlineMarkdown("Đây là **từ khóa quan trọng** và *từ phụ*.");
    expect(formatted).toContain("<strong>từ khóa quan trọng</strong>");
    expect(formatted).toContain("<em>từ phụ</em>");
  });

  it("should format inline code (`code`)", () => {
    const formatted = formatInlineMarkdown("Cấu trúc: `qualify as + Noun`.");
    expect(formatted).toContain("<code>qualify as + Noun</code>");
  });

  it("should render multiple bullet points on separate lines with clean layout", () => {
    const markdown = "• **Cấu trúc:** `qualify as + Noun`\n• **Lưu ý:** Phân biệt với ngoại động từ.";
    const html = renderMarkdownToHtml(markdown);

    expect(html).toContain('<div class="vocab-markdown-bullet">');
    expect(html).toContain("<strong>Cấu trúc:</strong>");
    expect(html).toContain("<code>qualify as + Noun</code>");
    expect(html).toContain("<strong>Lưu ý:</strong>");
  });

  it("should escape unsafe HTML to prevent XSS", () => {
    const html = renderMarkdownToHtml("<script>alert('xss')</script> **an toàn**");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>an toàn</strong>");
  });

  it("should format numbered lists as bullets", () => {
    const markdown = "1. **Nghĩa trong ngành:** Đủ điều kiện dự án\n2. **Ngữ pháp:** Cấu trúc qualify as";
    const html = renderMarkdownToHtml(markdown);

    expect(html).toContain("<strong>Nghĩa trong ngành:</strong>");
    expect(html).toContain("<strong>Ngữ pháp:</strong>");
  });
});
