import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Reads `--color-*` hex values from the :root block of globals.css. */
function readPalette() {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const palette: Record<string, string> = {};
  for (const match of root.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    palette[match[1]] = match[2];
  }
  return palette;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const palette = readPalette();

// Every foreground/background pair the components actually use for text.
const textPairs: Array<[fg: string, bg: string]> = [
  ["charcoal", "ivory"],
  ["charcoal", "soft-white"],
  ["charcoal", "limestone"],
  ["stone", "ivory"],
  ["stone", "soft-white"],
  ["stone", "limestone"],
  ["earth", "ivory"],
  ["ivory", "charcoal"],
  ["soft-white", "charcoal"],
  ["taupe", "charcoal"],
  ["success", "success-bg"],
  ["error", "error-bg"],
  ["warning", "warning-bg"],
  ["info", "info-bg"],
  ["error", "ivory"],
  ["success", "ivory"],
];

describe("design tokens", () => {
  it("parses the palette from globals.css", () => {
    expect(Object.keys(palette).length).toBeGreaterThanOrEqual(17);
  });

  it.each(textPairs)("%s on %s meets WCAG AA (4.5:1)", (fg, bg) => {
    expect(palette[fg], `missing --color-${fg}`).toBeDefined();
    expect(palette[bg], `missing --color-${bg}`).toBeDefined();
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["line-strong", "soft-white"],
    ["line-strong", "ivory"],
  ])("control border %s on %s meets 3:1 non-text contrast", (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});
