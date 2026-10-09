import { cn } from "@/lib/utils/cn";

/**
 * Typographic wordmark. Set in the display serif with wide tracking on "CLAYRITY" so the
 * name reads as a studio mark rather than a heading. Replace with the client's logo
 * files if they supply one.
 */
export function Wordmark({
  className,
  layout = "inline",
}: {
  className?: string;
  /** inline: one line (header). stacked: two lines (footer, splash). */
  layout?: "inline" | "stacked";
}) {
  if (layout === "stacked") {
    return (
      <span className={cn("inline-flex flex-col items-center leading-none", className)}>
        <span className="font-display [margin-right:-0.5em] text-[0.62em] tracking-[0.5em] uppercase">
          Studio
        </span>
        <span className="font-display mt-[0.18em] [margin-right:-0.2em] text-[1em] tracking-[0.2em] uppercase">
          Clayrity
        </span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-baseline gap-[0.45em] leading-none whitespace-nowrap", className)}>
      <span className="font-display text-[0.78em] tracking-[0.32em] uppercase">Studio</span>
      <span className="font-display text-[1em] tracking-[0.18em] uppercase">Clayrity</span>
    </span>
  );
}

/** Square monogram for favicons, social avatars and small spaces. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Studio Clayrity" className={cn("size-10", className)}>
      <rect width="64" height="64" fill="#272622" />
      <rect x="6" y="6" width="52" height="52" fill="none" stroke="#a69a89" strokeWidth="0.75" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="var(--font-display), 'Cormorant Garamond', Georgia, serif"
        fontSize="26"
        letterSpacing="2"
        fill="#f7f5f0"
      >
        SC
      </text>
    </svg>
  );
}
