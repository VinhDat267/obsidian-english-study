import { describe, it, expect } from "vitest";
import {
  stripMarkdown,
  extractContextSentence,
} from "../../src/utils/textParser";

describe("stripMarkdown", () => {
  it("strips bold, italic, and inline code formatting", () => {
    const input = "This is **bold** and *italic* with `inline code`.";
    expect(stripMarkdown(input)).toBe(
      "This is bold and italic with inline code."
    );
  });

  it("strips wiki-links without alias", () => {
    const input = "The study of [[photosynthesis]] is essential.";
    expect(stripMarkdown(input)).toBe(
      "The study of photosynthesis is essential."
    );
  });

  it("strips wiki-links with alias and retains the alias text", () => {
    const input = "Observe the [[mitochondria|powerhouse]] of the cell.";
    expect(stripMarkdown(input)).toBe(
      "Observe the powerhouse of the cell."
    );
  });

  it("strips markdown links and markdown images", () => {
    const input = "Check [Google](https://google.com) and ![diagram](img.png).";
    expect(stripMarkdown(input)).toBe("Check Google and diagram.");
  });

  it("strips strikethrough and highlight markers", () => {
    const input = "This is ~~deprecated~~ and ==highlighted== text.";
    expect(stripMarkdown(input)).toBe(
      "This is deprecated and highlighted text."
    );
  });

  it("strips header and blockquote prefixes", () => {
    const input = "> ## Important observation";
    expect(stripMarkdown(input)).toBe("Important observation");
  });

  it("normalizes newlines and multiple spaces into clean single spaces", () => {
    const input = "Line one\n  line two \t  and line three.";
    expect(stripMarkdown(input)).toBe("Line one line two and line three.");
  });
});

