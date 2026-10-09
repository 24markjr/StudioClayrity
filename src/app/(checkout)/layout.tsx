import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/** Checkout keeps the page quiet: no navigation, footer or chat button to pull focus away. */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-line border-b">
        <div className="container-page h-header flex items-center justify-between">
          <Link href="/" aria-label="Studio Clayrity — home" className="text-[0.95rem] sm:text-lg">
            <Wordmark />
          </Link>
          <Link
            href="/bag"
            className="type-small text-stone hover:text-charcoal underline-offset-4 hover:underline"
          >
            Back to bag
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="container-page type-caption text-stone py-8">
        Secure checkout · Prices include GST
      </footer>
    </>
  );
}
