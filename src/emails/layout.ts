/**
 * Shared email layout: quiet, brand-consistent, and safe in every client (single column,
 * inline styles, system fonts as fallback, a plain-text twin for every message).
 * All interpolated text is escaped.
 */

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailContent = {
  subject: string;
  /** Short preview line shown in the inbox list */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Optional rows, e.g. order lines or totals */
  rows?: Array<{ label: string; value: string; strong?: boolean }>;
  /** Optional labelled block, e.g. a delivery address */
  block?: { title: string; lines: string[] };
  cta?: { label: string; href: string };
  footer?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const SANS = "Arial,Helvetica,sans-serif";

export function renderEmail(content: EmailContent, siteUrl: string): RenderedEmail {
  const e = escapeHtml;
  const rows = content.rows
    ?.map(
      (r) =>
        `<tr><td style="font-family:${SANS};font-size:${r.strong ? 16 : 14}px;padding:4px 0;color:${r.strong ? "#272622" : "#66625a"};${r.strong ? "font-weight:bold;" : ""}">${e(r.label)}</td><td align="right" style="font-family:${SANS};font-size:${r.strong ? 16 : 14}px;padding:4px 0;color:#272622;${r.strong ? "font-weight:bold;" : ""}white-space:nowrap">${e(r.value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f5f0;color:#272622">
<div style="display:none;max-height:0;overflow:hidden">${e(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fcfbf8">
<tr><td style="padding:32px 32px 0">
<p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#272622">Studio Clayrity</p>
<h1 style="margin:28px 0 12px;font-family:Georgia,serif;font-weight:normal;font-size:28px;line-height:1.2;color:#272622">${e(content.heading)}</h1>
${content.paragraphs.map((p) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:#66625a">${e(p)}</p>`).join("\n")}
</td></tr>
${content.cta ? `<tr><td style="padding:12px 32px 4px"><a href="${e(content.cta.href)}" style="display:inline-block;background:#272622;color:#f7f5f0;font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 24px">${e(content.cta.label)}</a></td></tr>` : ""}
${rows ? `<tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e0d7;padding-top:12px">${rows}</table></td></tr>` : ""}
${content.block ? `<tr><td style="padding:20px 32px 0"><p style="margin:0 0 6px;font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#66625a">${e(content.block.title)}</p><p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:#272622">${content.block.lines.map(e).join("<br>")}</p></td></tr>` : ""}
<tr><td style="padding:28px 32px 32px"><p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:#66625a;border-top:1px solid #e5e0d7;padding-top:16px">${e(content.footer ?? "Questions? Simply reply to this email.")}<br><a href="${e(siteUrl)}" style="color:#66625a">${e(siteUrl.replace(/^https?:\/\//, ""))}</a></p></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.cta ? ["", `${content.cta.label}: ${content.cta.href}`] : []),
    ...(content.rows ? ["", ...content.rows.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(content.block ? ["", `${content.block.title}:`, ...content.block.lines] : []),
    "",
    content.footer ?? "Questions? Simply reply to this email.",
    "",
    "Studio Clayrity",
    siteUrl,
  ].join("\n");

  return { subject: content.subject, html, text };
}
