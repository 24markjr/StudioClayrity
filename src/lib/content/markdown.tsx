import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown for owner-edited pages (About, policies, collection intros).
 * Supports: # ## ### headings, paragraphs, - and 1. lists, **bold**, *italic*, [links](/x).
 * Output is React elements — never raw HTML — so editor content can't inject scripts.
 */

type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list) blocks.push({ type: "list", ...list });
    paragraph = [];
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      // Page titles are the page's own h1, so Markdown "#" maps to h2
      blocks.push({ type: "heading", level: (heading[1].length + 1) as 2 | 3 | 4, text: heading[2] });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length) flush();
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function isSafeHref(href: string) {
  return href.startsWith("/") || href.startsWith("#") || /^(https?:|mailto:|tel:)/i.test(href);
}

/** Inline formatting: **bold**, *italic*, [text](href). */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[2]) nodes.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[4]) nodes.push(<em key={key++}>{match[4]}</em>);
    else if (match[6]) {
      const href = match[7];
      if (!isSafeHref(href)) nodes.push(match[6]);
      else if (href.startsWith("/"))
        nodes.push(
          <Link key={key++} href={href} className="hover:text-earth underline underline-offset-4">
            {match[6]}
          </Link>,
        );
      else
        nodes.push(
          <a
            key={key++}
            href={href}
            className="hover:text-earth underline underline-offset-4"
            rel="noopener noreferrer"
          >
            {match[6]}
          </a>,
        );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parseBlocks(source).map((block, i) => {
        if (block.type === "heading") {
          const Tag = `h${block.level}` as const;
          const style =
            block.level === 2
              ? "type-h3 mt-12 mb-4"
              : block.level === 3
                ? "type-h4 mt-8 mb-3"
                : "type-label mt-6 mb-2";
          return (
            <Tag key={i} className={style}>
              {renderInline(block.text)}
            </Tag>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={`my-5 space-y-2 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-taupe`}
            >
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i} className="my-5">
            {renderInline(block.text).map((n, j) => (
              <Fragment key={j}>{n}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
