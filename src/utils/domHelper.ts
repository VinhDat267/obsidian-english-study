export interface PositionResult {
  top: number;
  left: number;
  flipped: boolean; // true nếu lật lên phía trên vùng chọn
}

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width?: number;
  height?: number;
}

/**
 * Tính toán tọa độ hiển thị (fixed coordinates) cho Floating Popover hoặc Trigger Icon:
 * - Mặc định: Hiển thị ngay dưới vùng chọn (top = rect.bottom + margin, left = rect.left)
 * - Nếu bị tràn đáy màn hình (rect.bottom + popoverHeight + margin > vh):
 *   Lật lên phía trên vùng chọn (top = rect.top - popoverHeight - margin, flipped = true).
 * - Nếu bị tràn mép phải màn hình (left + popoverWidth + margin > vw):
 *   Dịch chuyển left sang trái để toàn bộ popup nằm trọn trong viewport.
 * - Đảm bảo left >= margin không bị thụt ra ngoài mép trái màn hình.
 */
export function calculatePosition(
  selectionRect: RectLike,
  popoverWidth: number,
  popoverHeight: number,
  vw: number,
  vh: number,
  margin: number = 8
): PositionResult {
  const m = margin !== undefined ? margin : 8;

  let flipped = false;
  let top = selectionRect.bottom + m;

  if (selectionRect.bottom + popoverHeight + m > vh) {
    top = selectionRect.top - popoverHeight - m;
    flipped = true;
  }

  if (top < m) {
    top = m;
  }

  let left = selectionRect.left;
  if (left + popoverWidth + m > vw) {
    left = vw - popoverWidth - m;
  }
  if (left < m) {
    left = m;
  }

  return {
    top,
    left,
    flipped,
  };
}
