import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";

describe("MarkdownRenderer", () => {
  it("renders GFM tables (a GFM-only feature)", () => {
    const md = [
      "| Col A | Col B |",
      "| ----- | ----- |",
      "| 1     | 2     |",
    ].join("\n");

    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("renders GFM strikethrough", () => {
    const { container } = render(
      <MarkdownRenderer>{"~~struck~~ word"}</MarkdownRenderer>,
    );
    expect(container.querySelector("del")).not.toBeNull();
    expect(screen.getByText("struck").tagName.toLowerCase()).toBe("del");
  });

  it("renders GFM task list checkboxes", () => {
    const md = ["- [x] done", "- [ ] todo"].join("\n");
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it("renders inline HTML embedded in markdown", () => {
    const md = "Hello <mark>world</mark> and <kbd>Ctrl+C</kbd>";
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    expect(container.querySelector("mark")?.textContent).toBe("world");
    expect(container.querySelector("kbd")?.textContent).toBe("Ctrl+C");
  });

  it("renders <details>/<summary> for collapsible sections", () => {
    const md = [
      "<details>",
      "<summary>Show more</summary>",
      "",
      "Hidden content",
      "</details>",
    ].join("\n");
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("summary")?.textContent).toBe("Show more");
  });

  it("strips <script> tags via rehype-sanitize", () => {
    const md = 'Hello<script>window.__pwn = true;</script> world';
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    expect(container.querySelector("script")).toBeNull();
    // The text content surrounding the script must still be there.
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
  });

  it("strips inline event handlers (onclick, etc.) via rehype-sanitize", () => {
    const md = '<button onclick="window.__pwn=true">Click me</button>';
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    const button = container.querySelector("button");
    // The element itself may pass through (it's a normal HTML button) but
    // the onclick attribute must be gone.
    if (button) {
      expect(button.getAttribute("onclick")).toBeNull();
    }
  });

  it("strips javascript: URLs in anchor hrefs", () => {
    // Use raw HTML so we test the sanitizer end-to-end (markdown's own
    // link syntax escapes this differently).
    const md = '<a href="javascript:alert(1)">click</a>';
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    const anchor = container.querySelector("a");
    // Either the anchor is stripped entirely or its href is dropped — both
    // are acceptable sanitize outcomes; what's NOT acceptable is keeping
    // the javascript: URL.
    if (anchor) {
      const href = anchor.getAttribute("href");
      expect(href ?? "").not.toMatch(/^javascript:/i);
    }
  });

  it("keeps http(s) and mailto: URLs intact", () => {
    const md =
      "[external](https://example.com) and [mail](mailto:a@example.com)";
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    const anchors = container.querySelectorAll("a");
    const hrefs = Array.from(anchors).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://example.com");
    expect(hrefs).toContain("mailto:a@example.com");
  });

  it("drops <iframe> tags (not in the allow-list)", () => {
    const md = '<iframe src="https://evil.example.com"></iframe>';
    const { container } = render(<MarkdownRenderer>{md}</MarkdownRenderer>);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("strips raw HTML when allowHtml=false", () => {
    const md = "Hello <mark>world</mark>";
    const { container } = render(
      <MarkdownRenderer allowHtml={false}>{md}</MarkdownRenderer>,
    );
    // <mark> should not be parsed; the text should still appear.
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toContain("world");
  });
});
