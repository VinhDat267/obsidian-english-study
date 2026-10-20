import type { MarkdownPostProcessorContext } from "obsidian";
import type { ReadingHighlightService } from "../services/storage/ReadingHighlightService";
import { HIGHLIGHT_COLORS } from "../utils/textHighlighter";
import type { ReadingHighlightItem } from "../types";
import { wrapRangeWithHighlight } from "../utils/domHighlightHelper";

const EXCLUDED_SELECTOR =
  'script, style, pre, code, textarea, input, button, .cm-editor, [contenteditable]:not([contenteditable="false"])';

interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
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

function requiresWordBoundary(char: string): boolean {
  // Han and Japanese scripts do not require spaces between selected words.
  return isWordChar(char) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char);
}

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
  if (!root || !highlights || highlights.length === 0) return;

  // Flatten queries (include line-split fallback for multi-paragraph selections)
  const expandedHighlights: ReadingHighlightItem[] = [];
  for (const hl of highlights) {
    if (!hl.text) continue;
    const trimmed = hl.text.trim();
    if (trimmed.length < 2) continue;
    expandedHighlights.push(hl);

    if (hl.text.includes("\n")) {
      const lines = hl.text.split("\n");
      for (const line of lines) {
        const lineTrimmed = line.trim();
        if (lineTrimmed.length >= 2 && lineTrimmed !== trimmed) {
          expandedHighlights.push({
            id: hl.id,
            text: lineTrimmed,
            color: hl.color,
            timestamp: hl.timestamp,
          });
        }
      }
    }
  }

  // Sort by text length descending so longer phrases match before sub-phrases
  const sortedHighlights = expandedHighlights.sort(
    (a, b) => b.text.length - a.text.length
  );

  // If root contains block elements, process each block; otherwise process root directly
  const blocks = root.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, blockquote, tr, td, th"
  );
  if (blocks.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      processBlockElement(blocks[i] as HTMLElement, sortedHighlights);
    }
  } else {
    processBlockElement(root, sortedHighlights);
  }
}

function collectTextNodes(node: Node, results: Text[]): void {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.nodeValue && node.nodeValue.length > 0) {
      results.push(node as Text);
    }
    return;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (typeof el.closest === "function" && el.closest(EXCLUDED_SELECTOR)) return;
    if (el.classList?.contains("polyglot-reading-highlight")) return;

    for (let i = 0; i < el.childNodes.length; i++) {
      collectTextNodes(el.childNodes[i], results);
    }
  }
}

function processBlockElement(
  blockEl: HTMLElement,
  highlights: ReadingHighlightItem[]
): void {
  if (!blockEl) return;
  if (typeof blockEl.closest === "function" && blockEl.closest(EXCLUDED_SELECTOR)) return;
  if (blockEl.classList?.contains("polyglot-reading-highlight")) return;

  const textNodes: Text[] = [];
  collectTextNodes(blockEl, textNodes);
  if (textNodes.length === 0) return;

  // Build cumulative text and track character ranges for each text node
  let fullText = "";
  const nodeInfos: TextNodeInfo[] = [];

  for (const node of textNodes) {
    const val = node.nodeValue || "";
    const start = fullText.length;
    const end = start + val.length;
    nodeInfos.push({ node, start, end });
    fullText += val;
  }

  if (fullText.trim().length === 0) return;

  const lowerFullText = fullText.toLowerCase();
  const matches: MatchRange[] = [];

  for (const hl of highlights) {
    const query = hl.text.trim();
    if (query.length < 2) continue;

    const lowerQuery = query.toLowerCase();
    let pos = lowerFullText.indexOf(lowerQuery);

    const firstChar = query[0];
    const lastChar = query[query.length - 1];
    const queryStartsWord = requiresWordBoundary(firstChar);
    const queryEndsWord = requiresWordBoundary(lastChar);

    while (pos !== -1) {
      const prevChar = pos > 0 ? fullText[pos - 1] : "";
      const nextChar =
        pos + query.length < fullText.length ? fullText[pos + query.length] : "";

      const wordStartOk = !queryStartsWord || !prevChar || !isWordChar(prevChar);
      const wordEndOk = !queryEndsWord || !nextChar || !isWordChar(nextChar);

      if (wordStartOk && wordEndOk) {
        matches.push({
          start: pos,
          end: pos + query.length,
          highlight: hl,
        });
      }

      pos = lowerFullText.indexOf(lowerQuery, pos + query.length);
    }
  }

  if (matches.length === 0) return;

  // Sort matches by start position ascending, longest first on tie
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Filter overlapping matches
  const nonOverlapping: MatchRange[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  if (nonOverlapping.length === 0) return;

  const ownerDoc = blockEl.ownerDocument || document;
  const excludedElements = Array.from(blockEl.querySelectorAll(EXCLUDED_SELECTOR));

  // Process matches in REVERSE order (from end of block to start)
  // This ensures that DOM modifications at later positions do NOT invalidate node offsets of earlier matches!
  for (let i = nonOverlapping.length - 1; i >= 0; i--) {
    const match = nonOverlapping[i];

    // Find start node and offset
    const startInfo = nodeInfos.find(
      (info) => match.start >= info.start && match.start < info.end
    );
    // Find end node and offset
    const endInfo = nodeInfos.find(
      (info) => match.end > info.start && match.end <= info.end
    );

    if (!startInfo || !endInfo) continue;

    const startOffset = match.start - startInfo.start;
    const endOffset = match.end - endInfo.start;

    try {
      const range = ownerDoc.createRange();
      range.setStart(startInfo.node, startOffset);
      range.setEnd(endInfo.node, endOffset);
      if (excludedElements.some(element => range.intersectsNode(element))) continue;

      const colorDef = HIGHLIGHT_COLORS[match.highlight.color];
      const bg = colorDef?.bg || "rgba(250, 204, 21, 0.4)";

      wrapRangeWithHighlight(
        range,
        match.highlight.id,
        match.highlight.color,
        bg
      );
    } catch {}
  }
}
