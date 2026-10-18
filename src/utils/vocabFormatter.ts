import { LookupResult } from "../types";

/**
 * Returns default initialization template for Vocabulary.md if note doesn't exist yet.
 */
export function getDefaultTemplate(): string {
  return [
    "## Sổ từ vựng tiếng Anh",
    "",
    "| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |",
    "| :--- | :--- | :--- | :--- | :--- |",
    "",
  ].join("\n");
}

/**
 * Escapes pipe character '|' to '\|' and replaces newlines with space
 * to ensure markdown table safety.
 */
export function escapePipes(text: string): string {
  if (!text) return "";
  // 1. Replace all newlines with a single space
  let safe = text.replace(/\r?\n|\r/g, " ");
  // 2. Normalize already escaped pipes, then escape all pipes
  safe = safe.replace(/\\\|/g, "|").replace(/\|/g, "\\|");
  return safe;
}

/**
 * Automatically bolds the target query word within context sentence if not already bolded.
 */
export function highlightWordInContext(sentence: string, word: string): string {
  if (!sentence || !word) return sentence || "";
  const trimmedWord = word.trim();
  if (!trimmedWord) return sentence;

  // Check if already bolded as **word** (case-insensitive)
  const escapedWord = trimmedWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyBoldRegex = new RegExp(`\\*\\*${escapedWord}\\*\\*`, "i");
  if (alreadyBoldRegex.test(sentence)) {
    return sentence;
  }

  // Use word boundary if alphanumeric
  const isAlpha = /^[a-zA-Z0-9_-]+$/.test(trimmedWord);
  const pattern = isAlpha ? `\\b(${escapedWord})\\b` : `(${escapedWord})`;
  const wordRegex = new RegExp(pattern, "i");

  if (wordRegex.test(sentence)) {
    return sentence.replace(wordRegex, "**$1**");
  }
  return sentence;
}

/**
 * Formats a Date/timestamp to YYYY-MM-DD.
 */
function formatDate(timestamp?: number): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats LookupResult as a row in a Markdown Table:
 * | **query** | *pos* `/phonetic/` | vietnameseTranslation | contextSentence | YYYY-MM-DD |
 */
export function formatTableRow(result: LookupResult, highlightWord: boolean = true): string {
  const query = escapePipes(result.query.trim());

  // Format pos and phonetic
  const pos = result.definitions?.[0]?.partOfSpeech?.trim();
  let phonetic = result.phonetic?.trim();
  if (phonetic) {
    if (!phonetic.startsWith("/")) phonetic = `/${phonetic}`;
    if (!phonetic.endsWith("/")) phonetic = `${phonetic}/`;
  }

  let typePhonetic = "-";
  if (pos && phonetic) {
    typePhonetic = `*${escapePipes(pos)}* \`${escapePipes(phonetic)}\``;
  } else if (pos) {
    typePhonetic = `*${escapePipes(pos)}*`;
  } else if (phonetic) {
    typePhonetic = `\`${escapePipes(phonetic)}\``;
  }

  const translation = escapePipes(result.vietnameseTranslation?.trim() || "");

  // Format context sentence
  let sentence = result.contextSentence || "";
  if (highlightWord) {
    sentence = highlightWordInContext(sentence, result.query);
  }
  const escapedContext = escapePipes(sentence.trim());

  const date = formatDate(result.timestamp);

  return `| **${query}** | ${typePhonetic} | ${translation} | ${escapedContext} | ${date} |`;
}

/**
 * Formats LookupResult as an Obsidian Callout block:
 * > [!vocab] query
 * > - **Phiên âm**: ...
 * > - **Nghĩa tiếng Việt**: ...
 * > - **Ngữ cảnh**: ...
 * > - **Thẻ**: #vocabulary #english-study
 */
export function formatCallout(result: LookupResult): string {
  const query = result.query.trim();

  const pos = result.definitions?.[0]?.partOfSpeech?.trim();
  let phonetic = result.phonetic?.trim();
  if (phonetic) {
    if (!phonetic.startsWith("/")) phonetic = `/${phonetic}`;
    if (!phonetic.endsWith("/")) phonetic = `${phonetic}/`;
  }

  let phoneticLine = "-";
  if (pos && phonetic) {
    phoneticLine = `\`${phonetic}\` (*${pos}*)`;
  } else if (pos) {
    phoneticLine = `*${pos}*`;
  } else if (phonetic) {
    phoneticLine = `\`${phonetic}\``;
  }

  const context = highlightWordInContext(result.contextSentence || "", result.query).trim();

  return [
    `> [!vocab] ${query}`,
    `> - **Phiên âm**: ${phoneticLine}`,
    `> - **Nghĩa tiếng Việt**: ${result.vietnameseTranslation?.trim() || "-"}`,
    `> - **Ngữ cảnh**: ${context || "-"}`,
    `> - **Thẻ**: #vocabulary #english-study`,
  ].join("\n");
}

