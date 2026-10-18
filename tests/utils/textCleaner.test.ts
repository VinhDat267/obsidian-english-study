import { describe, it, expect } from "vitest";
import { cleanSelection, formatMultipleChoiceText } from "../../src/utils/textCleaner";

describe("cleanSelection", () => {
  describe("Punctuation and quotes stripping", () => {
    it("strips outer double quotes and commas", () => {
      expect(cleanSelection(' "hypothesis," ')).toBe("hypothesis");
    });

    it("strips outer parentheses and trailing periods", () => {
      expect(cleanSelection("(effective).")).toBe("effective");
    });

    it("strips braces and semicolons", () => {
      expect(cleanSelection("{important};")).toBe("important");
    });

    it("strips brackets and colons", () => {
      expect(cleanSelection("[crucial]:")).toBe("crucial");
    });

    it("strips exclamation and question marks", () => {
      expect(cleanSelection("!amazing?")).toBe("amazing");
    });

    it("strips typographic / smart curly quotes", () => {
      expect(cleanSelection("“smart quotes”")).toBe("smart quotes");
      expect(cleanSelection("‘single smart’")).toBe("single smart");
    });

    it("strips simple quotes", () => {
      expect(cleanSelection('"quoted"')).toBe("quoted");
      expect(cleanSelection("'single quoted'")).toBe("single quoted");
    });
  });

  describe("Markdown formatting stripping", () => {
    it("strips bold markers (** and __)", () => {
      expect(cleanSelection("**crucial**")).toBe("crucial");
      expect(cleanSelection("__crucial__")).toBe("crucial");
    });

    it("strips italic markers (* and _)", () => {
      expect(cleanSelection("*italic*")).toBe("italic");
      expect(cleanSelection("_italic_")).toBe("italic");
    });

    it("strips strikethrough (~~)", () => {
      expect(cleanSelection("~~deprecated~~")).toBe("deprecated");
    });

    it("strips highlight (==)", () => {
      expect(cleanSelection("==highlighted==")).toBe("highlighted");
    });

    it("strips inline code (`)", () => {
      expect(cleanSelection("`code`")).toBe("code");
    });

    it("strips wiki-links ([[...]])", () => {
      expect(cleanSelection("[[photosynthesis]]")).toBe("photosynthesis");
    });

    it("strips wiki-links with alias ([[link|alias]]) and returns the alias", () => {
      expect(cleanSelection("[[photosynthesis|process]]")).toBe("process");
    });

    it("strips standard markdown links ([text](url))", () => {
      expect(cleanSelection("[markdown link](https://example.com)")).toBe(
        "markdown link"
      );
    });
  });

  describe("Nested and combined wrappers", () => {
    it("handles bold nested inside quotes with trailing punctuation", () => {
      expect(cleanSelection('**"crucial"**,')).toBe("crucial");
    });

    it("handles italic inside parentheses with trailing dot", () => {
      expect(cleanSelection("(*hypothesis*).")).toBe("hypothesis");
    });

    it("handles wiki-link with outer whitespace and punctuation", () => {
      expect(cleanSelection("  [[photosynthesis]],  ")).toBe("photosynthesis");
    });

    it("handles wiki-link with alias inside quotes", () => {
      expect(cleanSelection(' "[[photosynthesis|process]]" ')).toBe("process");
    });
  });

  describe("Preserving internal punctuation and hyphens", () => {
    it("preserves internal apostrophes in contractions", () => {
      expect(cleanSelection("don't")).toBe("don't");
      expect(cleanSelection('"don\'t"')).toBe("don't");
    });

    it("preserves hyphens inside compound words", () => {
      expect(cleanSelection("state-of-the-art")).toBe("state-of-the-art");
      expect(cleanSelection("(state-of-the-art).")).toBe("state-of-the-art");
    });

    it("preserves internal commas in selected phrases", () => {
      expect(cleanSelection('"Hello, world!"')).toBe("Hello, world");
    });

    it("preserves internal periods in acronyms while trimming trailing period", () => {
      expect(cleanSelection("U.S.A.")).toBe("U.S.A");
    });
  });

  describe("Whitespace normalization and edge cases", () => {
    it("collapses multiple internal spaces into a single space on single line", () => {
      expect(
        cleanSelection("   multiple   words   with   spaces   ")
      ).toBe("multiple words with spaces");
    });

    it("returns empty string for empty input or whitespace only", () => {
      expect(cleanSelection("")).toBe("");
      expect(cleanSelection("   ")).toBe("");
    });

    it("returns empty string if selection contains only punctuation", () => {
      expect(cleanSelection("....")).toBe("");
      expect(cleanSelection('""')).toBe("");
      expect(cleanSelection("()")).toBe("");
    });

    it("preserves newlines in multiline paragraphs instead of flattening into a single space", () => {
      const input = "First line of text.\nSecond line of text.\n\nThird line of text.";
      const expected = "First line of text.\nSecond line of text.\n\nThird line of text.";
      expect(cleanSelection(input)).toBe(expected);
    });

    it("formats multiple choice questions with A B C D into separate lines", () => {
      const input = "What is the focus of lecture 1?\nA. Only grammar\nB. Focus on writing\nC. Focus on listening\nD. Develop four skills";
      const res = cleanSelection(input);
      expect(res).toBe(
        "What is the focus of lecture 1?\nA. Only grammar\nB. Focus on writing\nC. Focus on listening\nD. Develop four skills"
      );
    });

    it("formats inline multiple choice questions into separate lines", () => {
      const input = "What is the focus of lecture 1? A. Only grammar B. Focus on writing C. Focus on listening D. Develop four skills";
      const res = cleanSelection(input);
      expect(res).toBe(
        "What is the focus of lecture 1?\nA. Only grammar\nB. Focus on writing\nC. Focus on listening\nD. Develop four skills"
      );
    });
  });
});

