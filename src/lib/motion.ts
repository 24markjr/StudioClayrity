/**
 * Motion tokens. Mirrors the CSS custom properties in globals.css so CSS transitions
 * and Motion for React animations share one timing language.
 */

export const duration = {
  /** Hover, focus, press */
  micro: 0.16,
  /** Buttons, cards, small state changes */
  base: 0.24,
  /** Drawers, dialogs, overlays */
  overlay: 0.3,
  /** Editorial reveals */
  reveal: 0.6,
} as const;

export const ease = {
  /** Reveals and entrances — fast start, long settle */
  outQuint: [0.22, 1, 0.36, 1],
  /** Drawers and panels moving across the screen */
  inOutCubic: [0.65, 0, 0.35, 1],
  /** General UI */
  outSoft: [0.25, 0.1, 0.25, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/** Gentle spring for small counters (bag count) */
export const spring = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 } as const;

/** Vertical travel for reveals, in px. Small on purpose. */
export const revealDistance = 20;

/** Delay between staggered children, in seconds */
export const stagger = 0.06;
