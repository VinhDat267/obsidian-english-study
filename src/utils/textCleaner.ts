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
      // Nếu là văn bản nhiều dòng và ký tự cuối là dấu kết thúc câu (. ! ? ;), giữ lại để bảo toàn ngữ nghĩa
      if (
        str.includes("\n") &&
        (str.endsWith(".") || str.endsWith("!") || str.endsWith("?") || str.endsWith(";"))
      ) {
        break;
      }
      str = str.slice(0, -1).trim();
    }
  }

  // Chuẩn hóa khoảng trắng: nếu có xuống dòng, bảo toàn từng dòng và chuẩn hóa khoảng trắng ngang
  if (str.includes("\n")) {
    const normalized = str
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/[ \t]+/g, " "))
      .filter((line, idx, arr) => {
        // Giữ tối đa 1 dòng trống liên tiếp
        if (!line && idx > 0 && !arr[idx - 1]) return false;
        return true;
      })
      .join("\n")
      .trim();
    return formatMultipleChoiceText(normalized);
  }

  // Chuỗi 1 dòng: chuẩn hóa khoảng trắng bên trong và tự động tách đáp án A B C D nếu có
  const singleLine = str.replace(/[ \t]+/g, " ");
  return formatMultipleChoiceText(singleLine);
}

/**
 * Tự động định dạng văn bản câu hỏi trắc nghiệm:
 * Tách các lựa chọn đáp án (A, B, C, D... hoặc 1, 2, 3... hoặc a, b, c...) xuống từng dòng riêng biệt
 * nếu chúng đang bị dính liền trên cùng một dòng.
 */
export function formatMultipleChoiceText(text: string): string {
  if (!text || typeof text !== "string") return "";

  let result = text;

  // 1. Kiểm tra trắc nghiệm chữ hoa: A., B., C., D... hoặc A), B)... hoặc (A), (B)... hoặc [A], [B]...
  const hasUpperA = /(?:^|[\s\n])(?:\(A\)|\[A\]|A[.)])(?:\s+|$)/.test(result);
  const hasUpperB = /(?:^|[\s\n])(?:\(B\)|\[B\]|B[.)])(?:\s+|$)/.test(result);

  if (hasUpperA && hasUpperB) {
    // Tách dòng trước các lựa chọn A, B, C, D, E, F, G, H
    // Chỉ chèn \n nếu ký tự trước đó không phải là \n
    result = result.replace(
      /([^\n])\s+((?:\([A-H]\)|\[[A-H]\]|[A-H][.)])\s+)/g,
      "$1\n$2"
    );
  }

  // 2. Kiểm tra trắc nghiệm chữ thường: a., b., c., d... hoặc a), b)... hoặc (a), (b)...
  const hasLowerA = /(?:^|[\s\n])(?:\(a\)|\[a\]|a[.)])(?:\s+|$)/.test(result);
  const hasLowerB = /(?:^|[\s\n])(?:\(b\)|\[b\]|b[.)])(?:\s+|$)/.test(result);

  if (hasLowerA && hasLowerB) {
    result = result.replace(
      /([^\n])\s+((?:\([a-h]\)|\[[a-h]\]|[a-h][.)])\s+)/g,
      "$1\n$2"
    );
  }

  // 3. Kiểm tra trắc nghiệm đánh số: 1., 2., 3... hoặc 1), 2)... hoặc (1), (2)...
  const hasNum1 = /(?:^|[\s\n])(?:\(1\)|\[1\]|1[.)])(?:\s+|$)/.test(result);
  const hasNum2 = /(?:^|[\s\n])(?:\(2\)|\[2\]|2[.)])(?:\s+|$)/.test(result);

  if (hasNum1 && hasNum2) {
    result = result.replace(
      /([^\n])\s+((?:\([1-9]\)|\[[1-9]\]|[1-9][.)]|\(1[0-9]\)|\[1[0-9]\]|1[0-9][.)])\s+)/g,
      "$1\n$2"
    );
  }

  // Chuẩn hóa khoảng trắng thừa trên từng dòng nếu có dòng mới
  if (result.includes("\n")) {
    return result
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/[ \t]+/g, " "))
      .filter((line, idx, arr) => {
        // Giữ tối đa 1 dòng trống liên tiếp
        if (!line && idx > 0 && !arr[idx - 1]) return false;
        return true;
      })
      .join("\n");
  }

  return result.trim().replace(/[ \t]+/g, " ");
}
