# Design System

Live reference: **`/styleguide`** (all tokens and components) and **`/styleguide/hero`** (homepage hero mockup). Both are hidden in production unless `SHOW_STYLEGUIDE=true`.

## Brand voice

- Calm, precise, sensory. Describe what can be seen and touched: finish, weight, veining, light.
- No hype words, exclamation marks, urgency or countdowns.
- Never state origin, "handmade", sustainability or certifications unless the owner has verified them.
- Example: _"A low bowl in honed marble. The grey veining runs differently through every piece."_

## Tokens (source of truth: `src/app/globals.css`)

| Group         | Tokens                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour        | `ivory` (page), `soft-white` (inputs), `limestone` (fills), `taupe` (decorative), `stone` (secondary text), `earth` (accent), `charcoal` (text/primary), `line`, `line-strong`; semantic `success`, `error`, `warning`, `info` + `-bg` tints |
| Type          | `type-display`, `type-h1`…`type-h4`, `type-product-title`, `type-card-title`, `type-body-lg`, `type-body`, `type-small`, `type-caption`, `type-overline`, `type-button`, `type-label`, `type-price`                                          |
| Fonts         | Cormorant Garamond (display, product names) · Manrope (UI, body) — self-hosted via `next/font`                                                                                                                                               |
| Layout        | `container-page` (1440px), `container-wide` (1680px), `container-prose`; `grid-page` (4/6/12 cols); gutters 16/24/32px; `py-section-sm/md/lg`                                                                                                |
| Motion        | 160ms micro · 240ms base · 300ms overlay · 600ms reveal; `ease-out-quint`, `ease-in-out-cubic`, `ease-out-soft` (mirrored in `src/lib/motion.ts`)                                                                                            |
| Dark sections | `surface-dark` remaps text and line colours for the footer and editorial bands                                                                                                                                                               |

**Contrast** is enforced by `src/styles/tokens.test.ts`: every text/background pair the components use must reach 4.5:1, control borders 3:1. Stone was darkened from the brief's `#77736C` to `#66625A` and control borders set to `#938A7D` to pass.

## Components (`src/components`)

| File                               | Contents                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/button.tsx`                    | `Button` (primary/secondary/ghost/text, sm/md/lg, loading), `ButtonLink`, `IconButton`, `buttonStyles()`                                                             |
| `ui/field.tsx`                     | `TextField`, `TextAreaField`, `SelectField`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `FieldHint`, `FieldError` — ids, hints and errors wired for screen readers |
| `ui/quantity-stepper.tsx`          | Bounded quantity input                                                                                                                                               |
| `ui/accordion.tsx`, `ui/tabs.tsx`  | Disclosure patterns (WAI-ARIA)                                                                                                                                       |
| `ui/dialog.tsx`                    | `Dialog`, `Drawer` (right/left/bottom) on the native `<dialog>` element                                                                                              |
| `ui/popover.tsx`, `ui/tooltip.tsx` | Dropdown panel; hint tooltip                                                                                                                                         |
| `ui/toast.tsx`                     | `ToastProvider` + `useToast()` (polite live region)                                                                                                                  |
| `ui/display.tsx`                   | `Badge`, `Price`, `Breadcrumbs`, `Pagination`, `Skeleton`, `EmptyState`, `ErrorState`, `Notice`, `Divider`, `VisuallyHidden`                                         |
| `ui/responsive-image.tsx`          | Fixed-ratio `next/image` wrapper; `cld:` sources resize through Cloudinary                                                                                           |
| `ui/placeholder-image.tsx`         | Generated stone textures, always labelled "Placeholder"                                                                                                              |
| `ui/icons.tsx`                     | Hairline icon set                                                                                                                                                    |
| `brand/wordmark.tsx`               | `Wordmark` (inline/stacked), `Monogram`                                                                                                                              |
| `motion/primitives.tsx`            | `MotionProvider`, `Reveal`, `StaggerText`, `MaskReveal`, `FadeSwap`, `AnimatedCount`                                                                                 |
| `store/product-card.tsx`           | Presentational product card                                                                                                                                          |

## Rules

1. Money is integer paise everywhere; format only with `formatMoney()` / `<Price>`.
2. Every image has a fixed aspect ratio and a `sizes` attribute.
3. One primary button per view.
4. Animate `transform` and `opacity` only. Reveals run once. All motion respects `prefers-reduced-motion`; `<noscript>` shows reveal content without JavaScript.
5. Icon-only buttons always have an accessible name (`IconButton label`).
6. Dark mode is not offered on the storefront (brand decision); use `surface-dark` for dark bands.
