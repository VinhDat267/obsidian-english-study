import type { MarkdownPostProcessorContext } from "obsidian";
import type { ReadingHighlightService } from "../services/storage/ReadingHighlightService";
import { HIGHLIGHT_COLORS } from "../utils/textHighlighter";
import type { ReadingHighlightItem } from "../types";

const FORBIDDEN_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "PRE",
  "CODE",
  "TEXTAREA",
  "INPUT",
  "BUTTON",
]);

export function createReadingHighlightPostProcessor(
  service: ReadingHighlightService
): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!ctx || !ctx.sourcePath || !el) return;

    const highlights = service.getHighlights(ctx.sourcePath);
    if (!highlights || highlights.length === 0) return;

    applyHighlightsToElement(el, highlights);
  };
}

export function applyHighlightsToElement(
  root: HTMLElement,
  highlights: ReadingHighlightItem[]
): void {
  // Sort highlights by length descending to match longest phrases first
  const sortedHighlights = [...highlights].sort(
    (a, b) => b.text.length - a.text.length
  );

  const textNodes: Text[] = [];
  collectTextNodes(root, textNodes);

  for (const textNode of textNodes) {
    processTextNode(textNode, sortedHighlights);
  }
}

function collectTextNodes(node: Node, results: Text[]): void {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.nodeValue && node.nodeValue.trim().length > 0) {
      results.push(node as Text);
    }
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (FORBIDDEN_TAGS.has(el.tagName.toUpperCase())) return;
    if (el.classList?.contains("polyglot-reading-highlight")) return;

    for (let i = 0; i < el.childNodes.length; i++) {
      collectTextNodes(el.childNodes[i], results);
    }
  }
}

interface MatchRange {
  start: number;
  end: number;
  highlight: ReadingHighlightItem;
}

function isWordChar(char: string): boolean {
  if (!char) return false;
  return /[\p{L}\p{N}_]/u.test(char);
}

function processTextNode(
  textNode: Text,
  highlights: ReadingHighlightItem[]
): void {
  const text = textNode.nodeValue;
  if (!text) return;

  const matches: MatchRange[] = [];

  for (const hl of highlights) {
    const rawQuery = hl.text;
    if (!rawQuery) continue;
    const query = rawQuery.trim();
    if (query.length < 2) continue; // Ignore accidental single-character or blank highlights

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let pos = lowerText.indexOf(lowerQuery);

    const firstChar = query[0];
    const lastChar = query[query.length - 1];
    const queryStartsWord = isWordChar(firstChar);
    const queryEndsWord = isWordChar(lastChar);

    while (pos !== -1) {
      const prevChar = pos > 0 ? text[pos - 1] : "";
      const nextChar = pos + query.length < text.length ? text[pos + query.length] : "";

      const wordStartOk = !queryStartsWord || !prevChar || !isWordChar(prevChar);
      const wordEndOk = !queryEndsWord || !nextChar || !isWordChar(nextChar);

      if (wordStartOk && wordEndOk) {
        matches.push({
          start: pos,
          end: pos + query.length,
          highlight: hl,
        });
      }

      pos = lowerText.indexOf(lowerQuery, pos + query.length);
    }
  }

  if (matches.length === 0) return;

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping: MatchRange[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  if (nonOverlapping.length === 0) return;

  const parent = textNode.parentNode;
  if (!parent) return;

  const ownerDoc = textNode.ownerDocument || document;
  const fragment = ownerDoc.createDocumentFragment();
  let cursor = 0;

  for (const match of nonOverlapping) {
    if (match.start > cursor) {
      fragment.appendChild(
        ownerDoc.createTextNode(text.substring(cursor, match.start))
      );
    }

    const mark = ownerDoc.createElement("mark");
    mark.className = "polyglot-reading-highlight";
    mark.setAttribute("data-highlight-id", match.highlight.id);
    mark.setAttribute("data-color", match.highlight.color);
    const colorDef = HIGHLIGHT_COLORS[match.highlight.color];
    const bg = colorDef?.bg || "rgba(250, 204, 21, 0.4)";
    mark.style.backgroundColor = bg;
    mark.style.color = "inherit";
    mark.textContent = text.substring(match.start, match.end);

    fragment.appendChild(mark);
    cursor = match.end;
  }

  if (cursor < text.length) {
    fragment.appendChild(ownerDoc.createTextNode(text.substring(cursor)));
  }

  parent.replaceChild(fragment, textNode);
}
