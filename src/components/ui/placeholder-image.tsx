import { useId } from "react";
import { cn } from "@/lib/utils/cn";
import type { AspectRatio } from "./responsive-image";

/**
 * Generated stone texture used ONLY while real photography is missing. It is always
 * labelled "Placeholder" so it can never be mistaken for an actual product photo.
 *
 * How it works: fractal noise → its red channel becomes alpha → a lookup table keeps only
 * narrow value bands, which turns smooth noise into thin, branching "veins".
 */

export type PlaceholderTone = "white-marble" | "green-marble" | "travertine" | "charcoal-stone" | "clay";

type ToneSpec = {
  base: string;
  vein: string;
  frequency: string;
  seed: number;
  /** feFuncA table — peaks become veins */
  bands: string;
  veinOpacity: number;
  dark: boolean;
};

const tones: Record<PlaceholderTone, ToneSpec> = {
  "white-marble": {
    base: "#ece7df",
    vein: "#8f877b",
    frequency: "0.004 0.012",
    seed: 7,
    bands: "0 0 0 0 0 0 0 0.9 0 0 0 0 0.55 0 0 0 0 0 0 0",
    veinOpacity: 0.6,
    dark: false,
  },
  "green-marble": {
    base: "#3f4a42",
    vein: "#d6dccf",
    frequency: "0.005 0.014",
    seed: 3,
    bands: "0 0 0 0 0 0 0 0.9 0 0 0 0.6 0 0 0 0 0 0 0 0",
    veinOpacity: 0.85,
    dark: true,
  },
  travertine: {
    base: "#ddd1bf",
    vein: "#b5a286",
    frequency: "0.0015 0.05",
    seed: 11,
    bands: "0 0 0.5 0 0 0.6 0 0 0.7 0 0 0.5 0 0 0.6 0 0 0.4 0 0",
    veinOpacity: 0.8,
    dark: false,
  },
  "charcoal-stone": {
    base: "#33312d",
    vein: "#8a857c",
    frequency: "0.006 0.01",
    seed: 5,
    bands: "0 0 0 0 0 0 0 0.8 0 0 0 0 0.5 0 0 0 0 0 0 0",
    veinOpacity: 0.8,
    dark: true,
  },
  clay: {
    base: "#c8a68b",
    vein: "#9e7a5f",
    frequency: "0.03 0.03",
    seed: 2,
    bands: "0.3 0.1 0.4 0.2 0.5 0.1 0.3 0.2 0.4 0.1 0.3 0.2 0.5 0.1 0.3 0.2 0.4 0.1 0.3 0.2",
    veinOpacity: 0.6,
    dark: false,
  },
};

const aspect: Record<AspectRatio, string> = {
  "4/5": "aspect-[4/5]",
  "3/4": "aspect-[3/4]",
  "1/1": "aspect-square",
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
};

export function PlaceholderImage({
  tone = "white-marble",
  ratio = "4/5",
  label = "Placeholder",
  className,
  showLabel = true,
}: {
  tone?: PlaceholderTone;
  ratio?: AspectRatio;
  /** Describes what the real image will show, e.g. "Hero: tray on console" */
  label?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const t = tones[tone];
  return (
    <div
      role="img"
      aria-label={`Placeholder image${label !== "Placeholder" ? `: ${label}` : ""}`}
      className={cn("relative overflow-hidden", aspect[ratio], className)}
      style={{ backgroundColor: t.base }}
    >
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          {/* Soft clouding for depth */}
          <filter id={`cloud-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed={t.seed + 4} />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1" />
            <feComposite in="SourceGraphic" operator="in" />
          </filter>
          {/* Thin veins */}
          <filter id={`veins-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={t.frequency}
              numOctaves="5"
              seed={t.seed}
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
              result="alpha"
            />
            <feComponentTransfer in="alpha" result="bands">
              <feFuncA type="table" tableValues={t.bands} />
            </feComponentTransfer>
            <feGaussianBlur in="bands" stdDeviation="0.4" result="soft" />
            <feFlood floodColor={t.vein} />
            <feComposite in2="soft" operator="in" />
          </filter>
          <linearGradient id={`light-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={t.dark ? 0.08 : 0.25} />
            <stop offset="1" stopColor="#000" stopOpacity={t.dark ? 0.22 : 0.08} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={t.vein} opacity="0.18" filter={`url(#cloud-${id})`} />
        <rect width="100%" height="100%" filter={`url(#veins-${id})`} opacity={t.veinOpacity} />
        {/* Soft directional light from the top left */}
        <rect width="100%" height="100%" fill={`url(#light-${id})`} />
      </svg>
      {showLabel && (
        <span
          className={cn(
            "type-overline absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] px-2 py-1 tracking-[0.18em]",
            t.dark ? "bg-ivory/85 text-charcoal" : "bg-charcoal/80 text-ivory",
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
