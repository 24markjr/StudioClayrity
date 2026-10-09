"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/utils/money";
import { CatalogImage } from "./catalog-image";

type Suggestion = {
  slug: string;
  name: string;
  price: number;
  priceVaries: boolean;
  image: { src: string; alt: string } | null;
};

/**
 * Search overlay: instant suggestions while typing (debounced), Enter for the full results
 * page. Opens from the header icon, "/" or Ctrl/⌘+K. Built on the native <dialog>, so focus
 * is trapped and Escape closes it.
 */
export function SearchOverlay({
  open,
  onClose,
  quickLinks,
}: {
  open: boolean;
  onClose: () => void;
  quickLinks: Array<{ label: string; href: string }>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const listId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Close on navigation away (the hidden page must not keep the document inert)
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        setResults(((await response.json()) as { results: Suggestion[] }).results);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const term = query.trim();
  const showResults = term.length >= 2;

  function close() {
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search"
      onClose={close}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      className="sc-overlay sc-drawer bg-ivory text-charcoal m-0 mb-auto max-h-[90dvh] w-full max-w-none p-0"
      data-side="top"
    >
      <div className="container-page py-5 sm:py-8">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (term.length < 2) return;
            close();
            router.push(`/search?q=${encodeURIComponent(term)}`);
          }}
          className="border-charcoal flex items-center gap-3 border-b pb-3"
        >
          <SearchIcon className="text-stone size-5 shrink-0" />
          <label htmlFor={`${listId}-input`} className="sr-only">
            Search products
          </label>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bowls, travertine, gifts…"
            autoComplete="off"
            enterKeyHint="search"
            aria-controls={listId}
            className="type-h4 placeholder:text-stone/60 min-w-0 flex-1 bg-transparent focus-visible:outline-none"
          />
          {loading && <Spinner label="Searching" />}
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="flex size-10 items-center justify-center"
          >
            <CloseIcon />
          </button>
        </form>

        <div id={listId} aria-live="polite" className="max-h-[60dvh] overflow-y-auto pt-6">
          {!showResults && (
            <div>
              <p className="type-overline text-stone">Browse</p>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} onClick={close} className="type-body hover:text-earth">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showResults && failed && (
            <p className="type-small text-error">Search isn&apos;t available right now. Please try again.</p>
          )}

          {showResults && !failed && results && results.length === 0 && !loading && (
            <p className="type-small text-stone">
              No pieces match &ldquo;{term}&rdquo;. Try a material (marble, travertine) or an object (bowl,
              vase).
            </p>
          )}

          {showResults && results && results.length > 0 && (
            <>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {results.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/products/${r.slug}`} onClick={close} className="group block">
                      <CatalogImage
                        src={r.image?.src}
                        alt={r.image?.alt ?? r.name}
                        sizes="(min-width: 64rem) 15vw, 45vw"
                      />
                      <span className="type-small group-hover:text-earth mt-2 block">{r.name}</span>
                      <span className="type-caption text-stone">
                        {r.priceVaries ? "From " : ""}
                        {formatMoney(r.price)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`/search?q=${encodeURIComponent(term)}`}
                onClick={close}
                className="type-button mt-6 inline-block underline underline-offset-4"
              >
                See all results
              </Link>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
