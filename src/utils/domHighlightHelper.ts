export function wrapRangeWithHighlight(
  range: Range,
  id: string,
  color: string,
  bg: string
): HTMLElement | null {
  if (!range || range.collapsed) return null;
  const text = range.toString().trim();
  if (!text) return null;

  const doc = range.startContainer.ownerDocument || document;
  const mark = doc.createElement("mark");
  mark.className = "polyglot-reading-highlight";
  mark.setAttribute("data-highlight-id", id);
  mark.setAttribute("data-color", color);
  mark.style.backgroundColor = bg;
  mark.style.color = "inherit";

  try {
    range.surroundContents(mark);
    return mark;
  } catch {
    try {
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
      return mark;
    } catch {
      return null;
    }
  }
}

export function unwrapHighlightElement(el: HTMLElement): void {
  if (!el || !el.parentNode) return;
  const parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

export function unwrapHighlightsByText(
  container: HTMLElement,
  text: string
): number {
  if (!container || !text || !text.trim()) return 0;
  const trimmed = text.trim().toLowerCase();

  const marks = Array.from(
    container.querySelectorAll(".polyglot-reading-highlight")
  ) as HTMLElement[];

  let unwrappedCount = 0;
  for (const mark of marks) {
    const markText = (mark.textContent || "").trim().toLowerCase();
    if (markText === trimmed || markText.includes(trimmed) || trimmed.includes(markText)) {
      unwrapHighlightElement(mark);
      unwrappedCount++;
    }
  }

  return unwrappedCount;
}

export function unwrapAllHighlights(container: HTMLElement): number {
  if (!container) return 0;
  const marks = Array.from(
    container.querySelectorAll(".polyglot-reading-highlight")
  ) as HTMLElement[];

  for (const mark of marks) {
    unwrapHighlightElement(mark);
  }

  return marks.length;
}

