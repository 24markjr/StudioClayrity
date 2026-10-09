import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Monogram, Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Breadcrumbs,
  Divider,
  EmptyState,
  ErrorState,
  Notice,
  Pagination,
  Price,
  Skeleton,
} from "@/components/ui/display";
import { ArrowRightIcon } from "@/components/ui/icons";
import { PlaceholderImage } from "@/components/ui/placeholder-image";
import { TextLink } from "@/components/ui/text-link";
import { ButtonDemo, DisclosureDemo, FormDemo, MotionDemo, OverlayDemo, ProductCardDemo } from "./demos";
import { assertStyleguideEnabled } from "./guard";

export const metadata: Metadata = { title: "Style guide" };

const palette = [
  { name: "Ivory", token: "ivory", hex: "#F7F5F0", use: "Page background" },
  { name: "Soft white", token: "soft-white", hex: "#FCFBF8", use: "Inputs, raised surfaces" },
  { name: "Limestone", token: "limestone", hex: "#E7E0D5", use: "Image wells, subtle fills" },
  { name: "Taupe", token: "taupe", hex: "#A69A89", use: "Decorative lines; muted text on dark" },
  { name: "Stone", token: "stone", hex: "#66625A", use: "Secondary text (AA on all light surfaces)" },
  { name: "Earth", token: "earth", hex: "#51443A", use: "Accent, hover states" },
  { name: "Charcoal", token: "charcoal", hex: "#272622", use: "Text, primary buttons, dark sections" },
  { name: "Line", token: "line", hex: "#E5E0D7", use: "Hairline borders" },
  { name: "Line strong", token: "line-strong", hex: "#938A7D", use: "Control borders (3:1)" },
];

const semantic = [
  { name: "Success", fg: "text-success", bg: "bg-success-bg" },
  { name: "Error", fg: "text-error", bg: "bg-error-bg" },
  { name: "Warning", fg: "text-warning", bg: "bg-warning-bg" },
  { name: "Info", fg: "text-info", bg: "bg-info-bg" },
];

