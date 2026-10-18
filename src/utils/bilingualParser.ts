import { BilingualStyle, MarkdownBlock, MarkdownBlockType } from "../types";

/**
 * Phân tích nội dung Markdown thành các khối (blocks) có phân loại rõ ràng:
 * - Khối kỹ thuật (YAML, Code block, LaTeX Math, Table): Đánh dấu skipTranslation = true.
 * - Khối văn bản dịch (Heading, Paragraph, List item, Multiple choice option): translatableText.
 * - Khối bản dịch cũ (dòng > *...*): Đánh dấu để chống dịch trùng lặp.
 */
export function parseMarkdownIntoBlocks(content: string): MarkdownBlock[] {
  if (!content) return [];

  const rawLines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  let idCounter = 1;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. YAML Frontmatter (chỉ xét ở đầu file)
    if (i === 0 && trimmed === "---") {
      let fmEnd = -1;
      for (let j = 1; j < rawLines.length; j++) {
        if (rawLines[j].trim() === "---") {
          fmEnd = j;
          break;
        }
      }
      if (fmEnd !== -1) {
        const fmLines = rawLines.slice(i, fmEnd + 1);
        blocks.push({
          id: `block-${idCounter++}`,
          type: "frontmatter",
          rawText: fmLines.join("\n"),
          skipTranslation: true,
        });
        i = fmEnd + 1;
        continue;
      }
    }

    // 2. Fenced Code Block (``` hoặc ~~~)
    const codeMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (codeMatch) {
      const fence = codeMatch[2];
      const fenceChar = fence[0];
      const minLength = fence.length;
      let codeEnd = -1;

      for (let j = i + 1; j < rawLines.length; j++) {
        const closeMatch = rawLines[j].match(/^(\s*)(`{3,}|~{3,})\s*$/);
        if (
          closeMatch &&
          closeMatch[2][0] === fenceChar &&
          closeMatch[2].length >= minLength
        ) {
          codeEnd = j;
          break;
        }
      }

      if (codeEnd !== -1) {
        const codeLines = rawLines.slice(i, codeEnd + 1);
        blocks.push({
          id: `block-${idCounter++}`,
          type: "code_block",
          rawText: codeLines.join("\n"),
          skipTranslation: true,
        });
        i = codeEnd + 1;
        continue;
      }
    }

    // 3. LaTeX Math Block ($$)
    if (trimmed === "$$" || trimmed.startsWith("$$")) {
      let mathEnd = -1;
      if (trimmed.endsWith("$$") && trimmed.length > 2 && !trimmed.startsWith("$$$")) {
        // Single-line $$ ... $$
        mathEnd = i;
      } else {
        for (let j = i + 1; j < rawLines.length; j++) {
          if (rawLines[j].trim().endsWith("$$")) {
            mathEnd = j;
            break;
          }
        }
      }

      if (mathEnd !== -1) {
        const mathLines = rawLines.slice(i, mathEnd + 1);
        blocks.push({
          id: `block-${idCounter++}`,
          type: "math_block",
          rawText: mathLines.join("\n"),
          skipTranslation: true,
        });
        i = mathEnd + 1;
        continue;
      }
    }

    // 4. Markdown Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      let tableEnd = i;
      while (
        tableEnd + 1 < rawLines.length &&
        rawLines[tableEnd + 1].trim().startsWith("|") &&
        rawLines[tableEnd + 1].trim().endsWith("|")
      ) {
        tableEnd++;
      }

      // Kiểm tra có dòng separator | --- | không
      const tableLines = rawLines.slice(i, tableEnd + 1);
      const hasSeparator = tableLines.some((l) =>
        /\|\s*[-:]+[-| :]*\|/.test(l.trim())
      );

      if (hasSeparator) {
        blocks.push({
          id: `block-${idCounter++}`,
          type: "table",
          rawText: tableLines.join("\n"),
          skipTranslation: true,
        });
        i = tableEnd + 1;
        continue;
      }
    }

    // 5. Blank line
    if (!trimmed) {
      blocks.push({
        id: `block-${idCounter++}`,
        type: "blank_line",
        rawText: line,
        skipTranslation: true,
      });
      i++;
      continue;
    }

    // 6. Blockquote (kiểm tra xem có phải bản dịch song ngữ cũ không)
    if (trimmed.startsWith(">")) {
      blocks.push({
        id: `block-${idCounter++}`,
        type: "existing_translation",
        rawText: line,
        skipTranslation: true,
      });
      i++;
      continue;
    }

    // 7. Heading (# Title)
    const headingMatch = line.match(/^(\s*)(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const indent = headingMatch[1] || "";
      const prefix = headingMatch[2] + " ";
      const text = headingMatch[3].trim();
      blocks.push({
        id: `block-${idCounter++}`,
        type: "heading",
        rawText: line,
        translatableText: text,
        indent,
        listPrefix: prefix,
        skipTranslation: false,
      });
      i++;
      continue;
    }

    // 8. Multiple choice question options (A. Option / B) Option)
    const mcMatch = line.match(/^(\s*)([A-Z][\.\)])\s+(.*)$/);
    if (mcMatch) {
      const indent = mcMatch[1] || "";
      const prefix = mcMatch[2] + " ";
      blocks.push({
        id: `block-${idCounter++}`,
        type: "multiple_choice",
        rawText: line,
        translatableText: line.trim(),
        indent,
        listPrefix: prefix,
        skipTranslation: false,
      });
      i++;
      continue;
    }

    // 9. List Item (- item, * item, 1. item)
    const listMatch = line.match(/^(\s*)([-*+]|\d+[\.\)])\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1] || "";
      const prefix = listMatch[2] + " ";
      const text = listMatch[3].trim();
      blocks.push({
        id: `block-${idCounter++}`,
        type: "list_item",
        rawText: line,
        translatableText: text,
        indent,
        listPrefix: prefix,
        skipTranslation: false,
      });
      i++;
      continue;
    }

    // 10. Paragraph (có thể là đoạn 1 dòng hoặc nhiều dòng liền kề)
    const pLines: string[] = [line];
    let nextIdx = i + 1;
    while (nextIdx < rawLines.length) {
      const nextLine = rawLines[nextIdx];
      const nextTrimmed = nextLine.trim();

      // Dừng lại nếu gặp dòng trống, heading, list, code block, table, math, blockquote
      if (
        !nextTrimmed ||
        nextTrimmed.startsWith("#") ||
        nextTrimmed.startsWith("```") ||
        nextTrimmed.startsWith("~~~") ||
        nextTrimmed.startsWith("$$") ||
        nextTrimmed.startsWith(">") ||
        /^(\s*)([-*+]|\d+[\.\)])\s+/.test(nextLine) ||
        /^(\s*)([A-Z][\.\)])\s+/.test(nextLine) ||
        (nextTrimmed.startsWith("|") && nextTrimmed.endsWith("|"))
      ) {
        break;
      }
      pLines.push(nextLine);
      nextIdx++;
    }

    const pRawText = pLines.join("\n");
    blocks.push({
      id: `block-${idCounter++}`,
      type: "paragraph",
      rawText: pRawText,
      translatableText: pRawText.trim(),
      skipTranslation: false,
    });
    i = nextIdx;
  }

  // 11. Hậu xử lý chống dịch đè (Anti-double translation):
  // Nếu block[k] là translatable, và ngay bên dưới là block[k+1] có dạng `existing_translation` (> *...* hoặc > ...)
  for (let k = 0; k < blocks.length; k++) {
    const cur = blocks[k];
    if (!cur.skipTranslation) {
      // Tìm block có nội dung kế tiếp
      let nextContentBlock: MarkdownBlock | null = null;
      for (let m = k + 1; m < blocks.length; m++) {
        if (blocks[m].type !== "blank_line") {
          nextContentBlock = blocks[m];
          break;
        }
      }
      if (nextContentBlock && nextContentBlock.type === "existing_translation") {
        cur.skipTranslation = true;
      }
    }
  }

  return blocks;
}

