"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { duration, ease } from "@/lib/motion";
import { formatMoney } from "@/lib/utils/money";

/**
 * Mobile only: once the main "Add to bag" button has scrolled above the viewport, a slim
 * bar keeps it reachable. Hidden again when the button is back in view.
 */
export function StickyBuyBar({
  target,
  name,
  price,
  loading,
  onAdd,
}: {
  target: RefObject<HTMLElement | null>;
  name: string;
  price: number;
  loading: boolean;
  onAdd: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Only after scrolling past it (not before reaching it)
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: duration.overlay, ease: ease.outQuint }}
          className="border-line bg-ivory/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur lg:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="type-small truncate">{name}</p>
              <p className="type-price">{formatMoney(price)}</p>
            </div>
            <Button onClick={onAdd} loading={loading}>
              Add to bag
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
