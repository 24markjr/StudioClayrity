import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/store/site-chrome";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="type-label bg-charcoal text-ivory sr-only z-50 px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppButton />
    </>
  );
}