/**
 * Inserts a new row at the end of the markdown table:
 * - Finds the last row of the existing table (lines starting with '|')
 * - Inserts 'row' right after the last table row
 * - Preserves any trailing content, subheadings, or blank lines
 * - If markdown does not have a table, initializes with getDefaultTemplate() + row
 */
export function insertRowAtTableEnd(markdown: string, row: string): string {
  const lines = markdown.split(/\r?\n/);

  // Identify contiguous table blocks
  interface TableBlock {
    start: number;
    end: number;
    hasVocabHeader: boolean;
  }

  const blocks: TableBlock[] = [];
  let currentBlock: TableBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const isTableLine = lines[i].trim().startsWith("|");
    if (isTableLine) {
      if (!currentBlock) {
        currentBlock = { start: i, end: i, hasVocabHeader: false };
      } else {
        currentBlock.end = i;
      }
      if (
        lines[i].toLowerCase().includes("từ / cụm từ") ||
        lines[i].toLowerCase().includes("loại từ & phiên âm")
      ) {
        currentBlock.hasVocabHeader = true;
      }
    } else {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // If no table exists, initialize with default template
  if (blocks.length === 0) {
    const template = getDefaultTemplate().trimEnd();
    const trimmedMarkdown = markdown.trim();
    if (!trimmedMarkdown) {
      return `${template}\n${row}\n`;
    }
    return `${markdown.trimEnd()}\n\n${template}\n${row}\n`;
  }

  // Pick target table block (vocab table preferred, otherwise first block)
  const targetBlock = blocks.find((b) => b.hasVocabHeader) || blocks[0];

  lines.splice(targetBlock.end + 1, 0, row);
  return lines.join("\n");
}

/**
 * Checks whether the word (query) already exists in note content:
 * - Matches table format: '| **query**' (case-insensitive)
 * - Matches callout format: '> [!vocab] query' (case-insensitive)
 */
export function isWordInContent(markdown: string, query: string): boolean {
  if (!markdown || !query || !query.trim()) {
    return false;
  }

  const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Table row check
  const tableRegex = new RegExp(`^[ \\t]*\\|[ \\t]*\\*\\*[ \\t]*${escapedQuery}[ \\t]*\\*\\*`, "im");
  if (tableRegex.test(markdown)) {
    return true;
  }

  // Callout header check
  const calloutRegex = new RegExp(`^[ \\t]*>[ \\t]*\\[!vocab\\][ \\t]*${escapedQuery}[ \\t]*$`, "im");
  if (calloutRegex.test(markdown)) {
    return true;
  }

  return false;
}

/**
 * When a word already exists in the table, appends new context sentence
 * to the context column separated by '<br>• ' rather than duplicating rows.
 */
export function appendContextToExisting(markdown: string, result: LookupResult): string {
  if (!markdown || !result || !result.query) {
    return markdown;
  }

  const queryLower = result.query.trim().toLowerCase();
  const lines = markdown.split(/\r?\n/);
  let updated = false;

  let newSentence = result.contextSentence || "";
  newSentence = highlightWordInContext(newSentence, result.query);
  newSentence = escapePipes(newSentence).trim();

  if (!newSentence) {
    return markdown;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("|")) {
      const match = line.match(/^[ \t]*\|[ \t]*\*\*[ \t]*(.+?)[ \t]*\*\*/i);
      if (match && match[1].trim().toLowerCase() === queryLower) {
        // Split columns by unescaped pipe
        const cols = line.split(/(?<!\\)\|/);
        // Col indices: 0: '', 1: query, 2: pos/phonetic, 3: translation, 4: context, 5: date, 6: ''
        if (cols.length >= 6) {
          const existingContext = cols[4].trim();
          if (existingContext && existingContext.includes(newSentence)) {
            return markdown;
          }

          if (!existingContext || existingContext === "-") {
            cols[4] = ` ${newSentence} `;
          } else {
            cols[4] = ` ${existingContext}<br>• ${newSentence} `;
          }

          lines[i] = cols.join("|");
          updated = true;
          break;
        }
      }
    }
  }

  return updated ? lines.join("\n") : markdown;
}
