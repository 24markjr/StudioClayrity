"use client";

import Link from "next/link";
import { AnimatedCount } from "@/components/motion/primitives";
import { Drawer } from "@/components/ui/dialog";
import { BagIcon, HeartIcon } from "@/components/ui/icons";
import { BagExtras, BagLines, BagLoading, BagNotices, BagTotals, EmptyBag } from "./bag-contents";
import { useBag } from "./bag-provider";
import { useWishlist } from "./wishlist-provider";

export function BagDrawer({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const { bag, ready, open, setOpen } = useBag();
  const close = () => setOpen(false);
  const hasLines = bag.lines.length > 0;
  return (
    <Drawer
      open={open}
      onClose={close}
      title={`Your bag${bag.itemCount ? ` (${bag.itemCount})` : ""}`}
      footer={hasLines ? <BagTotals checkoutEnabled={checkoutEnabled} /> : undefined}
    >
      {!ready ? (
        <BagLoading />
      ) : !hasLines ? (
        <EmptyBag onNavigate={close} />
      ) : (
        <div className="space-y-6">
          <BagNotices bag={bag} />
          <BagLines compact onNavigate={close} />
          <div className="border-line border-t pt-6">
            <BagExtras />
          </div>
          <Link
            href="/bag"
            onClick={close}
            className="type-small hover:text-earth block underline underline-offset-4"
          >
            View full bag
          </Link>
        </div>
      )}
    </Drawer>
  );
}

export function BagButton() {
  const { bag, setOpen } = useBag();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Bag, ${bag.itemCount} ${bag.itemCount === 1 ? "item" : "items"}`}
      className="relative flex size-11 items-center justify-center"
    >
      <BagIcon />
      {bag.itemCount > 0 && (
        <span
          aria-hidden="true"
          className="type-caption bg-charcoal text-ivory absolute top-1.5 right-0.5 flex h-4 min-w-4 items-center justify-center px-1 text-[0.625rem] leading-none"
        >
          <AnimatedCount value={bag.itemCount} />
        </span>
      )}
    </button>
  );
}

export function WishlistLink() {
  const wishlist = useWishlist();
  if (!wishlist) return null;
  return (
    <Link
      href="/wishlist"
      aria-label={`Wishlist, ${wishlist.count} saved`}
      className="relative hidden size-11 items-center justify-center sm:flex"
    >
      <HeartIcon filled={wishlist.count > 0} />
    </Link>
  );
}
