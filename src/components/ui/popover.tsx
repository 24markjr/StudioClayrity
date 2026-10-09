"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

/**
 * Disclosure-style popover (button + panel). Closes on outside click, Escape (returning
 * focus to the trigger) and when focus leaves the component.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  className,
  panelClassName,
}: {
  /** Render prop for the trigger so callers style it; spread the props onto a <button>. */
  trigger: (props: {
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
    id: string;
  }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const triggerId = `${baseId}-trigger`;
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById(triggerId)?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, triggerId]);

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-block", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {trigger({
        "aria-expanded": open,
        "aria-controls": panelId,
        onClick: () => setOpen((v) => !v),
        id: triggerId,
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: duration.base, ease: ease.outQuint }}
            className={cn(
              "border-line bg-soft-white absolute top-full z-40 mt-2 min-w-56 border py-2 shadow-[0_12px_32px_-12px_rgb(39_38_34/0.18)]",
              align === "end" ? "right-0" : "left-0",
              panelClassName,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
