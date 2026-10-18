import type { ReadingBlock, ReadingProtectedFragment } from "./types";

const excluded = "pre,table,.math-block,.math-display,.internal-embed,.markdown-embed,.polyglot-reading-translation,script,style,button,input,textarea,select,svg,canvas,iframe,[contenteditable=true]";
const protectedInline = "code,.math,.katex,.MathJax,math";
const blockElements = "p,ul,ol,div,blockquote,pre,table,h1,h2,h3,h4,h5,h6";
const interactive = "button,input,textarea,select,iframe,[contenteditable=true]";
const ids = new WeakMap<Node, string>();
let nextId = 0;

export function hasValidReadingTokens(text: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return true;
  let rest = text;
  for (const token of tokens) {
    if (rest.split(token).length !== 2) return false;
    rest = rest.replace(token, "");
  }
  const prefixes = new Set(tokens.map(token => token.match(/^⟦(PG\d+_)\d+⟧$/)?.[1]));
  for (const prefix of prefixes) {
    if (prefix && new RegExp("⟦" + prefix + "\\d+⟧").test(rest)) return false;
  }
  return true;
}

export function restoreReadingFragments(
  text: string, fragments: readonly ReadingProtectedFragment[], doc: Document
): DocumentFragment | null {
  if (!hasValidReadingTokens(text, fragments.map(f => f.token))) return null;
  const result = doc.createDocumentFragment();
  if (!fragments.length) { result.append(doc.createTextNode(text)); return result; }
  const byToken = new Map(fragments.map(f => [f.token, f.node]));
  const pattern = new RegExp("(" + fragments.map(f => f.token).join("|") + ")", "g");
  for (const part of text.split(pattern)) {
    const original = byToken.get(part);
    result.append(original ? doc.importNode(original, true) : doc.createTextNode(part));
  }
  return result;
}

export function extractReadingBlocks(root: HTMLElement): ReadingBlock[] {
  if (root.closest(excluded) || root.matches(protectedInline)) return [];
  const blocks: ReadingBlock[] = [];
  let heading: string | undefined;

  function add(nodes: Node[], parent: HTMLElement, before: Node | null, kind: ReadingBlock["kind"]) {
    if (!nodes.length || nodes.some(n => n.nodeType === 1 && ((n as Element).matches(interactive) || (n as Element).querySelector(interactive)))) return;
    const originalText = nodes.map(n => n.textContent || "").join("");
    let salt = 0;
    while (originalText.includes("⟦PG" + salt + "_")) salt++;
    const fragments: ReadingProtectedFragment[] = [];
    function read(node: Node): string {
      if (node.nodeType === 3) return node.textContent || "";
      if (node.nodeType !== 1) return "";
      const el = node as Element;
      if (el.matches(protectedInline)) {
        const token = "⟦PG" + salt + "_" + fragments.length + "⟧";
        fragments.push({ token, node });
        return token;
      }
      if (el.matches(excluded)) return "";
      if (el.tagName === "BR") return "\n";
      return Array.from(node.childNodes).map(read).join("");
    }
    const text = nodes.map(read).join("").trim();
    const plain = fragments.reduce((value, f) => value.replace(f.token, ""), text);
    if (!/[\p{L}\p{N}]/u.test(plain)) return;
    const key = nodes[0];
    if (!ids.has(key)) ids.set(key, "reading-" + ++nextId);
    if (kind === "heading") heading = text;
    blocks.push({
      id: ids.get(key)!, kind, sourceNodes: nodes, anchor: { parent, before }, text,
      cacheSeed: JSON.stringify([text, fragments.map(f => [f.token, f.node.nodeName, f.node.textContent])]),
      fragments, heading,
    });
  }

  function walk(el: HTMLElement) {
    if (el.closest(excluded) || el.matches(protectedInline)) return;
    if (el.matches("p,h1,h2,h3,h4,h5,h6")) {
      if (el.parentElement) add(Array.from(el.childNodes), el.parentElement, el.nextSibling, el.tagName === "P" ? "paragraph" : "heading");
      return;
    }
    if (el.tagName === "LI") {
      let run: Node[] = [];
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 1 && (node as Element).matches(blockElements)) {
          add(run, el, node, "list-item"); run = [];
          walk(node as HTMLElement);
        } else run.push(node);
      }
      add(run, el, null, "list-item");
      return;
    }
    for (const child of Array.from(el.children)) walk(child as HTMLElement);
  }
  walk(root);
  return blocks;
}
