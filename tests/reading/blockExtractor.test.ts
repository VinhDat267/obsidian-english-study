// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extractReadingBlocks, restoreReadingFragments } from "../../src/reading/blockExtractor";
import { mountReadingHtml } from "../helpers/reading";

afterEach(() => document.body.replaceChildren());

describe("reading block extraction", () => {
  it("extracts_each_inline_run_once_without_mutating_original_nodes", () => {
    const root = mountReadingHtml("<ul><li>Outer <code>x()</code><p>Paragraph</p><ul><li>Inner</li></ul>Tail</li></ul>");
    const before = root.innerHTML;
    const code = root.querySelector("code");
    const blocks = extractReadingBlocks(root);
    expect(blocks.map(b => b.kind)).toEqual(["list-item", "paragraph", "list-item", "list-item"]);
    expect(blocks.map(b => b.text.replace(/⟦[^⟧]+⟧/g, "CODE"))).toEqual(["Outer CODE", "Paragraph", "Inner", "Tail"]);
    expect(blocks[0].anchor.before).toBe(root.querySelector("p"));
    expect(blocks[3].anchor.parent).toBe(root.querySelector("li"));
    expect(root.innerHTML).toBe(before);
    expect(root.querySelector("code")).toBe(code);
    expect(blocks.some(b => b.text.includes("x()"))).toBe(false);
  });

  it("protects_math_code_and_preserves_user_blockquotes", () => {
    const root = mountReadingHtml('<blockquote><p>A quotation.</p></blockquote><p>Use <code>x</code> and <span class="math">y²</span>.</p>');
    const blocks = extractReadingBlocks(root);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe("A quotation.");
    expect(blocks[1].fragments).toHaveLength(2);
    expect(blocks[1].text).not.toContain("y²");
    const restored = restoreReadingFragments(blocks[1].text, blocks[1].fragments, document)!;
    expect(restored.querySelector("code")?.textContent).toBe("x");
    expect(restored.querySelector(".math")?.textContent).toBe("y²");
    expect(root.querySelector("code")?.isConnected).toBe(true);
  });

  it("excludes_technical_interactive_embedded_and_translated_content", () => {
    const root = mountReadingHtml('<pre><code>no</code></pre><table><tr><td><p>no</p></td></tr></table><div class="math"><p>no</p></div><div class="internal-embed"><p>no</p></div><div class="polyglot-reading-translation"><p>no</p></div><p>Label <button>action</button></p>');
    expect(extractReadingBlocks(root)).toEqual([]);
    const embeddedSection = root.querySelector(".internal-embed p") as HTMLElement;
    expect(extractReadingBlocks(embeddedSection)).toEqual([]);
  });

  it("preserves_breaks_and_choices_and_anchors_headings_without_changing_links", () => {
    const root = mountReadingHtml('<h2>Title</h2><p>A. One<br>B. Two\nC. Three <a href="https://example.com">link</a></p>');
    const before = root.innerHTML;
    const blocks = extractReadingBlocks(root);
    expect(blocks.map(b => b.text)).toEqual(["Title", "A. One\nB. Two\nC. Three link"]);
    expect(blocks[0].kind).toBe("heading");
    expect(blocks[0].anchor.before).toBe(root.querySelector("p"));
    expect(root.innerHTML).toBe(before);
  });

  it("uses_stable_tokens_and_separates_protected_content_in_cache_seed", () => {
    const root = mountReadingHtml("<p>Use <code>x</code>.</p>");
    const first = extractReadingBlocks(root)[0];
    const second = extractReadingBlocks(root)[0];
    expect(first.text).toBe(second.text);
    expect(first.cacheSeed).toBe(second.cacheSeed);
    root.querySelector("code")!.textContent = "y";
    expect(extractReadingBlocks(root)[0].cacheSeed).not.toBe(first.cacheSeed);
  });

  it("avoids_token_prefix_collisions_in_user_text", () => {
    const root = mountReadingHtml("<p>Literal ⟦PG0_0⟧ <code>x</code></p>");
    const block = extractReadingBlocks(root)[0];
    expect(block.fragments[0].token).not.toBe("⟦PG0_0⟧");
    expect(restoreReadingFragments(block.text, block.fragments, document)?.textContent).toBe("Literal ⟦PG0_0⟧ x");
  });

  it("rejects_missing_duplicate_and_unknown_tokens_but_allows_translation_reordering", () => {
    const block = extractReadingBlocks(mountReadingHtml("<p><code>x</code> before <code>y</code></p>"))[0];
    const [a, b] = block.fragments.map(f => f.token);
    expect(restoreReadingFragments("no tokens", block.fragments, document)).toBeNull();
    expect(restoreReadingFragments(a + a + b, block.fragments, document)).toBeNull();
    expect(restoreReadingFragments(a + b + a.replace("_0", "_99"), block.fragments, document)).toBeNull();
    const restored = restoreReadingFragments(b + " sau " + a, block.fragments, document)!;
    expect(restored.textContent).toBe("y sau x");
    expect(Array.from(restored.querySelectorAll("code")).map(el => el.textContent)).toEqual(["y", "x"]);
  });

  it("only_returns_real_text_not_empty_or_code_only_blocks", () => {
    expect(extractReadingBlocks(mountReadingHtml("<p> </p><p><code>only code</code></p><h2>Real heading</h2>")).map(b => b.text)).toEqual(["Real heading"]);
  });
});
