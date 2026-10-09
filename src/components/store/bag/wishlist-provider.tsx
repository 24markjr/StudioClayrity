"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  type ReactNode,
} from "react";
import { HeartIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { getWishlistIds, toggleWishlistItem } from "@/lib/cart/actions";
import { cn } from "@/lib/utils/cn";

type WishlistContextValue = {
  ids: ReadonlySet<string>;
  count: number;
  toggle: (productId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function useWishlist() {
  return useContext(WishlistContext);
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [ids, applyOptimistic] = useOptimistic(
    serverIds,
    (current: string[], change: { id: string; save: boolean }) =>
      change.save ? [...new Set([...current, change.id])] : current.filter((i) => i !== change.id),
  );
  const [announcement, setAnnouncement] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    getWishlistIds()
      .then(setServerIds)
      .catch(() => {});
  }, []);

  const toggle = useCallback(
    (productId: string) => {
      const save = !ids.includes(productId);
      startTransition(async () => {
        applyOptimistic({ id: productId, save });
        try {
          const result = await toggleWishlistItem(productId, save);
          setServerIds(result.ids);
          setAnnouncement(result.saved ? "Saved to your wishlist." : "Removed from your wishlist.");
        } catch {
          toast({
            tone: "error",
            title: "We couldn't update your wishlist",
            description: "Please try again.",
          });
        }
      });
    },
    [ids, applyOptimistic, toast],
  );

  const value = useMemo(() => ({ ids: new Set(ids), count: ids.length, toggle }), [ids, toggle]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </WishlistContext.Provider>
  );
}

/** Heart toggle. Renders nothing outside a WishlistProvider (feature off). */
export function WishlistButton({
  productId,
  productName,
  variant = "overlay",
  className,
}: {
  productId: string;
  productName: string;
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const wishlist = useWishlist();
  if (!wishlist) return null;
  const saved = wishlist.ids.has(productId);
  const label = saved ? `Remove ${productName} from your wishlist` : `Save ${productName} to your wishlist`;

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => wishlist.toggle(productId)}
        aria-pressed={saved}
        className={cn(
          "type-small hover:text-earth inline-flex items-center gap-2 underline-offset-4 hover:underline",
          className,
        )}
      >
        <HeartIcon className="size-4" filled={saved} />
        {saved ? "Saved" : "Save"}
        <span className="sr-only"> {productName} to your wishlist</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => wishlist.toggle(productId)}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={cn(
        "bg-ivory/75 hover:bg-ivory flex size-9 items-center justify-center backdrop-blur-sm transition-colors duration-160",
        className,
      )}
    >
      <HeartIcon className="size-4" filled={saved} />
    </button>
  );
}
