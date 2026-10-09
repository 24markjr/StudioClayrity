"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

export type AccordionItem = {
  id: string;
  title: ReactNode;
  content: ReactNode;
};

export function Accordion({
  items,
  defaultOpen = [],
  allowMultiple = true,
  className,
}: {
  items: AccordionItem[];
  defaultOpen?: string[];
  allowMultiple?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const baseId = useId();

  function toggle(id: string) {
    setOpen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : allowMultiple ? [...current, id] : [id],
    );
  }

  return (
    <div className={cn("border-line border-t", className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id} className="border-line border-b">
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="type-label text-charcoal hover:text-earth flex w-full items-center justify-between gap-4 py-5 text-left transition-colors duration-160"
              >
                <span>{item.title}</span>
                <span aria-hidden="true" className="relative size-3 shrink-0">
                  <span className="absolute top-1/2 left-0 h-px w-3 bg-current" />
                  <span
                    className={cn(
                      "ease-out-quint absolute top-1/2 left-0 h-px w-3 bg-current transition-transform duration-240",
                      isOpen ? "rotate-0" : "rotate-90",
                    )}
                  />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: duration.overlay, ease: ease.outQuint }}
                  className="overflow-hidden"
                >
                  <div className="type-small text-stone pb-6">{item.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
