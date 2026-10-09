import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { MaskReveal, Reveal, StaggerText } from "@/components/motion/primitives";
import { ButtonLink } from "@/components/ui/button";
import { BagIcon, MenuIcon, SearchIcon, UserIcon } from "@/components/ui/icons";
import { PlaceholderImage } from "@/components/ui/placeholder-image";
import { assertStyleguideEnabled } from "../guard";

export const metadata: Metadata = { title: "Hero mockup" };

/**
 * Static homepage hero mockup for owner approval (Phase 2 acceptance).
 * Copy is illustrative; the real header, data and imagery arrive in Phase 4.
 */
export default function HeroMockupPage() {
  assertStyleguideEnabled();

  const nav = ["Shop", "Collections", "Bespoke", "Our story"];

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="type-caption bg-charcoal text-ivory py-2.5 text-center tracking-[0.08em]">
        Insured shipping across India · Mockup announcement bar
      </div>

      <header className="container-wide h-header grid grid-cols-[1fr_auto_1fr] items-center">
        <nav aria-label="Primary" className="hidden gap-8 lg:flex">
          {nav.map((item) => (
            <Link key={item} href="#" className="type-label text-charcoal hover:text-earth transition-colors">
              {item}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          aria-label="Open menu"
          className="-ml-2 flex size-11 items-center justify-center lg:hidden"
        >
          <MenuIcon />
        </button>
        <Link
          href="/styleguide"
          aria-label="Studio Clayrity — home"
          className="text-[0.95rem] sm:text-lg md:text-xl"
        >
          <Wordmark />
        </Link>
        <div className="flex items-center justify-end gap-1">
          <button type="button" aria-label="Search" className="flex size-11 items-center justify-center">
            <SearchIcon />
          </button>
          <button
            type="button"
            aria-label="Account"
            className="hidden size-11 items-center justify-center sm:flex"
          >
            <UserIcon />
          </button>
          <button
            type="button"
            aria-label="Bag, 0 items"
            className="flex size-11 items-center justify-center"
          >
            <BagIcon />
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: asymmetric editorial split on desktop, image-first stack on mobile */}
        <section className="container-wide pb-section-sm grid gap-8 pt-4 lg:grid-cols-12 lg:gap-x-8 lg:pt-8">
          <div className="order-2 flex flex-col justify-end lg:order-1 lg:col-span-5 lg:pb-12">
            <Reveal delay={0.6}>
              <p className="type-overline text-stone">The Stone Edit</p>
            </Reveal>
            <StaggerText
              as="h1"
              text="Objects shaped by stone and time"
              className="type-display mt-5 block"
              delay={0.2}
            />
            <Reveal delay={0.9}>
              <p className="type-body-lg text-stone mt-6 max-w-md">
                Decor pieces in marble and natural stone, each with veining of its own. Made to be kept for a
                lifetime.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <ButtonLink href="#" size="lg">
                  Explore the collection
                </ButtonLink>
                <ButtonLink href="#" size="lg" variant="text">
                  Our story
                </ButtonLink>
              </div>
            </Reveal>
          </div>

          <div className="order-1 grid grid-cols-6 gap-3 lg:order-2 lg:col-span-7 lg:gap-4">
            <MaskReveal className="col-span-6 md:col-span-4" delay={0.1}>
              <PlaceholderImage
                tone="white-marble"
                ratio="4/5"
                // Shorter crop on phones so the headline and CTA sit closer to the fold
                className="aspect-[4/3] sm:aspect-[4/5]"
                label="Hero: bowl on console, window light"
              />
            </MaskReveal>
            <div className="col-span-6 hidden flex-col justify-end gap-4 md:col-span-2 md:flex">
              <MaskReveal delay={0.35}>
                <PlaceholderImage tone="green-marble" ratio="3/4" label="Detail: veining" />
              </MaskReveal>
              <Reveal delay={1.1}>
                <p className="type-caption text-stone">
                  Pictured: Verde vase, one of a kind.
                  <br />
                  Natural variation is expected.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="surface-dark">
          <div className="container-page py-section-md grid gap-8 lg:grid-cols-12">
            <Reveal className="lg:col-span-7 lg:col-start-3">
              <p className="type-overline text-stone">Philosophy</p>
              <p className="type-h2 mt-6">
                Fewer, better things. Pieces chosen for the way light moves across their surface.
              </p>
            </Reveal>
          </div>
        </section>

        <p className="container-page type-caption text-stone py-8">
          Mockup for review — copy is illustrative and images are placeholders. The full homepage is built in
          Phase 4.
        </p>
      </main>
    </div>
  );
}
