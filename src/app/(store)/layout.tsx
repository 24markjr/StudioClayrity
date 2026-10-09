import type { ReactNode } from "react";
import { BagDrawer } from "@/components/store/bag/bag-drawer";
import { BagProvider } from "@/components/store/bag/bag-provider";
import { WishlistProvider } from "@/components/store/bag/wishlist-provider";
import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/store/site-chrome";
import { features } from "@/lib/features";

function Providers({ children }: { children: ReactNode }) {
  let tree = children;
  if (features.wishlist) tree = <WishlistProvider>{tree}</WishlistProvider>;
  if (features.bag) {
    tree = (
      <BagProvider>
        {tree}
        <BagDrawer checkoutEnabled={features.checkout} />
      </BagProvider>
    );
  }
  return <>{tree}</>;
}

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
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
    </Providers>
  );
}