/**
 * Định dạng khối song ngữ theo phong cách được chọn
 */
export function formatBilingualBlock(
  original: string,
  translated: string,
  style: BilingualStyle,
  indent: string = ""
): string {
  if (!translated || !translated.trim()) {
    return original;
  }

  const cleanTranslated = translated.trim();

  switch (style) {
    case "colored":
      return `${original}\n${indent}<font color="var(--text-accent)">*${cleanTranslated}*</font>`;
    case "highlight":
      return `${original}\n${indent}==*${cleanTranslated}*==`;
    case "bold_prefix":
      return `${original}\n${indent}**[VI]** ${cleanTranslated}`;
    case "blockquote":
    default:
      return `${original}\n${indent}> *${cleanTranslated}*`;
  }
}

/**
 * Tái cấu trúc danh sách các block đã dịch thành nội dung file Markdown hoàn chỉnh
 */
export function reassembleBilingualMarkdown(
  blocks: MarkdownBlock[],
  style: BilingualStyle
): string {
  const resultLines: string[] = [];

  for (const block of blocks) {
    if (block.skipTranslation || !block.translatedText) {
      resultLines.push(block.rawText);
    } else {
      const formatted = formatBilingualBlock(
        block.rawText,
        block.translatedText,
        style,
        block.indent || ""
      );
      resultLines.push(formatted);
    }
  }

  return resultLines.join("\n");
}
