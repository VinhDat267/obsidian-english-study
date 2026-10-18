/**
 * Tập hợp các dấu câu và ký tự đặc biệt bọc ngoài thường gặp khi bôi đen text.
 */
const OUTER_PUNCTUATION = new Set([
  '"',
  "'",
  "“",
  "”",
  "‘",
  "’",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ";",
  ":",
  ".",
  "!",
  "?",
  "`",
  "*",
  "_",
  "~",
  "=",
]);

/**
 * Làm sạch văn bản được bôi đen trước khi gửi sang API:
 * - Xóa khoảng trắng thừa ở 2 đầu và chuẩn hóa khoảng trắng bên trong.
 * - Loại bỏ các dấu câu bọc ngoài: " ' “ ” ‘ ’ ( ) [ ] { } , ; : . ! ? ` * _ ~
 * - Loại bỏ các cú pháp Markdown bao quanh: **bold**, *italic*, [[wiki-link]], `code`, ~~strike~~
 *
 * Ví dụ:
 *  - ' "hypothesis," ' => 'hypothesis'
 *  - '**crucial**' => 'crucial'
 *  - '[[photosynthesis]]' => 'photosynthesis'
 *  - '(effective).' => 'effective'
 */
export function cleanSelection(raw: string): string {
  if (!raw) return "";

  let str = raw.trim();
  if (!str) return "";

  let prev = "";
  // Lặp bóc tách các lớp vỏ bọc bên ngoài cho đến khi chuỗi ổn định
  while (str !== prev && str.length > 0) {
    prev = str;
    str = str.trim();

    // 1. Bóc Wiki Links: [[target|alias]] hoặc [[target]]
    if (str.startsWith("[[") && str.endsWith("]]") && str.length >= 4) {
      str = str.slice(2, -2).trim();
      if (str.includes("|")) {
        const parts = str.split("|");
        str = (parts.pop() || "").trim();
      }
      continue;
    }

    // 2. Bóc Markdown links: [display](url)
    const mdLinkMatch = str.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (mdLinkMatch) {
      str = mdLinkMatch[1].trim();
      continue;
    }

    // 3. Bóc các thẻ Markdown 2 ký tự đối xứng: **, __, ~~, ==
    if (str.length >= 4) {
      const start2 = str.slice(0, 2);
      const end2 = str.slice(-2);
      if (
        (start2 === "**" && end2 === "**") ||
        (start2 === "__" && end2 === "__") ||
        (start2 === "~~" && end2 === "~~") ||
        (start2 === "==" && end2 === "==")
      ) {
        str = str.slice(2, -2).trim();
        continue;
      }
    }

    // 4. Bóc các thẻ Markdown 1 ký tự đối xứng: *, _, `
    if (str.length >= 2) {
      const start1 = str[0];
      const end1 = str[str.length - 1];
      if (
        (start1 === "*" && end1 === "*") ||
        (start1 === "_" && end1 === "_") ||
        (start1 === "`" && end1 === "`")
      ) {
        str = str.slice(1, -1).trim();
        continue;
      }
    }

    // 5. Bóc dấu câu ở đầu chuỗi (không phá vỡ cú pháp markdown 2 ký tự như [[, **, __)
    while (str.length > 0 && OUTER_PUNCTUATION.has(str[0])) {
      if (
        str.startsWith("[[") ||
        str.startsWith("**") ||
        str.startsWith("__") ||
        str.startsWith("~~") ||
        str.startsWith("==")
      ) {
        break;
      }
      str = str.slice(1).trim();
    }

    // 6. Bóc dấu câu ở cuối chuỗi (không phá vỡ cú pháp markdown 2 ký tự như ]], **, __)
    while (str.length > 0 && OUTER_PUNCTUATION.has(str[str.length - 1])) {
      if (
        str.endsWith("]]") ||
        str.endsWith("**") ||
        str.endsWith("__") ||
        str.endsWith("~~") ||
        str.endsWith("==")
      ) {
        break;
      }
      str = str.slice(0, -1).trim();
    }
  }

  // Chuẩn hóa khoảng trắng bên trong
  return str.replace(/\s+/g, " ");
}
