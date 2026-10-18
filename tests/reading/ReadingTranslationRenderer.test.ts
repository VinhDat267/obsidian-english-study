// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractReadingBlocks } from "../../src/reading/blockExtractor";
import { ReadingTranslationRenderer } from "../../src/reading/ReadingTranslationRenderer";
import { mountReadingHtml } from "../helpers/reading";

afterEach(() => document.body.replaceChildren());

describe("reading translation rendering", () => {
  it("inserts_below_source_without_modifying_it", () => {
    const root = mountReadingHtml('<p>Source <a href="https://example.com">link</a>.</p><p>Next</p>');
    const source = root.firstElementChild!, original = source.outerHTML;
    const view = new ReadingTranslationRenderer().mount(extractReadingBlocks(root)[0], () => {});
    view.show({ status: "success", text: "Bản dịch nổi bật." });
    expect(source.nextElementSibling).toBe(view.element);
    expect(source.outerHTML).toBe(original);
    expect(view.element.textContent).toBe("Bản dịch nổi bật.");
    expect(view.element.querySelector('[role="status"]')).toBeNull();
  });

  it("renders_provider_html_as_text", () => {
    const block = extractReadingBlocks(mountReadingHtml("<p>Hello</p>"))[0];
    const view = new ReadingTranslationRenderer().mount(block, () => {});
    view.show({ status: "success", text: '<img src=x onerror=alert(1)><script>bad()</script>' });
    expect(view.element.querySelector("script, img")).toBeNull();
    expect(view.element.textContent).toContain("<img src=x");
  });

  it("supports_retry_and_disposes_the_handler_and_element", () => {
    const block = extractReadingBlocks(mountReadingHtml("<p>Hello</p>"))[0];
    const retry = vi.fn(), view = new ReadingTranslationRenderer().mount(block, retry);
    expect(view.element.querySelector('[role="status"]')?.textContent).toContain("Đang dịch");
    view.show({ status: "error", code: "provider" });
    const button = view.element.querySelector("button")!;
    expect(button.textContent).toBe("Thử lại");
    button.click(); expect(retry).toHaveBeenCalledTimes(1);
    view.dispose(); button.click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(view.element.isConnected).toBe(false);
  });

  it("restores_inline_nodes_without_moving_source_and_rejects_broken_tokens", () => {
    const root = mountReadingHtml("<p>Use <code>x()</code>.</p>");
    const originalCode = root.querySelector("code")!;
    const block = extractReadingBlocks(root)[0];
    const view = new ReadingTranslationRenderer().mount(block, () => {});
    view.show({ status: "success", text: "Dùng " + block.fragments[0].token + "." });
    expect(view.element.querySelector("code")?.textContent).toBe("x()");
    expect(view.element.querySelector("code")).not.toBe(originalCode);
    expect(originalCode.parentElement).toBe(root.firstElementChild);
    view.show({ status: "success", text: "missing token" });
    expect(view.element.dataset.state).toBe("error");
    expect(view.element.querySelector("button")?.textContent).toBe("Thử lại");
  });

  it("uses_the_source_owner_document_and_valid_list_placement", () => {
    const other = document.implementation.createHTMLDocument("Other window");
    other.body.innerHTML = "<ul><li>Item<ul><li>Nested</li></ul></li></ul>";
    const block = extractReadingBlocks(other.body)[0];
    const view = new ReadingTranslationRenderer().mount(block, () => {});
    view.show({ status: "success", text: "Mục" });
    expect(view.element.ownerDocument).toBe(other);
    expect(view.element.parentElement?.tagName).toBe("LI");
    expect(view.element.nextElementSibling?.tagName).toBe("UL");
  });

  it("cancelled_results_remove_loading_content", () => {
    const view = new ReadingTranslationRenderer().mount(extractReadingBlocks(mountReadingHtml("<p>Text</p>"))[0], () => {});
    view.show({ status: "cancelled" });
    expect(document.querySelector(".polyglot-reading-translation")).toBeNull();
  });
});
