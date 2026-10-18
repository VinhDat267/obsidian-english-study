import { describe, it, expect } from "vitest";
import { cleanSelection } from "../../src/utils/textCleaner";

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
    it("collapses multiple internal spaces into a single space", () => {
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
  });
});
