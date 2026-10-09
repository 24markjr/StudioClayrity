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
import { useToast } from "@/components/ui/toast";
import {
  addToBag,
  applyBagCoupon,
  getBag,
  removeBagCoupon,
  updateBagGift,
  updateBagQuantity,
  type BagActionResult,
} from "@/lib/cart/actions";
import { EMPTY_BAG, type BagView } from "@/lib/cart/types";

type BagContextValue = {
  bag: BagView;
  /** False until the bag has loaded from the server */
  ready: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Variant currently being added (for button spinners) */
  adding: string | null;
  add: (variantId: string, quantity: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  applyCoupon: (code: string) => Promise<string | null>;
  removeCoupon: () => void;
  updateGift: (input: {
    giftWrap?: boolean;
    giftMessage?: string | null;
    hidePrices?: boolean;
  }) => Promise<string | null>;
};

const BagContext = createContext<BagContextValue | null>(null);

export function useBag() {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used inside <BagProvider>");
  return ctx;
}

/** Apply a quantity change locally so the UI responds before the server confirms. */
function optimisticQuantity(bag: BagView, change: { variantId: string; quantity: number }): BagView {
  const lines = bag.lines
    .map((l) =>
      l.variantId === change.variantId
        ? { ...l, quantity: change.quantity, lineTotal: l.unitPrice * change.quantity }
        : l,
    )
    .filter((l) => l.quantity > 0);
  const buyable = lines.filter((l) => l.available);
  const subtotal = buyable.reduce((s, l) => s + l.lineTotal, 0);
  return {
    ...bag,
    lines,
    itemCount: buyable.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    total: bag.total - bag.subtotal + subtotal,
    notices: [],
  };
}

export function BagProvider({ children }: { children: ReactNode }) {
  const [serverBag, setServerBag] = useState<BagView>(EMPTY_BAG);
  const [bag, applyOptimistic] = useOptimistic(serverBag, optimisticQuantity);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    getBag()
      .then((b) => !cancelled && setServerBag(b))
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const handle = useCallback(
    (result: BagActionResult, options: { toastErrors?: boolean } = {}) => {
      setServerBag(result.bag);
      if (result.message) setAnnouncement(result.message);
      if (options.toastErrors && result.tone && result.tone !== "success" && result.message) {
        toast({ tone: result.tone === "error" ? "error" : "neutral", title: result.message });
      }
    },
    [toast],
  );

  const failed = useCallback(() => {
    toast({
      tone: "error",
      title: "We couldn't update your bag",
      description: "Check your connection and try again.",
    });
  }, [toast]);

  const add = useCallback(
    async (variantId: string, quantity: number) => {
      setAdding(variantId);
      try {
        const result = await addToBag({ variantId, quantity });
        handle(result, { toastErrors: true });
        if (result.tone !== "error") setOpen(true);
      } catch {
        failed();
      } finally {
        setAdding(null);
      }
    },
    [handle, failed],
  );

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      startTransition(async () => {
        applyOptimistic({ variantId, quantity });
        try {
          handle(await updateBagQuantity({ variantId, quantity }));
        } catch {
          failed();
          setServerBag(await getBag().catch(() => serverBag));
        }
      });
    },
    [applyOptimistic, handle, failed, serverBag],
  );

  const value = useMemo<BagContextValue>(
    () => ({
      bag,
      ready,
      open,
      setOpen,
      adding,
      add,
      setQuantity,
      remove: (variantId) => setQuantity(variantId, 0),
      applyCoupon: async (code) => {
        try {
          const result = await applyBagCoupon(code);
          handle(result);
          return result.tone === "error" ? (result.message ?? "That code didn't work.") : null;
        } catch {
          return "We couldn't check that code. Please try again.";
        }
      },
      removeCoupon: () => {
        startTransition(async () => {
          try {
            handle(await removeBagCoupon());
          } catch {
            failed();
          }
        });
      },
      updateGift: async (input) => {
        try {
          const result = await updateBagGift(input);
          handle(result);
          return result.tone === "error" ? (result.message ?? null) : null;
        } catch {
          failed();
          return "We couldn't save that. Please try again.";
        }
      },
    }),
    [bag, ready, open, adding, add, setQuantity, handle, failed],
  );

  return (
    <BagContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </BagContext.Provider>
  );
}

/** For components that also render when the bag feature is off. */
export function useBagOptional() {
  return useContext(BagContext);
}
