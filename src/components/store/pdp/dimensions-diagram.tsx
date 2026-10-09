/**
 * Simple isometric box with labelled edges so size is readable at a glance. Proportions
 * follow the real dimensions (clamped so very flat or tall pieces stay legible).
 */
export function DimensionsDiagram({
  lengthMm,
  widthMm,
  heightMm,
}: {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}) {
  const l = lengthMm ?? 100;
  const w = widthMm ?? l;
  const h = heightMm ?? 50;
  const biggest = Math.max(l, w, h);
  const scale = (v: number) => Math.max(14, (v / biggest) * 90);
  const L = scale(l);
  const W = scale(w) * 0.5;
  const H = scale(h);
  const ox = 40;
  const oy = 30 + W;
  const cm = (mm: number | null) => (mm === null ? "" : `${Math.round(mm / 10)} cm`);

  return (
    <svg
      viewBox={`0 0 ${ox + L + W + 60} ${oy + H + 40}`}
      className="text-stone h-auto w-full max-w-72"
      role="img"
      aria-label={`Approximate proportions: ${[cm(lengthMm) && `length ${cm(lengthMm)}`, cm(widthMm) && `width ${cm(widthMm)}`, cm(heightMm) && `height ${cm(heightMm)}`].filter(Boolean).join(", ")}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {/* front face */}
        <rect x={ox} y={oy} width={L} height={H} />
        {/* top face */}
        <path d={`M${ox} ${oy} L${ox + W} ${oy - W} L${ox + L + W} ${oy - W} L${ox + L} ${oy}`} />
        {/* side face */}
        <path d={`M${ox + L} ${oy + H} L${ox + L + W} ${oy + H - W} L${ox + L + W} ${oy - W}`} />
      </g>
      <g fill="currentColor" fontSize="9" fontFamily="inherit">
        {lengthMm !== null && (
          <text x={ox + L / 2} y={oy + H + 16} textAnchor="middle">
            {cm(lengthMm)}
          </text>
        )}
        {widthMm !== null && (
          <text x={ox + L + W / 2 + 8} y={oy + H - W / 2 + 12}>
            {cm(widthMm)}
          </text>
        )}
        {heightMm !== null && (
          <text x={ox - 6} y={oy + H / 2 + 3} textAnchor="end">
            {cm(heightMm)}
          </text>
        )}
      </g>
    </svg>
  );
}
