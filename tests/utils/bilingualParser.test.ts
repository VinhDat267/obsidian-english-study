import { describe, it, expect } from "vitest";
import {
  parseMarkdownIntoBlocks,
  formatBilingualBlock,
  reassembleBilingualMarkdown,
} from "../../src/utils/bilingualParser";
import { MarkdownBlock } from "../../src/types";

describe("bilingualParser", () => {
  describe("parseMarkdownIntoBlocks", () => {
    it("should preserve YAML frontmatter without translating", () => {
      const md = "---\ntitle: IT Project\ntags: [it, agile]\n---\n\n# Header";
      const blocks = parseMarkdownIntoBlocks(md);

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe("frontmatter");
      expect(blocks[0].skipTranslation).toBe(true);
      expect(blocks[0].rawText).toContain("title: IT Project");
    });

    it("should preserve fenced code blocks with backticks and tildes", () => {
      const md = "```typescript\nconst a = 1;\nconsole.log(a);\n```\n\n~~~bash\nnpm test\n~~~";
      const blocks = parseMarkdownIntoBlocks(md);

      const codeBlocks = blocks.filter((b) => b.type === "code_block");
      expect(codeBlocks.length).toBe(2);
      expect(codeBlocks[0].skipTranslation).toBe(true);
      expect(codeBlocks[1].skipTranslation).toBe(true);
      expect(codeBlocks[0].rawText).toContain("const a = 1;");
      expect(codeBlocks[1].rawText).toContain("npm test");
    });

    it("should preserve LaTeX math blocks ($$ ... $$)", () => {
      const md = "$$\nE = mc^2\n$$\n\nFormula explanation";
      const blocks = parseMarkdownIntoBlocks(md);

      const mathBlock = blocks.find((b) => b.type === "math_block");
      expect(mathBlock).toBeDefined();
      expect(mathBlock?.skipTranslation).toBe(true);
      expect(mathBlock?.rawText).toContain("E = mc^2");
    });

    it("should preserve Markdown tables without corrupting columns", () => {
      const md = "| Term | Definition |\n| --- | --- |\n| Sprint | 2-week cycle |\n\nNormal paragraph";
      const blocks = parseMarkdownIntoBlocks(md);

      const tableBlock = blocks.find((b) => b.type === "table");
      expect(tableBlock).toBeDefined();
      expect(tableBlock?.skipTranslation).toBe(true);
      expect(tableBlock?.rawText).toContain("| Sprint | 2-week cycle |");
    });

    it("should parse headings as translatable blocks", () => {
      const md = "# Main Title\n\n## Sub Title & Agile Framework";
      const blocks = parseMarkdownIntoBlocks(md);

      const headings = blocks.filter((b) => b.type === "heading");
      expect(headings.length).toBe(2);
      expect(headings[0].translatableText).toBe("Main Title");
      expect(headings[1].translatableText).toBe("Sub Title & Agile Framework");
      expect(headings[0].skipTranslation).toBe(false);
    });

    it("should parse multiple choice exam options (A., B., C., D.) as distinct translatable blocks", () => {
      const md = "Q03. What inputs are consumed?\n\nA. Test cases and release notes.\nB. Scope and user stories.\nC. Resources, budget and time.";
      const blocks = parseMarkdownIntoBlocks(md);

      const mcBlocks = blocks.filter((b) => b.type === "multiple_choice");
      expect(mcBlocks.length).toBe(3);
      expect(mcBlocks[0].translatableText).toBe("A. Test cases and release notes.");
      expect(mcBlocks[1].translatableText).toBe("B. Scope and user stories.");
      expect(mcBlocks[2].translatableText).toBe("C. Resources, budget and time.");
      expect(mcBlocks[0].skipTranslation).toBe(false);
    });

    it("should parse list items with indentation preserved", () => {
      const md = "- First item\n- Second item\n  - Nested sub-item";
      const blocks = parseMarkdownIntoBlocks(md);

      const listBlocks = blocks.filter((b) => b.type === "list_item");
      expect(listBlocks.length).toBe(3);
      expect(listBlocks[0].translatableText).toBe("First item");
      expect(listBlocks[2].indent).toBe("  ");
    });

    it("should detect existing blockquote translations to avoid double translation", () => {
      const md = "A major breakthrough in software.\n> *Một bước đột phá lớn trong phần mềm.*\n\nNew paragraph.";
      const blocks = parseMarkdownIntoBlocks(md);

      const p1 = blocks.find((b) => b.rawText.includes("A major breakthrough"));
      expect(p1).toBeDefined();
      expect(p1?.skipTranslation).toBe(true); // Already has translation below it

      const p2 = blocks.find((b) => b.rawText.includes("New paragraph"));
      expect(p2).toBeDefined();
      expect(p2?.skipTranslation).toBe(false);
    });
  });

  describe("formatBilingualBlock", () => {
    it("should format blockquote style with vertical border and italic text", () => {
      const formatted = formatBilingualBlock(
        "A. Test cases, source files and release notes.",
        "A. Các trường hợp kiểm thử, các tệp nguồn và ghi chú về phiên bản mới.",
        "blockquote"
      );

      expect(formatted).toBe(
        "A. Test cases, source files and release notes.\n> *A. Các trường hợp kiểm thử, các tệp nguồn và ghi chú về phiên bản mới.*"
      );
    });

    it("should preserve indentation in blockquote style for lists", () => {
      const formatted = formatBilingualBlock(
        "  - Nested item",
        "Mục con lồng nhau",
        "blockquote",
        "  "
      );

      expect(formatted).toBe("  - Nested item\n  > *Mục con lồng nhau*");
    });

    it("should format colored style using font tag", () => {
      const formatted = formatBilingualBlock("Hello", "Xin chào", "colored");
      expect(formatted).toBe('Hello\n<font color="var(--text-accent)">*Xin chào*</font>');
    });

    it("should format highlight style using Obsidian ==highlight==", () => {
      const formatted = formatBilingualBlock("Hello", "Xin chào", "highlight");
      expect(formatted).toBe("Hello\n==*Xin chào*==");
    });

    it("should format bold_prefix style using [VI] prefix", () => {
      const formatted = formatBilingualBlock("Hello", "Xin chào", "bold_prefix");
      expect(formatted).toBe("Hello\n**[VI]** Xin chào");
    });
  });

  describe("reassembleBilingualMarkdown", () => {
    it("should assemble complete document with translations and untouched technical blocks", () => {
      const originalMd = "---\ntitle: Exam\n---\n\n```python\nprint(1)\n```\n\nQ01. What is Scrum?\nA. Agile Framework.\nB. Waterfall model.";
      const blocks = parseMarkdownIntoBlocks(originalMd);

      // Populate translations for translatable blocks
      for (const block of blocks) {
        if (!block.skipTranslation && block.translatableText) {
          if (block.translatableText.includes("What is Scrum")) {
            block.translatedText = "Scrum là gì?";
          } else if (block.translatableText.includes("Agile Framework")) {
            block.translatedText = "A. Khung làm việc Agile.";
          } else if (block.translatableText.includes("Waterfall model")) {
            block.translatedText = "B. Mô hình Thác nước.";
          }
        }
      }

      const result = reassembleBilingualMarkdown(blocks, "blockquote");

      expect(result).toContain("---\ntitle: Exam\n---");
      expect(result).toContain("```python\nprint(1)\n```");
      expect(result).toContain("Q01. What is Scrum?\n> *Scrum là gì?*");
      expect(result).toContain("A. Agile Framework.\n> *A. Khung làm việc Agile.*");
      expect(result).toContain("B. Waterfall model.\n> *B. Mô hình Thác nước.*");
    });
  });
});
