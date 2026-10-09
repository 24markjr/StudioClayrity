import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseBlocks } from "./markdown";

describe("parseBlocks", () => {
  it("parses headings, paragraphs and lists", () => {
    expect(parseBlocks("# Title\n\nFirst line\nsame paragraph\n\n- one\n- two\n\n1. a\n2. b")).toEqual([
      { type: "heading", level: 2, text: "Title" },
      { type: "paragraph", text: "First line same paragraph" },
      { type: "list", ordered: false, items: ["one", "two"] },
      { type: "list", ordered: true, items: ["a", "b"] },
    ]);
  });
});

describe("Markdown", () => {
  it("renders inline formatting and internal links", () => {
    const html = renderToStaticMarkup(
      <Markdown source="Read our **returns** policy [here](/policies/returns)." />,
    );
    expect(html).toContain("<strong>returns</strong>");
    expect(html).toContain('href="/policies/returns"');
  });

  it("never outputs raw HTML from content", () => {
    const html = renderToStaticMarkup(
      <Markdown source={"<script>alert(1)</script> <img src=x onerror=alert(1)>"} />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops unsafe link protocols", () => {
    const html = renderToStaticMarkup(<Markdown source="[click](javascript:alert(1))" />);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
  });
});
