import { describe, it, expect } from "vitest";
import {
  applyHighlight,
  stripHighlight,
  getHighlightColor,
  HIGHLIGHT_COLORS,
  HighlightColorKey,
} from "../../src/utils/textHighlighter";

describe("textHighlighter", () => {
  describe("stripHighlight", () => {
    it("should return unchanged text if no highlight exists", () => {
      expect(stripHighlight("plain text")).toBe("plain text");
      expect(stripHighlight("")).toBe("");
      expect(stripHighlight("   ")).toBe("   ");
    });

    it("should strip markdown ==text== highlight", () => {
      expect(stripHighlight("==highlighted==")).toBe("highlighted");
      expect(stripHighlight("  ==highlighted==  ")).toBe("  highlighted  ");
      expect(stripHighlight("==multi word highlight==")).toBe("multi word highlight");
    });

    it("should strip HTML <mark> highlight", () => {
      expect(
        stripHighlight(
          '<mark style="background-color: rgba(34, 197, 94, 0.35); color: inherit;">green text</mark>'
        )
      ).toBe("green text");
      expect(
        stripHighlight(
          '  <mark style="background-color: #bbf7d0;">spaced text</mark>  '
        )
      ).toBe("  spaced text  ");
    });

    it("should strip both markdown and mark tags if nested or mixed", () => {
      expect(stripHighlight("==<mark>mixed</mark>==")).toBe("mixed");
    });
  });

  describe("getHighlightColor", () => {
    it("should detect yellow for ==text==", () => {
      expect(getHighlightColor("==hello==")).toBe("yellow");
      expect(getHighlightColor("  ==hello==  ")).toBe("yellow");
    });

    it("should detect specific color for <mark> based on style", () => {
      expect(
        getHighlightColor(
          '<mark style="background-color: rgba(34, 197, 94, 0.35); color: inherit;">green</mark>'
        )
      ).toBe("green");
      expect(
        getHighlightColor(
          '<mark style="background-color: rgba(59, 130, 246, 0.35); color: inherit;">blue</mark>'
        )
      ).toBe("blue");
    });

    it("should return null for unhighlighted text", () => {
      expect(getHighlightColor("plain text")).toBeNull();
    });
  });

  describe("applyHighlight", () => {
    it("should return empty string or whitespace when input has no content", () => {
      expect(applyHighlight("", "yellow")).toBe("");
      expect(applyHighlight("   ", "yellow")).toBe("   ");
    });

    it("should wrap plain text with ==text== when color is yellow", () => {
      expect(applyHighlight("effective", "yellow")).toBe("==effective==");
    });

    it("should preserve leading and trailing whitespace outside the highlight wrapper", () => {
      expect(applyHighlight("  strategy  ", "yellow")).toBe("  ==strategy==  ");
      expect(applyHighlight("\nimportant\n", "green")).toBe(
        `\n<mark style="background-color: ${HIGHLIGHT_COLORS.green.bg}; color: inherit;">important</mark>\n`
      );
    });

    it("should wrap text with <mark> when color is green, blue, pink, purple, or orange", () => {
      const greenResult = applyHighlight("success", "green");
      expect(greenResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.green.bg}; color: inherit;">success</mark>`
      );

      const blueResult = applyHighlight("sky", "blue");
      expect(blueResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.blue.bg}; color: inherit;">sky</mark>`
      );

      const pinkResult = applyHighlight("flower", "pink");
      expect(pinkResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.pink.bg}; color: inherit;">flower</mark>`
      );

      const purpleResult = applyHighlight("royal", "purple");
      expect(purpleResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.purple.bg}; color: inherit;">royal</mark>`
      );

      const orangeResult = applyHighlight("sunset", "orange");
      expect(orangeResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.orange.bg}; color: inherit;">sunset</mark>`
      );
    });

    it("should toggle off (remove highlight) if the text already has the SAME highlight color", () => {
      expect(applyHighlight("==already yellow==", "yellow")).toBe("already yellow");
      expect(applyHighlight("  ==already yellow==  ", "yellow")).toBe("  already yellow  ");

      const greenMarkup = `<mark style="background-color: ${HIGHLIGHT_COLORS.green.bg}; color: inherit;">green text</mark>`;
      expect(applyHighlight(greenMarkup, "green")).toBe("green text");
    });

    it("should replace old highlight color with new color without nesting tags", () => {
      // Yellow -> Blue
      const yellowText = "==previously yellow==";
      const blueResult = applyHighlight(yellowText, "blue");
      expect(blueResult).toBe(
        `<mark style="background-color: ${HIGHLIGHT_COLORS.blue.bg}; color: inherit;">previously yellow</mark>`
      );
      expect(blueResult).not.toContain("==");

      // Blue -> Yellow
      const blueText = `<mark style="background-color: ${HIGHLIGHT_COLORS.blue.bg}; color: inherit;">previously blue</mark>`;
      const yellowResult = applyHighlight(blueText, "yellow");
      expect(yellowResult).toBe("==previously blue==");
      expect(yellowResult).not.toContain("<mark");
    });

    it("should strip highlight when color is 'clear'", () => {
      expect(applyHighlight("==yellow==", "clear")).toBe("yellow");
      expect(
        applyHighlight(
          `<mark style="background-color: ${HIGHLIGHT_COLORS.pink.bg}; color: inherit;">pink</mark>`,
          "clear"
        )
      ).toBe("pink");
      expect(applyHighlight("plain", "clear")).toBe("plain");
    });
  });
});
