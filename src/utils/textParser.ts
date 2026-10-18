import { cleanSelection } from "./textCleaner";

export interface ExtractedContext {
  cleanContext: string; // Câu đã làm sạch thẻ Markdown, sẵn sàng gửi API
  rawContext: string; // Câu nguyên bản giữ cấu trúc bài viết để lưu vào sổ
}

/**
 * Danh sách các danh xưng (honorifics) không bao giờ là điểm kết thúc câu.
 */
const HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "rev",
  "gen",
  "rep",
  "sen",
]);

/**
 * Danh sách các từ viết tắt phổ biến trong tiếng Anh.
 */
const ABBREVIATIONS = new Set([
  ...HONORIFICS,
  "e.g",
  "eg",
  "i.e",
  "ie",
  "vs",
  "etc",
  "approx",
  "fig",
  "vol",
  "dept",
  "est",
  "no",
  "al",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "st",
]);

interface SentenceSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * Lọc bỏ toàn bộ thẻ Markdown trong một câu, chuẩn hóa khoảng trắng sẵn sàng gửi API.
 */
export function stripMarkdown(markdownText: string): string {
  if (!markdownText) return "";

  let text = markdownText;

  // 1. Loại bỏ tiền tố tiêu đề (# , ## ) và trích dẫn (> )
  text = text.replace(/^[\s>]*#{1,6}\s+/gm, "");
  text = text.replace(/^[\s>]+/gm, "");

  // 2. Ảnh: ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // 3. Wiki links: [[target|alias]] -> alias, [[target]] -> target
  text = text.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");

  // 4. Markdown links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 5. Bold & Italic kết hợp (***text*** hoặc ___text___)
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, "$1");
  text = text.replace(/___(.*?)___/g, "$1");

  // 6. Bold (**text** hoặc __text__)
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");

  // 7. Italic (*text* hoặc _text_)
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/(?<=^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1");

  // 8. Gạch ngang (~~text~~)
  text = text.replace(/~~(.*?)~~/g, "$1");

  // 9. Tô sáng (==text==)
  text = text.replace(/==(.*?)==/g, "$1");

  // 10. Mã nội dòng (`code`)
  text = text.replace(/`([^`]+)`/g, "$1");

  // 11. Chuẩn hóa xuống dòng và khoảng trắng
  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Phân tích đoạn văn thành danh sách các câu kèm tọa độ vị trí.
 */
function parseSentences(paragraph: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const len = paragraph.length;
  let sentenceStart = 0;

  let i = 0;
  while (i < len) {
    // 1. Ngắt theo phân đoạn paragraph Markdown: \n\s*\n
    if (paragraph[i] === "\n") {
      const rest = paragraph.slice(i);
      const breakMatch = rest.match(/^\n\s*\n+/);
      if (breakMatch) {
        const sentenceEnd = i;
        const text = paragraph.slice(sentenceStart, sentenceEnd).trim();
        if (text) {
          spans.push({ start: sentenceStart, end: sentenceEnd, text });
        }
        i += breakMatch[0].length;
        sentenceStart = i;
        continue;
      }
    }

    const ch = paragraph[i];

    // 2. Dấu chấm than hoặc chấm hỏi
    if (ch === "!" || ch === "?") {
      let j = i;
      while (j < len && (paragraph[j] === "!" || paragraph[j] === "?")) {
        j++;
      }
      // Bọc các dấu đóng kèm: ', ", ”, ’, ), ], *, _, ~
      while (j < len && /['"”’)\]*_~]/.test(paragraph[j])) {
        j++;
      }
      // Nếu theo sau là khoảng trắng hoặc hết chuỗi -> ranh giới câu
      if (j >= len || /\s/.test(paragraph[j])) {
        const text = paragraph.slice(sentenceStart, j).trim();
        if (text) {
          spans.push({ start: sentenceStart, end: j, text });
        }
        while (j < len && /\s/.test(paragraph[j])) {
          j++;
        }
        sentenceStart = j;
        i = j;
        continue;
      }
    } else if (ch === ".") {
      // 3. Dấu chấm kết câu
      const prevChar = i > 0 ? paragraph[i - 1] : "";
      const nextChar = i + 1 < len ? paragraph[i + 1] : "";
      const isDecimal = /\d/.test(prevChar) && /\d/.test(nextChar);

      if (!isDecimal) {
        // Trích xuất token từ trước dấu chấm
        const before = paragraph.slice(Math.max(0, i - 15), i);
        const matchToken = before.match(/([a-zA-Z]+(?:\.[a-zA-Z]+)*)$/);
        const rawToken = matchToken ? matchToken[1] : "";
        const token = rawToken.toLowerCase();

        // Kiểm tra xem ký tự sau dấu cách có viết hoa không (bắt đầu câu mới)
        let afterDot = i + 1;
        while (afterDot < len && /['"”’)\]*_~]/.test(paragraph[afterDot])) {
          afterDot++;
        }
        const whitespaceMatch = paragraph.slice(afterDot).match(/^\s+/);
        const hasWhitespaceAfter = Boolean(whitespaceMatch);
        const charAfterSpace = hasWhitespaceAfter
          ? paragraph[afterDot + whitespaceMatch![0].length]
          : "";
        const nextWordIsCapital =
          charAfterSpace && /[A-Z]/.test(charAfterSpace);

        // Quy tắc nhận diện từ viết tắt:
        // - Danh xưng (Dr., Mr., Prof...): KHÔNG BAO GIỜ là điểm ngắt câu
        // - Initial (J., K...): KHÔNG ngắt câu
        // - e.g., i.e., vs.: KHÔNG ngắt câu
        // - etc., St.: nếu theo sau là từ viết hoa thì CÓ THỂ là kết thúc câu
        let isAbbreviation = false;
        if (HONORIFICS.has(token) || (token.length === 1 && /^[a-z]$/i.test(token))) {
          isAbbreviation = true;
        } else if (token === "e.g" || token === "eg" || token === "i.e" || token === "ie" || token === "vs") {
          isAbbreviation = true;
        } else if (token === "st") {
          // St. Patrick (Saint) vs 221B Baker St. They... (Street)
          // Nếu đứng sau từ viết hoa (Baker St.) và từ tiếp theo viết hoa (They) -> là cuối câu (Street)
          const wordsBefore = before.trim().split(/\s+/);
          const prevWord = wordsBefore.length > 1 ? wordsBefore[wordsBefore.length - 2] : "";
          if (/[A-Z]/.test(prevWord[0] || "") && nextWordIsCapital) {
            isAbbreviation = false;
          } else {
            isAbbreviation = true;
          }
        } else if (token === "etc") {
          // etc. theo sau là chữ hoa -> cuối câu; nếu theo sau là chữ thường -> trong câu
          isAbbreviation = !nextWordIsCapital;
        } else if (ABBREVIATIONS.has(token) && !nextWordIsCapital) {
          isAbbreviation = true;
        }

        if (!isAbbreviation) {
          let j = i;
          while (j < len && paragraph[j] === ".") {
            j++;
          }
          while (j < len && /['"”’)\]*_~]/.test(paragraph[j])) {
            j++;
          }
          if (j >= len || /\s/.test(paragraph[j])) {
            const text = paragraph.slice(sentenceStart, j).trim();
            if (text) {
              spans.push({ start: sentenceStart, end: j, text });
            }
            while (j < len && /\s/.test(paragraph[j])) {
              j++;
            }
            sentenceStart = j;
            i = j;
            continue;
          }
        }
      }
    }

    i++;
  }

  if (sentenceStart < len) {
    const text = paragraph.slice(sentenceStart).trim();
    if (text) {
      spans.push({ start: sentenceStart, end: len, text });
    }
  }

  return spans;
}

/**
 * Tự động bôi đậm targetText trong rawContext (dạng **targetText**) nếu chưa được bôi đậm.
 * Giữ nguyên casing gốc và hỗ trợ wiki-link Obsidian.
 */
function boldTargetInRawContext(sentence: string, targetText: string): string {
  if (!sentence || !targetText) return sentence;

  const clean = cleanSelection(targetText) || targetText.trim();
  if (!clean) return sentence;

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 1. Nếu từ nằm trong wiki-link [[...target...]], bôi đậm ngoài wiki-link: **[[target]]**
  const wikiLinkRegex = new RegExp(`\\[\\[([^\\]]*?${escaped}[^\\]]*?)\\]\\]`, "i");
  const wikiMatch = sentence.match(wikiLinkRegex);
  if (wikiMatch) {
    const fullWiki = wikiMatch[0];
    const wikiIndex = wikiMatch.index!;
    const before2 = sentence.slice(Math.max(0, wikiIndex - 2), wikiIndex);
    const after2 = sentence.slice(
      wikiIndex + fullWiki.length,
      wikiIndex + fullWiki.length + 2
    );
    if (before2 === "**" && after2 === "**") {
      return sentence;
    }
    return (
      sentence.slice(0, wikiIndex) +
      `**${fullWiki}**` +
      sentence.slice(wikiIndex + fullWiki.length)
    );
  }

  // 2. Kiểm tra nếu từ đã được bôi đậm sẵn (**word**)
  const startBound = /^\w/.test(clean) ? "\\b" : "";
  const endBound = /\w$/.test(clean) ? "\\b" : "";
  const alreadyBoldRegex = new RegExp(
    `\\*\\*(${startBound}${escaped}${endBound})\\*\\*`,
    "i"
  );
  if (alreadyBoldRegex.test(sentence)) {
    return sentence;
  }

  // 3. Bôi đậm từ xuất hiện chưa có asterisks
  const unboldedRegex = new RegExp(
    `(?<!\\*\\*)(${startBound}${escaped}${endBound})(?!\\*\\*)`,
    "i"
  );
  const match = sentence.match(unboldedRegex);
  if (match && match.index !== undefined) {
    const matchedText = match[1];
    return (
      sentence.slice(0, match.index) +
      `**${matchedText}**` +
      sentence.slice(match.index + matchedText.length)
    );
  }

  return sentence;
}

/**
 * Trích xuất câu văn chứa targetText trong đoạn văn (paragraph).
 * - Sử dụng thuật toán nhận diện ranh giới câu thông minh (. ! ? hoặc đầu/cuối đoạn).
 * - Bỏ qua các từ viết tắt phổ biến: Mr., Mrs., Ms., Dr., Prof., e.g., i.e., vs., etc., approx., St.
 * - Bỏ qua số thập phân: 3.14, 0.05, $100.50
 * - Hoạt động chính xác trên cả đoạn văn có xuống dòng (multiline).
 * - Tự động bôi đậm targetText trong rawContext (dạng **targetText**) nếu chưa được bôi đậm.
 */
export function extractContextSentence(
  paragraph: string,
  targetText: string,
  cursorOffset?: number
): ExtractedContext {
  if (!paragraph || !paragraph.trim()) {
    return { cleanContext: "", rawContext: "" };
  }

  const cleanTarget = cleanSelection(targetText) || targetText.trim();

  const spans = parseSentences(paragraph);

  if (spans.length === 0) {
    const raw = paragraph.trim();
    return {
      cleanContext: stripMarkdown(raw),
      rawContext: boldTargetInRawContext(raw, targetText),
    };
  }

  // Tìm các câu có chứa cleanTarget
  const escapedTarget = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetRegex = escapedTarget
    ? new RegExp(escapedTarget, "i")
    : null;

  const candidateSpans = targetRegex
    ? spans.filter((s) => targetRegex.test(s.text))
    : spans;

  let selectedSpan: SentenceSpan;

  if (candidateSpans.length === 0) {
    // Nếu không tìm thấy trong từng câu, fallback tìm theo cursorOffset hoặc câu đầu tiên
    if (cursorOffset !== undefined) {
      selectedSpan =
        spans.find((s) => s.start <= cursorOffset && cursorOffset <= s.end) ||
        spans.reduce((prev, curr) => {
          const prevDist = Math.abs((prev.start + prev.end) / 2 - cursorOffset);
          const currDist = Math.abs((curr.start + curr.end) / 2 - cursorOffset);
          return currDist < prevDist ? curr : prev;
        });
    } else {
      selectedSpan = spans[0];
    }
  } else if (candidateSpans.length === 1 || cursorOffset === undefined) {
    selectedSpan = candidateSpans[0];
  } else {
    // Có nhiều câu chứa targetText và có cursorOffset
    selectedSpan =
      candidateSpans.find(
        (s) => s.start <= cursorOffset && cursorOffset <= s.end
      ) ||
      candidateSpans.reduce((prev, curr) => {
        const prevDist = Math.abs((prev.start + prev.end) / 2 - cursorOffset);
        const currDist = Math.abs((curr.start + curr.end) / 2 - cursorOffset);
        return currDist < prevDist ? curr : prev;
      });
  }

  const cleanContext = stripMarkdown(selectedSpan.text);
  const rawContext = boldTargetInRawContext(selectedSpan.text, targetText);

  return { cleanContext, rawContext };
}
