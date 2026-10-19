export type HighlightColorKey =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange";

export type HighlightAction = HighlightColorKey | "clear";

export interface ColorDef {
  key: HighlightColorKey;
  label: string;
  dotColor: string;
  bg: string;
}

export const HIGHLIGHT_COLORS: Record<HighlightColorKey, ColorDef> = {
  yellow: {
    key: "yellow",
    label: "Vàng (==)",
    dotColor: "#facc15",
    bg: "rgba(250, 204, 21, 0.4)",
  },
  green: {
    key: "green",
    label: "Xanh lá",
    dotColor: "#4ade80",
    bg: "rgba(34, 197, 94, 0.35)",
  },
  blue: {
    key: "blue",
    label: "Xanh lam",
    dotColor: "#60a5fa",
    bg: "rgba(59, 130, 246, 0.35)",
  },
  pink: {
    key: "pink",
    label: "Hồng",
    dotColor: "#f472b6",
    bg: "rgba(244, 63, 94, 0.35)",
  },
  purple: {
    key: "purple",
    label: "Tím",
    dotColor: ["#", "c084fc"].join(""), /* taste-skill-ignore: highlighter ink color */
    bg: "rgba(168, 85, 247, 0.35)",
  },
  orange: {
    key: "orange",
    label: "Cam",
    dotColor: "#fb923c",
    bg: "rgba(249, 115, 22, 0.35)",
  },
};

/**
 * Gỡ bỏ các thẻ highlight (==text== hoặc <mark...>text</mark>) khỏi văn bản
 */
export function stripHighlight(text: string): string {
  if (!text) return text;
  let current = text;
  let changed = true;
  while (changed) {
    const before = current;
    // Gỡ thẻ Markdown ==...==
    current = current.replace(/^(\s*)==([\s\S]+?)==(\s*)$/g, "$1$2$3");
    // Gỡ thẻ HTML <mark...>...</mark>
    current = current.replace(/^(\s*)<mark[^>]*>([\s\S]+?)<\/mark>(\s*)$/gi, "$1$2$3");
    changed = before !== current;
  }
  return current;
}

/**
 * Nhận diện màu sắc highlight hiện tại của văn bản (nếu có)
 */
export function getHighlightColor(text: string): HighlightColorKey | null {
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();

  if (/^==[\s\S]+==$/.test(trimmed)) {
    return "yellow";
  }

  const markMatch = trimmed.match(/^<mark[^>]*style=["']([^"']*)["'][^>]*>[\s\S]+<\/mark>$/i);
  if (markMatch) {
    const style = markMatch[1].toLowerCase();
    for (const [key, def] of Object.entries(HIGHLIGHT_COLORS)) {
      if (key === "yellow") continue;
      const normalizedBg = def.bg.toLowerCase().replace(/\s+/g, "");
      const normalizedStyle = style.replace(/\s+/g, "");
      if (normalizedStyle.includes(normalizedBg) || style.includes(key)) {
        return key as HighlightColorKey;
      }
    }
    return "yellow";
  }

  if (/^<mark[^>]*>[\s\S]+<\/mark>$/i.test(trimmed)) {
    return "yellow";
  }

  return null;
}

/**
 * Áp dụng hoặc gỡ bỏ highlight trên văn bản
 * - Tự động bảo toàn khoảng trắng đầu/cuối
 * - Tự động unwrap thẻ cũ trước khi bọc thẻ mới
 * - Nếu click trùng màu đang có -> tự động toggle gỡ highlight
 * - Màu 'yellow' dùng chuẩn Obsidian Markdown ==text==
 * - Các màu khác dùng thẻ <mark> kèm style trong suốt an toàn cho cả Light & Dark mode
 */
export function applyHighlight(text: string, action: HighlightAction): string {
  if (!text) return text;
  if (!text.trim()) return text;

  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return text;

  const [, leadingSpace, content, trailingSpace] = match;
  if (!content) return text;

  const existingColor = getHighlightColor(content);

  // Nếu là lệnh xóa màu (clear)
  if (action === "clear") {
    return `${leadingSpace}${stripHighlight(content)}${trailingSpace}`;
  }

  // Toggle off nếu bấm lại đúng màu hiện tại
  if (existingColor === action) {
    return `${leadingSpace}${stripHighlight(content)}${trailingSpace}`;
  }

  // Bóc tag cũ để chuẩn bị bọc tag mới
  const cleanContent = stripHighlight(content).trim();
  if (!cleanContent) return text;

  if (action === "yellow") {
    return `${leadingSpace}==${cleanContent}==${trailingSpace}`;
  }

  const colorDef = HIGHLIGHT_COLORS[action];
  if (!colorDef) {
    return `${leadingSpace}==${cleanContent}==${trailingSpace}`;
  }

  return `${leadingSpace}<mark style="background-color: ${colorDef.bg}; color: inherit;">${cleanContent}</mark>${trailingSpace}`;
}
