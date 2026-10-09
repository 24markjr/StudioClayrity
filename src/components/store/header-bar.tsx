"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Drawer } from "@/components/ui/dialog";
import { ChevronDownIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { CatalogImage } from "./catalog-image";
import { SearchOverlay } from "./search-overlay";

export type HeaderNav = {
  categories: Array<{ slug: string; name: string }>;
  collections: Array<{ slug: string; name: string; cover: string | null }>;
  showAbout: boolean;
};

const navLink =
  "type-label text-charcoal relative py-2 transition-colors duration-160 hover:text-earth after:absolute after:inset-x-0 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-out-quint hover:after:scale-x-100";

export function HeaderBar({ nav }: { nav: HeaderNav }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const shopId = useId();
  const shopRef = useRef<HTMLDivElement>(null);
  const featured = nav.collections[0];

  // "/" and Ctrl/⌘+K open search (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setShopOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mega menu on outside click
  useEffect(() => {
    if (!shopOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!shopRef.current?.contains(e.target as Node)) setShopOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shopOpen]);

  const quickLinks = [
    { label: "All pieces", href: "/shop" },
    ...nav.categories.map((c) => ({ label: c.name, href: `/shop/${c.slug}` })),
    ...nav.collections.slice(0, 2).map((c) => ({ label: c.name, href: `/collections/${c.slug}` })),
  ];

  return (
    <>
      <div className="container-wide h-header grid grid-cols-[1fr_auto_1fr] items-center">
        {/* Left: desktop navigation / mobile menu button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="-ml-2 flex size-11 items-center justify-center lg:hidden"
          >
            <MenuIcon />
          </button>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-8">
              <li>
                <div ref={shopRef} onMouseLeave={() => setShopOpen(false)}>
                  <button
                    type="button"
                    aria-expanded={shopOpen}
                    aria-controls={shopId}
                    onClick={() => setShopOpen((v) => !v)}
                    onMouseEnter={() => setShopOpen(true)}
                    className={cn(navLink, "flex items-center gap-1")}
                  >
                    Shop
                    <ChevronDownIcon
                      className={cn("size-3.5 transition-transform duration-240", shopOpen && "rotate-180")}
                    />
                  </button>
                  <AnimatePresence>
                    {shopOpen && (
                      <motion.div
                        id={shopId}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: duration.base, ease: ease.outQuint }}
                        className="border-line bg-ivory absolute inset-x-0 top-full z-40 border-y"
                      >
                        <div className="container-wide grid grid-cols-12 gap-8 py-10">
                          <div className="col-span-3">
                            <p className="type-overline text-stone">Shop by object</p>
                            <ul className="mt-4 space-y-3">
                              <li>
                                <Link
                                  href="/shop"
                                  onClick={() => setShopOpen(false)}
                                  className="type-h4 hover:text-earth"
                                >
                                  All pieces
                                </Link>
                              </li>
                              {nav.categories.map((c) => (
                                <li key={c.slug}>
                                  <Link
                                    href={`/shop/${c.slug}`}
                                    onClick={() => setShopOpen(false)}
                                    className="type-h4 hover:text-earth"
                                  >
                                    {c.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="col-span-3">
                            <p className="type-overline text-stone">Collections</p>
                            <ul className="mt-4 space-y-3">
                              {nav.collections.map((c) => (
                                <li key={c.slug}>
                                  <Link
                                    href={`/collections/${c.slug}`}
                                    onClick={() => setShopOpen(false)}
                                    className="type-body hover:text-earth"
                                  >
                                    {c.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {featured && (
                            <Link
                              href={`/collections/${featured.slug}`}
                              onClick={() => setShopOpen(false)}
                              className="group col-span-4 col-start-9 block"
                            >
                              <CatalogImage
                                src={featured.cover}
                                alt={featured.name}
                                ratio="3/2"
                                sizes="30vw"
                              />
                              <span className="type-label group-hover:text-earth mt-3 block">
                                {featured.name}
                              </span>
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </li>
              <li>
                <Link href="/collections" className={navLink}>
                  Collections
                </Link>
              </li>
              {nav.showAbout && (
                <li>
                  <Link href="/about" className={navLink}>
                    Our story
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>

        <Link href="/" aria-label="Studio Clayrity — home" className="text-[0.95rem] sm:text-lg md:text-xl">
          <Wordmark />
        </Link>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            aria-keyshortcuts="/ Control+K Meta+K"
            className="-mr-2 flex size-11 items-center justify-center"
          >
            <SearchIcon />
          </button>
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="Menu">
        <nav aria-label="Mobile">
          <ul className="space-y-1">
            <li>
              <Link href="/shop" onClick={() => setMenuOpen(false)} className="type-h3 block py-2">
                All pieces
              </Link>
            </li>
            {nav.categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/shop/${c.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="type-h3 block py-2"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="type-overline text-stone mt-10">Collections</p>
          <ul className="mt-3 space-y-1">
            {nav.collections.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/collections/${c.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="type-body block py-2"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          {nav.showAbout && (
            <Link href="/about" onClick={() => setMenuOpen(false)} className="type-body mt-8 block py-2">
              Our story
            </Link>
          )}
        </nav>
      </Drawer>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} quickLinks={quickLinks} />
    </>
  );
}
