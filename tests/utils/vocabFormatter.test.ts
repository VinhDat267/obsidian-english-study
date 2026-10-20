import { describe, it, expect } from "vitest";
import {
  getDefaultTemplate,
  escapePipes,
  formatTableRow,
  formatCallout,
  insertRowAtTableEnd,
  isWordInContent,
  appendContextToExisting,
} from "../../src/utils/vocabFormatter";
import { LookupResult } from "../../src/types";

describe("vocabFormatter", () => {
  const sampleResult: LookupResult = {
    query: "hypothesis",
    type: "word",
    contextSentence: "The scientist proposed a bold hypothesis to explain the phenomenon.",
    contextSentenceClean: "The scientist proposed a bold hypothesis to explain the phenomenon.",
    phonetic: "/haɪˈpɑː.θə.sɪs/",
    audioUrl: "https://example.com/audio/hypothesis.mp3",
    vietnameseTranslation: "giả thuyết",
    definitions: [
      {
        partOfSpeech: "noun",
        meaningEn: "an idea or explanation that you then test through study and experimentation",
      },
    ],
    timestamp: 1776510000000, // 2026-04-18
  };

  describe("getDefaultTemplate", () => {
    it("should return valid markdown table with header and separator", () => {
      const template = getDefaultTemplate();

      expect(template).toContain("## Sổ từ vựng tiếng Anh");
      expect(template).toContain("| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |");
      expect(template).toContain("| :--- | :--- | :--- | :--- | :--- |");
    });
  });

  describe("escapePipes", () => {
    it("should escape pipe character '|' to '\\|'", () => {
      expect(escapePipes("Option A | Option B")).toBe("Option A \\| Option B");
      expect(escapePipes("|first|second|")).toBe("\\|first\\|second\\|");
    });

    it("should replace newlines with spaces", () => {
      expect(escapePipes("Line 1\nLine 2\r\nLine 3")).toBe("Line 1 Line 2 Line 3");
    });

    it("should handle strings with both pipes and newlines", () => {
      expect(escapePipes("Hello | World\nNew | Line")).toBe("Hello \\| World New \\| Line");
    });

    it("should return empty string for empty or falsy input", () => {
      expect(escapePipes("")).toBe("");
      expect(escapePipes(null as any)).toBe("");
      expect(escapePipes(undefined as any)).toBe("");
    });
  });

  describe("formatTableRow", () => {
    it("should format a standard LookupResult into a markdown table row", () => {
      const row = formatTableRow(sampleResult);

      expect(row).toContain("| **hypothesis** |");
      expect(row).toContain("*noun* `/haɪˈpɑː.θə.sɪs/`");
      expect(row).toContain("giả thuyết");
      expect(row).toContain("bold **hypothesis** to explain");
      // Check date format: YYYY-MM-DD
      expect(row).toMatch(/\d{4}-\d{2}-\d{2} \|$/);
      expect(row.startsWith("|")).toBe(true);
      expect(row.endsWith("|")).toBe(true);
    });

    it("should highlight the target word in the context sentence if not bolded", () => {
      const row = formatTableRow(sampleResult, true);
      expect(row).toContain("**hypothesis**");
    });

    it("should not double-bold the word if it is already bolded in contextSentence", () => {
      const alreadyBoldedResult: LookupResult = {
        ...sampleResult,
        contextSentence: "The scientist proposed a **hypothesis** yesterday.",
      };
      const row = formatTableRow(alreadyBoldedResult, true);
      expect(row).not.toContain("****hypothesis****");
      expect(row).toContain("**hypothesis**");
    });

    it("should respect highlightWord = false", () => {
      const unhighlightedResult: LookupResult = {
        ...sampleResult,
        contextSentence: "A simple hypothesis test.",
      };
      const row = formatTableRow(unhighlightedResult, false);
      expect(row).toContain("A simple hypothesis test.");
      expect(row).not.toContain("**hypothesis** test");
    });

    it("should escape pipes inside contextSentence and vietnameseTranslation", () => {
      const resultWithPipes: LookupResult = {
        ...sampleResult,
        vietnameseTranslation: "giả thuyết | giả định",
        contextSentence: "A | B test of the hypothesis.",
      };
      const row = formatTableRow(resultWithPipes);
      // All unescaped pipes should only be table cell delimiters
      const rawSplit = row.split(/(?<!\\)\|/);
      // Row has 5 columns, so splitting by unescaped pipe gives 7 parts (empty at start and end)
      expect(rawSplit.length).toBe(7);
      expect(row).toContain("giả thuyết \\| giả định");
      expect(row).toContain("A \\| B test of the **hypothesis**.");
    });

    it("should handle missing phonetic or definitions gracefully", () => {
      const minimalResult: LookupResult = {
        query: "breakthrough",
        type: "word",
        contextSentence: "A major breakthrough was made.",
        contextSentenceClean: "A major breakthrough was made.",
        vietnameseTranslation: "đột phá",
        timestamp: Date.now(),
      };
      const row = formatTableRow(minimalResult);
      expect(row).toContain("| **breakthrough** | - | đột phá |");
    });

    it("should handle result with only pos or only phonetic", () => {
      const posOnly: LookupResult = {
        ...sampleResult,
        phonetic: undefined,
      };
      const rowPos = formatTableRow(posOnly);
      expect(rowPos).toContain("| *noun* |");

      const phoneticOnly: LookupResult = {
        ...sampleResult,
        definitions: undefined,
      };
      const rowPhonetic = formatTableRow(phoneticOnly);
      expect(rowPhonetic).toContain("| `/haɪˈpɑː.θə.sɪs/` |");
    });

    it("should include transliteration [Romaji/Pinyin] in type & phonetic column when present", () => {
      const cjkResult: LookupResult = {
        query: "勉強",
        type: "word",
        contextSentence: "日本語を勉強します",
        contextSentenceClean: "日本語を勉強します",
        transliteration: "Benkyō",
        sourceLang: "ja",
        vietnameseTranslation: "học tập",
        timestamp: Date.now(),
      };
      const row = formatTableRow(cjkResult);
      expect(row).toContain("| **勉強** | `[Benkyō]` | học tập |");
    });
  });

  describe("formatCallout", () => {
    it("should format LookupResult into an Obsidian callout flashcard", () => {
      const callout = formatCallout(sampleResult);

      expect(callout).toContain("> [!vocab] hypothesis");
      expect(callout).toContain("> - **Phiên âm**: `/haɪˈpɑː.θə.sɪs/` (*noun*)");
      expect(callout).toContain("> - **Nghĩa tiếng Việt**: giả thuyết");
      expect(callout).toContain("> - **Ngữ cảnh**: The scientist proposed a bold **hypothesis** to explain the phenomenon.");
      expect(callout).toContain("> - **Thẻ**: #vocabulary #english-study");
    });

    it("should handle callout with only phonetic or only pos", () => {
      const phoneticOnly: LookupResult = {
        ...sampleResult,
        definitions: undefined,
      };
      const callout = formatCallout(phoneticOnly);
      expect(callout).toContain("> - **Phiên âm**: `/haɪˈpɑː.θə.sɪs/`");

      const posOnly: LookupResult = {
        ...sampleResult,
        phonetic: undefined,
      };
      const calloutPos = formatCallout(posOnly);
      expect(calloutPos).toContain("> - **Phiên âm**: *noun*");
    });

    it("should include language tag and transliteration for CJK / non-English vocab in callout", () => {
      const cjkResult: LookupResult = {
        query: "猫",
        type: "word",
        contextSentence: "これは猫です。",
        contextSentenceClean: "これは猫です。",
        transliteration: "Neko",
        sourceLang: "ja",
        vietnameseTranslation: "con mèo",
        timestamp: Date.now(),
      };
      const callout = formatCallout(cjkResult);
      expect(callout).toContain("> [!vocab] 猫");
      expect(callout).toContain("> - **Phiên âm**: `[Neko]`");
      expect(callout).toContain("> - **Nghĩa tiếng Việt**: con mèo");
      expect(callout).toContain("#vocab/japanese");
    });
  });

  describe("insertRowAtTableEnd", () => {
    it("ignores a vocabulary table shown as fenced code", () => {
      const example = "```markdown\n| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |\n| --- | --- | --- | --- | --- |\n```";
      const row = "| **bank** | noun | ngân hàng | A bank. | 2026-10-20 |";
      const updated = insertRowAtTableEnd(example, row);
      expect(updated).toContain(example + "\n\n## Sổ từ vựng");
      expect(updated.endsWith(row + "\n")).toBe(true);
    });
    it("should insert row right after the last table row, preserving text and subheadings after table", () => {
      const initialMarkdown = [
        "## Sổ từ vựng tiếng Anh",
        "",
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **apple** | *noun* `/ˈæp.əl/` | quả táo | I ate an **apple** | 2026-04-18 |",
        "",
        "## Ghi chú thêm",
        "Một số ghi chú quan trọng không được làm mất.",
      ].join("\n");

      const newRow = "| **banana** | *noun* `/bəˈnæn.ə/` | quả chuối | I love **banana** | 2026-04-18 |";

      const updated = insertRowAtTableEnd(initialMarkdown, newRow);

      const expected = [
        "## Sổ từ vựng tiếng Anh",
        "",
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **apple** | *noun* `/ˈæp.əl/` | quả táo | I ate an **apple** | 2026-04-18 |",
        "| **banana** | *noun* `/bəˈnæn.ə/` | quả chuối | I love **banana** | 2026-04-18 |",
        "",
        "## Ghi chú thêm",
        "Một số ghi chú quan trọng không được làm mất.",
      ].join("\n");

      expect(updated).toBe(expected);
    });

    it("should insert row into a table that ends at the end of the file", () => {
      const initialMarkdown = [
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **apple** | *noun* | quả táo | An **apple** | 2026-04-18 |",
      ].join("\n");

      const newRow = "| **banana** | *noun* | quả chuối | A **banana** | 2026-04-18 |";

      const updated = insertRowAtTableEnd(initialMarkdown, newRow);
      expect(updated).toContain("| **apple** |");
      expect(updated).toContain("| **banana** |");
      expect(updated.indexOf("| **apple** |")).toBeLessThan(updated.indexOf("| **banana** |"));
    });

    it("should initialize default template and append row when markdown has no table", () => {
      const emptyMarkdown = "";
      const newRow = "| **hypothesis** | *noun* | giả thuyết | A bold **hypothesis** | 2026-04-18 |";

      const updated = insertRowAtTableEnd(emptyMarkdown, newRow);

      expect(updated).toContain("## Sổ từ vựng tiếng Anh");
      expect(updated).toContain("| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |");
      expect(updated).toContain(newRow);
    });

    it("should initialize default template when markdown has arbitrary text but no table", () => {
      const noteMarkdown = "# General English Notes\nSome thoughts on studying.";
      const newRow = "| **test** | *noun* | bài kiểm tra | A **test** | 2026-04-18 |";

      const updated = insertRowAtTableEnd(noteMarkdown, newRow);

      expect(updated).toContain("# General English Notes");
      expect(updated).toContain("## Sổ từ vựng tiếng Anh");
      expect(updated).toContain(newRow);
    });
  });

  describe("isWordInContent", () => {
    it("should return true when word exists in table format '| **query**'", () => {
      const content = getDefaultTemplate() + "| **hypothesis** | *noun* | giả thuyết | Context. | 2026-10-20 |";
      expect(isWordInContent(content, "hypothesis")).toBe(true);
      expect(isWordInContent(content, "Hypothesis")).toBe(true);
      expect(isWordInContent(content, "HYPOTHESIS")).toBe(true);
    });

    it("should return true when word exists in callout format '> [!vocab] query'", () => {
      const content = "> [!vocab] hypothesis\n> - **Nghĩa tiếng Việt**: giả thuyết";
      expect(isWordInContent(content, "hypothesis")).toBe(true);
      expect(isWordInContent(content, "Hypothesis")).toBe(true);
    });

    it("should return false when word does not exist in content", () => {
      const content = "| **apple** | *noun* | quả táo |";
      expect(isWordInContent(content, "hypothesis")).toBe(false);
      expect(isWordInContent(content, "app")).toBe(false);
      expect(isWordInContent(content, "apples")).toBe(false);
    });

    it("should return false for empty or falsy inputs", () => {
      expect(isWordInContent("", "apple")).toBe(false);
      expect(isWordInContent("| **apple** |", "")).toBe(false);
      expect(isWordInContent("| **apple** |", "   ")).toBe(false);
    });
  });

  describe("appendContextToExisting", () => {
    it("should append new context sentence to existing table row separated by '<br>• '", () => {
      const markdown = [
        "## Sổ từ vựng tiếng Anh",
        "",
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **hypothesis** | *noun* `/haɪˈpɑː.θə.sɪs/` | giả thuyết | The scientist proposed a bold **hypothesis**. | 2026-04-18 |",
        "",
        "## Ghi chú thêm",
      ].join("\n");

      const newLookup: LookupResult = {
        ...sampleResult,
        contextSentence: "This hypothesis requires further experimental validation.",
      };

      const updated = appendContextToExisting(markdown, newLookup);

      expect(updated).toContain(
        "The scientist proposed a bold **hypothesis**.<br>• This **hypothesis** requires further experimental validation."
      );
      expect(updated).toContain("## Ghi chú thêm");
    });

    it("should not duplicate context sentence if it is already present", () => {
      const markdown = [
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **hypothesis** | *noun* | giả thuyết | A bold **hypothesis**. | 2026-04-18 |",
      ].join("\n");

      const duplicateLookup: LookupResult = {
        ...sampleResult,
        contextSentence: "A bold **hypothesis**.",
      };

      const updated = appendContextToExisting(markdown, duplicateLookup);
      expect(updated).toBe(markdown);
    });

    it("should escape pipes in the new context sentence", () => {
      const markdown = [
        "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
        "| :--- | :--- | :--- | :--- | :--- |",
        "| **hypothesis** | *noun* | giả thuyết | Initial context. | 2026-04-18 |",
      ].join("\n");

      const pipeLookup: LookupResult = {
        ...sampleResult,
        contextSentence: "Case A | Case B hypothesis.",
      };

      const updated = appendContextToExisting(markdown, pipeLookup);
      expect(updated).toContain("Case A \\| Case B **hypothesis**.");
      const row = updated.split("\n")[2];
      const parts = row.split(/(?<!\\)\|/);
      expect(parts.length).toBe(7);
    });
  });
});
