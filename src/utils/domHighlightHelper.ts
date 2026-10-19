export function wrapRangeWithHighlight(
  range: Range,
  id: string,
  color: string,
  bg: string
): HTMLElement | null {
  if (!range || range.collapsed) return null;
  const text = range.toString().trim();
  if (!text) return null;

  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  const endContainer = range.endContainer;
  const endOffset = range.endOffset;
  const commonAncestor = range.commonAncestorContainer;
  const doc = commonAncestor.ownerDocument || document;

  // 1. Trường hợp đơn giản: Cùng 1 TextNode
  if (
    startContainer === endContainer &&
    startContainer.nodeType === Node.TEXT_NODE
  ) {
    const textNode = startContainer as Text;
    let targetNode = textNode;
    if (endOffset < targetNode.nodeValue!.length) {
      targetNode.splitText(endOffset);
    }
    if (startOffset > 0) {
      targetNode = targetNode.splitText(startOffset);
    }

    const mark = doc.createElement("mark");
    mark.className = "polyglot-reading-highlight";
    mark.setAttribute("data-highlight-id", id);
    mark.setAttribute("data-color", color);
    mark.style.backgroundColor = bg;
    mark.style.color = "inherit";

    if (targetNode.parentNode) {
      targetNode.parentNode.insertBefore(mark, targetNode);
      mark.appendChild(targetNode);
      return mark;
    }
    return null;
  }

  // 2. Trường hợp đa thẻ / xuyên khối (Cross-node / Multi-element range):
  // Tuyệt đối KHÔNG dùng range.extractContents() vì sẽ cắt rời cấu trúc DOM và gây mất chữ!
  // Thay vào đó, thu thập toàn bộ các TextNode giao cắt với range và bọc từng TextNode riêng lẻ.
  const textNodes: Text[] = [];
  const rootNode =
    commonAncestor.nodeType === Node.TEXT_NODE
      ? commonAncestor.parentNode!
      : commonAncestor;

  const walker = doc.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      try {
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeValue && node.nodeValue.length > 0) {
          return NodeFilter.FILTER_ACCEPT;
        }
      } catch {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  if (textNodes.length === 0 && startContainer.nodeType === Node.TEXT_NODE) {
    textNodes.push(startContainer as Text);
  }

  let firstMark: HTMLElement | null = null;

  for (const textNode of textNodes) {
    if (!textNode.nodeValue) continue;

    const isStart = textNode === startContainer;
    const isEnd = textNode === endContainer;

    const sOffset = isStart ? startOffset : 0;
    const eOffset = isEnd ? endOffset : textNode.nodeValue.length;

    if (sOffset >= eOffset) continue;

    let targetNode = textNode;
    if (eOffset < targetNode.data.length) {
      targetNode.splitText(eOffset);
    }
    if (sOffset > 0) {
      targetNode = targetNode.splitText(sOffset);
    }

    const mark = doc.createElement("mark");
    mark.className = "polyglot-reading-highlight";
    mark.setAttribute("data-highlight-id", id);
    mark.setAttribute("data-color", color);
    mark.style.backgroundColor = bg;
    mark.style.color = "inherit";

    if (targetNode.parentNode) {
      targetNode.parentNode.insertBefore(mark, targetNode);
      mark.appendChild(targetNode);
      if (!firstMark) {
        firstMark = mark;
      }
    }
  }

  return firstMark;
}

export function unwrapHighlightElement(el: HTMLElement): void {
  if (!el || !el.parentNode) return;
  const parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
  try {
    parent.normalize();
  } catch {}
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

export function unwrapHighlightsByIds(
  container: HTMLElement,
  ids: readonly string[]
): number {
  if (!container || ids.length === 0) return 0;
  const wanted = new Set(ids);
  const marks = Array.from(container.querySelectorAll<HTMLElement>(".polyglot-reading-highlight"));
  let count = 0;
  for (const mark of marks) {
    const id = mark.getAttribute("data-highlight-id");
    if (id !== null && wanted.has(id)) {
      unwrapHighlightElement(mark);
      count++;
    }
  }
  return count;
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