describe("formatMultipleChoiceText", () => {
  it("splits inline uppercase options A. B. C. D. into separate lines", () => {
    const input = "Trọng tâm của bài giảng 1 là gì? A. Chỉ có ngữ pháp B. Tập trung vào kỹ năng viết C. Tập trung vào kỹ năng nghe D. Phát triển bốn kỹ năng";
    const expected = "Trọng tâm của bài giảng 1 là gì?\nA. Chỉ có ngữ pháp\nB. Tập trung vào kỹ năng viết\nC. Tập trung vào kỹ năng nghe\nD. Phát triển bốn kỹ năng";
    expect(formatMultipleChoiceText(input)).toBe(expected);
  });

  it("splits inline options with parentheses (A) (B) (C) into separate lines", () => {
    const input = "Choose the best option: (A) First choice (B) Second choice (C) Third choice";
    const expected = "Choose the best option:\n(A) First choice\n(B) Second choice\n(C) Third choice";
    expect(formatMultipleChoiceText(input)).toBe(expected);
  });

  it("splits inline options with brackets [A] [B] [C] into separate lines", () => {
    const input = "Select answer: [A] Option 1 [B] Option 2 [C] Option 3";
    const expected = "Select answer:\n[A] Option 1\n[B] Option 2\n[C] Option 3";
    expect(formatMultipleChoiceText(input)).toBe(expected);
  });

  it("splits inline numbered options 1. 2. 3. into separate lines", () => {
    const input = "Please follow these steps: 1. Install plugin 2. Enable settings 3. Restart Obsidian";
    const expected = "Please follow these steps:\n1. Install plugin\n2. Enable settings\n3. Restart Obsidian";
    expect(formatMultipleChoiceText(input)).toBe(expected);
  });

  it("does not insert extra newlines if options are already separated by newlines", () => {
    const input = "Question?\nA. Choice 1\nB. Choice 2\nC. Choice 3";
    expect(formatMultipleChoiceText(input)).toBe(input);
  });

  it("leaves normal sentences without sequential options unchanged", () => {
    const input = "She got grade A. in the exam, which was impressive.";
    expect(formatMultipleChoiceText(input)).toBe(input);
  });

  it("handles empty or non-string input gracefully", () => {
    expect(formatMultipleChoiceText("")).toBe("");
    expect(formatMultipleChoiceText(null as any)).toBe("");
  });
});