const typeScale = [
  { cls: "type-display", label: "Display", sample: "Quiet forms" },
  { cls: "type-h1", label: "H1 / Page title", sample: "The Stone Collection" },
  { cls: "type-h2", label: "H2 / Section", sample: "Made to be lived with" },
  { cls: "type-h3", label: "H3", sample: "Material & craft" },
  { cls: "type-h4", label: "H4", sample: "Dimensions & weight" },
  { cls: "type-product-title", label: "Product title", sample: "Nero Marble Bowl" },
  { cls: "type-card-title", label: "Card title", sample: "Verde Sculptural Vase" },
  {
    cls: "type-body-lg",
    label: "Body large",
    sample: "Each piece carries its own veining, so no two are alike.",
  },
  {
    cls: "type-body",
    label: "Body",
    sample: "Wipe with a soft, damp cloth. Avoid acidic liquids and abrasive cleaners.",
  },
  { cls: "type-small", label: "Small", sample: "Inclusive of all taxes. Shipping calculated at checkout." },
  { cls: "type-caption", label: "Caption", sample: "Ø 32 cm × H 9 cm · 3.4 kg" },
  { cls: "type-overline", label: "Overline", sample: "New collection" },
  { cls: "type-button", label: "Button", sample: "Add to bag" },
  { cls: "type-price", label: "Price", sample: "₹ 24,000" },
];

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-line py-section-sm scroll-mt-8 border-t"
    >
      <div className="mb-10 grid gap-3 lg:grid-cols-12">
        <h2 id={`${id}-title`} className="type-h3 lg:col-span-4">
          {title}
        </h2>
        {intro && <p className="type-small text-stone max-w-xl lg:col-span-6 lg:col-start-6">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  assertStyleguideEnabled();

  const sections = [
    ["brand", "Brand"],
    ["colour", "Colour"],
    ["type", "Typography"],
    ["layout", "Layout"],
    ["buttons", "Buttons"],
    ["forms", "Forms"],
    ["disclosure", "Accordion & tabs"],
    ["overlays", "Overlays & feedback"],
    ["commerce", "Commerce"],
    ["states", "States"],
    ["imagery", "Imagery"],
    ["motion", "Motion"],
  ] as const;

  return (
    <main className="container-page pb-section-md">
      <header className="py-section-sm flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="type-overline text-stone">Phase 2 · Design system</p>
          <h1 className="type-h1 mt-4">Style guide</h1>
          <p className="type-body-lg text-stone mt-4 max-w-xl">
            Every token and component the storefront is built from. Review here before pages are assembled.
          </p>
        </div>
        <ButtonLink
          href="/styleguide/hero"
          variant="secondary"
          iconEnd={<ArrowRightIcon className="size-4" />}
        >
          Homepage hero mockup
        </ButtonLink>
      </header>

      <nav aria-label="Style guide sections" className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        {sections.map(([id, label]) => (
          <TextLink key={id} href={`#${id}`} className="type-small text-stone hover:text-charcoal">
            {label}
          </TextLink>
        ))}
      </nav>

      <Section
        id="brand"
        title="Brand"
        intro="A typographic wordmark set in Cormorant Garamond with open tracking, plus an SC monogram for favicons and avatars. To be replaced if the client supplies a logo."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-soft-white flex aspect-[3/2] items-center justify-center">
            <Wordmark className="text-2xl md:text-3xl" />
          </div>
          <div className="surface-dark flex aspect-[3/2] items-center justify-center">
            <Wordmark layout="stacked" className="text-3xl" />
          </div>
          <div className="bg-limestone flex aspect-[3/2] items-center justify-center gap-6">
            <Monogram className="size-20" />
            <Monogram className="size-10" />
          </div>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div>
            <p className="type-overline text-stone">Voice</p>
            <p className="type-small mt-2">Calm, precise, sensory. Describe what can be seen and touched.</p>
          </div>
          <div>
            <p className="type-overline text-stone">Avoid</p>
            <p className="type-small mt-2">Hype words, exclamation marks, urgency, unverified claims.</p>
          </div>
          <div>
            <p className="type-overline text-stone">Example</p>
            <p className="type-small mt-2 italic">
              &ldquo;A low bowl in honed marble. The grey veining runs differently through every piece.&rdquo;
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="colour"
        title="Colour"
        intro="A warm, material palette. Stone was darkened from the brief's #77736C to #66625A so secondary text passes WCAG AA on every light surface — enforced by an automated test."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {palette.map((c) => (
            <li key={c.token}>
              <div className="border-line aspect-[4/3] border" style={{ backgroundColor: c.hex }} />
              <p className="type-label mt-3">{c.name}</p>
              <p className="type-caption text-stone">
                {c.hex} · <code>{c.token}</code>
              </p>
              <p className="type-caption text-stone">{c.use}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {semantic.map((s) => (
            <div key={s.name} className={`${s.bg} ${s.fg} type-small px-4 py-3`}>
              {s.name} message
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="type"
        title="Typography"
        intro="Cormorant Garamond for display and product names; Manrope for everything functional. Sizes are fluid — they scale smoothly between mobile and desktop."
      >
        <dl className="divide-line divide-y">
          {typeScale.map((t) => (
            <div key={t.cls} className="grid gap-2 py-5 md:grid-cols-12 md:items-baseline">
              <dt className="type-caption text-stone md:col-span-3">
                {t.label}
                <br />
                <code>{t.cls}</code>
              </dt>
              <dd className={`${t.cls} min-w-0 md:col-span-9`}>{t.sample}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="layout"
        title="Layout"
        intro="4-column grid on mobile, 6 on tablet, 12 on desktop. Gutters are 16 / 24 / 32px. Content max width 1440px; full-bleed editorial up to 1680px. Section spacing is fluid (section-sm / md / lg)."
      >
        <div className="grid-page">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className={`type-caption bg-limestone text-stone flex h-20 items-end p-2 ${i >= 4 ? "hidden md:flex" : ""} ${i >= 6 ? "md:hidden lg:flex" : ""}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-end gap-6">
          {[
            ["section-sm", "h-section-sm"],
            ["section-md", "h-section-md"],
            ["section-lg", "h-section-lg"],
          ].map(([label, h]) => (
            <div key={label} className="flex items-end gap-2">
              <div className={`${h} bg-taupe w-4`} />
              <span className="type-caption text-stone">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        intro="Square corners, uppercase tracked labels. Primary for the one main action on a screen; secondary for alternatives; text for low-emphasis links. Loading keeps the width steady."
      >
        <ButtonDemo />
        <div className="mt-8 flex flex-wrap gap-8">
          <TextLink href="#buttons" className="type-small">
            Hover underline link
          </TextLink>
          <TextLink href="#buttons" variant="persistent" className="type-small">
            Persistent underline (in body copy)
          </TextLink>
        </div>
      </Section>

      <Section
        id="forms"
        title="Forms"
        intro="Labels always visible, hints and errors linked to their field for screen readers. Errors appear on submit or blur, never while typing."
      >
        <FormDemo />
      </Section>

      <Section
        id="disclosure"
        title="Accordion & tabs"
        intro="Product details use the accordion; tabs are available for dense admin views."
      >
        <DisclosureDemo />
      </Section>

      <Section
        id="overlays"
        title="Overlays & feedback"
        intro="Dialogs and drawers use the native <dialog> element: focus is trapped, Escape closes, the page behind is inert. Toasts are announced politely to screen readers."
      >
        <OverlayDemo />
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          <Notice tone="info" title="Made to order">
            Ships in approximately 3 weeks. We&apos;ll email you when it&apos;s on its way.
          </Notice>
          <Notice tone="success">Your enquiry has been sent. We reply within one business day.</Notice>
          <Notice tone="warning" title="Price updated">
            The price of one item in your bag has changed since you added it.
          </Notice>
          <Notice tone="error">This piece has just been reserved by another customer.</Notice>
        </div>
      </Section>

      <Section
        id="commerce"
        title="Commerce"
        intro="Product cards carry only image, name, price and one quiet status label. Hover a card to see the scale and alternate-image cross-fade."
      >
        <ProductCardDemo />
        <Divider className="my-12" />
        <div className="grid gap-10 md:grid-cols-3">
          <div className="grid gap-3">
            <p className="type-overline text-stone">Prices</p>
            <Price amount={850000} />
            <Price amount={550000} compareAt={650000} />
            <Price amount={2400000} size="lg" />
          </div>
          <div className="flex flex-wrap content-start gap-2">
            <p className="type-overline text-stone w-full">Badges</p>
            <Badge>One of a kind</Badge>
            <Badge tone="outline">Made to order · 3 weeks</Badge>
            <Badge tone="dark">Sold</Badge>
            <Badge tone="success">In stock</Badge>
            <Badge tone="error">Unavailable</Badge>
          </div>
          <div className="grid content-start gap-6">
            <p className="type-overline text-stone">Navigation</p>
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Bowls", href: "#" },
                { label: "Nero Marble Bowl" },
              ]}
            />
            <Pagination current={3} total={8} hrefFor={(p) => `/styleguide?page=${p}#commerce`} />
          </div>
        </div>
      </Section>

      <Section
        id="states"
        title="States"
        intro="Every list and data view has loading, empty and error states."
      >
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <p className="type-overline text-stone mb-4">Loading</p>
            <div className="grid grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-[4/5]" />
                  <Skeleton className="mt-4 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/3" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-soft-white">
            <EmptyState
              title="Your bag is empty"
              description="Pieces you add will appear here."
              action={<ButtonLink href="#commerce">Explore the collection</ButtonLink>}
            />
          </div>
          <div className="bg-soft-white">
            <ErrorState
              action={
                <ButtonLink href="#states" variant="secondary">
                  Try again
                </ButtonLink>
              }
            />
          </div>
        </div>
      </Section>

      <Section
        id="imagery"
        title="Imagery"
        intro="Product images are 4:5, collections 3:4, editorial 3:2 or 16:9. Until real photography arrives, generated stone textures stand in — always labelled 'Placeholder'."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <PlaceholderImage tone="white-marble" label="White marble" />
          <PlaceholderImage tone="green-marble" label="Green marble" />
          <PlaceholderImage tone="travertine" label="Travertine" />
          <PlaceholderImage tone="charcoal-stone" label="Charcoal stone" />
          <PlaceholderImage tone="clay" label="Clay" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PlaceholderImage tone="travertine" ratio="3/2" label="Editorial 3:2" />
          <PlaceholderImage tone="white-marble" ratio="16/9" label="Editorial 16:9" />
        </div>
      </Section>

      <Section
        id="motion"
        title="Motion"
        intro="Durations: 160ms micro · 240ms base · 300ms overlays · 600ms reveals. Reveals use an out-quint ease; drawers in-out-cubic. With reduced motion enabled in the OS, movement is removed and only fades remain."
      >
        <MotionDemo />
      </Section>
    </main>
  );
}