describe("extractContextSentence", () => {
  describe("Basic sentence extraction", () => {
    it("extracts the target sentence within a multi-sentence paragraph", () => {
      const paragraph =
        "The introductory remarks were brief. The hypothesis was tested thoroughly under laboratory conditions. The results will follow.";
      const res = extractContextSentence(paragraph, "hypothesis");

      expect(res.cleanContext).toBe(
        "The hypothesis was tested thoroughly under laboratory conditions."
      );
      expect(res.rawContext).toBe(
        "The **hypothesis** was tested thoroughly under laboratory conditions."
      );
    });

    it("handles target word at the beginning of a paragraph", () => {
      const paragraph = "Penicillin was discovered in 1928. It saved millions of lives.";
      const res = extractContextSentence(paragraph, "Penicillin");

      expect(res.cleanContext).toBe("Penicillin was discovered in 1928.");
      expect(res.rawContext).toBe("**Penicillin** was discovered in 1928.");
    });

    it("handles target word at the end of a paragraph", () => {
      const paragraph = "He started early. Finally, he proved the hypothesis.";
      const res = extractContextSentence(paragraph, "hypothesis");

      expect(res.cleanContext).toBe("Finally, he proved the hypothesis.");
      expect(res.rawContext).toBe("Finally, he proved the **hypothesis**.");
    });
  });

  describe("Abbreviations handling", () => {
    it("does not break sentences at honorifics like Dr., Mr., Mrs., Ms., Prof.", () => {
      const paragraph =
        "Yesterday, Dr. Watson and Prof. Moriarty visited Mr. Holmes at 221B Baker St. They discussed an urgent case.";
      const res = extractContextSentence(paragraph, "visited");

      expect(res.cleanContext).toBe(
        "Yesterday, Dr. Watson and Prof. Moriarty visited Mr. Holmes at 221B Baker St."
      );
      expect(res.rawContext).toBe(
        "Yesterday, Dr. Watson and Prof. Moriarty **visited** Mr. Holmes at 221B Baker St."
      );
    });

    it("does not break sentences at common Latin abbreviations like e.g., i.e., vs., etc., approx.", () => {
      const paragraph =
        "We compared various methods, e.g. supervised vs. unsupervised learning, etc. The results were conclusive.";
      const res = extractContextSentence(paragraph, "supervised");

      expect(res.cleanContext).toBe(
        "We compared various methods, e.g. supervised vs. unsupervised learning, etc."
      );
      expect(res.rawContext).toBe(
        "We compared various methods, e.g. **supervised** vs. unsupervised learning, etc."
      );
    });
  });

  describe("Decimal numbers and currency handling", () => {
    it("does not break sentences on decimal numbers", () => {
      const paragraph =
        "The mathematical constant pi is approx. 3.14159 in Euclidean geometry. It is ubiquitous in science.";
      const res = extractContextSentence(paragraph, "3.14159");

      expect(res.cleanContext).toBe(
        "The mathematical constant pi is approx. 3.14159 in Euclidean geometry."
      );
      expect(res.rawContext).toBe(
        "The mathematical constant pi is approx. **3.14159** in Euclidean geometry."
      );
    });

    it("does not break on currency decimals like $100.50", () => {
      const paragraph =
        "The item cost $100.50 after tax. That was a great discount.";
      const res = extractContextSentence(paragraph, "discount");

      expect(res.cleanContext).toBe("That was a great discount.");
      expect(res.rawContext).toBe("That was a great **discount**.");
    });
  });

  describe("Multiline paragraphs handling", () => {
    it("correctly extracts sentences spanning across soft line wraps", () => {
      const paragraph =
        "First sentence.\nIn 1928, Dr. Fleming entered\nthe laboratory to inspect the bacterial\nculture. He observed an unexpected clearing.";
      const res = extractContextSentence(paragraph, "laboratory");

      expect(res.cleanContext).toBe(
        "In 1928, Dr. Fleming entered the laboratory to inspect the bacterial culture."
      );
      expect(res.rawContext).toBe(
        "In 1928, Dr. Fleming entered\nthe **laboratory** to inspect the bacterial\nculture."
      );
    });
  });

  describe("Bolding behavior & preventing duplicate asterisks", () => {
    it("does not duplicate asterisks if target is already bolded", () => {
      const paragraph =
        "The **hypothesis** was tested thoroughly in every trial.";
      const res = extractContextSentence(paragraph, "hypothesis");

      expect(res.rawContext).toBe(
        "The **hypothesis** was tested thoroughly in every trial."
      );
      expect(res.rawContext).not.toContain("****hypothesis****");
    });

    it("handles targetText passed with asterisks (**hypothesis**)", () => {
      const paragraph =
        "The **hypothesis** was tested thoroughly in every trial.";
      const res = extractContextSentence(paragraph, "**hypothesis**");

      expect(res.rawContext).toBe(
        "The **hypothesis** was tested thoroughly in every trial."
      );
      expect(res.rawContext).not.toContain("****");
    });

    it("bolds wiki-link properly without breaking obsidian syntax", () => {
      const paragraph =
        "The cellular process of [[photosynthesis]] produces oxygen.";
      const res = extractContextSentence(paragraph, "photosynthesis");

      expect(res.cleanContext).toBe(
        "The cellular process of photosynthesis produces oxygen."
      );
      expect(res.rawContext).toBe(
        "The cellular process of **[[photosynthesis]]** produces oxygen."
      );
    });

    it("preserves original text casing when bolding", () => {
      const paragraph =
        "Hypothesis formulation is the first step of scientific discovery.";
      const res = extractContextSentence(paragraph, "hypothesis");

      expect(res.rawContext).toBe(
        "**Hypothesis** formulation is the first step of scientific discovery."
      );
    });
  });

  describe("Cursor offset navigation", () => {
    it("picks the sentence closest to cursorOffset when multiple occurrences exist", () => {
      const paragraph =
        "Apples are rich in fiber. He ate an apple for breakfast. Apple orchards are common in the north.";

      const firstRes = extractContextSentence(paragraph, "apple", 5);
      expect(firstRes.cleanContext).toBe("Apples are rich in fiber." || "He ate an apple for breakfast.");

      const secondRes = extractContextSentence(paragraph, "apple", 35);
      expect(secondRes.cleanContext).toBe("He ate an apple for breakfast.");
      expect(secondRes.rawContext).toBe("He ate an **apple** for breakfast.");

      const thirdRes = extractContextSentence(paragraph, "apple", 70);
      expect(thirdRes.cleanContext).toBe(
        "Apple orchards are common in the north."
      );
      expect(thirdRes.rawContext).toBe(
        "**Apple** orchards are common in the north."
      );
    });
  });

  describe("Fallback behavior & edge cases", () => {
    it("falls back to full paragraph when no sentence boundaries exist", () => {
      const paragraph = "A standalone sentence without any ending punctuation";
      const res = extractContextSentence(paragraph, "standalone");

      expect(res.cleanContext).toBe(
        "A standalone sentence without any ending punctuation"
      );
      expect(res.rawContext).toBe(
        "A **standalone** sentence without any ending punctuation"
      );
    });

    it("returns empty contexts for empty paragraph", () => {
      const res = extractContextSentence("", "target");
      expect(res.cleanContext).toBe("");
      expect(res.rawContext).toBe("");
    });

    it("handles target not found gracefully", () => {
      const paragraph = "The quick brown fox jumps over the lazy dog.";
      const res = extractContextSentence(paragraph, "cat");

      expect(res.cleanContext).toBe(
        "The quick brown fox jumps over the lazy dog."
      );
      expect(res.rawContext).toBe(
        "The quick brown fox jumps over the lazy dog."
      );
    });
  });
});
