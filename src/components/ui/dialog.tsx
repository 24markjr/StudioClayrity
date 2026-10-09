"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./button";
import { CloseIcon } from "./icons";

/**
 * Built on the native <dialog> element: showModal() gives us the focus trap, inert
 * background, Escape-to-close and top-layer stacking for free. Enter/exit transitions
 * live in globals.css (`.sc-overlay`).
 */
function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    // Clicks on the ::backdrop land on the dialog element itself
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, []);

  return ref;
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Hide the visible title (still announced to screen readers) */
  hideTitle?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  hideTitle,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useNativeDialog(open, onClose);
  const id = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      className={cn(
        "sc-overlay sc-dialog bg-ivory text-charcoal m-auto max-h-[min(90dvh,48rem)] w-[min(calc(100vw-2rem),36rem)] p-0",
        className,
      )}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-6 px-6 pt-6 sm:px-8 sm:pt-8">
          <div>
            <h2 id={`${id}-title`} className={cn("type-h4", hideTitle && "sr-only")}>
              {title}
            </h2>
            {description && (
              <p id={`${id}-description`} className="type-small text-stone mt-2">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2">
            <CloseIcon />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
        {footer && <div className="border-line border-t px-6 py-5 sm:px-8">{footer}</div>}
      </div>
    </dialog>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  hideTitle,
  children,
  footer,
  side = "right",
  className,
}: OverlayProps & { side?: "right" | "left" | "bottom" }) {
  const ref = useNativeDialog(open, onClose);
  const id = useId();
  return (
    <dialog
      ref={ref}
      data-side={side}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      className={cn(
        "sc-overlay sc-drawer bg-ivory text-charcoal m-0 max-h-none max-w-none p-0",
        side === "bottom"
          ? "mt-auto max-h-[85dvh] w-full"
          : cn("h-dvh w-[min(100vw,28rem)]", side === "right" ? "ml-auto" : "mr-auto"),
        className,
      )}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="border-line flex items-center justify-between gap-6 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id={`${id}-title`} className={cn("type-overline", hideTitle && "sr-only")}>
              {title}
            </h2>
            {description && (
              <p id={`${id}-description`} className="type-small text-stone mt-1">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2">
            <CloseIcon />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">{children}</div>
        {footer && <div className="border-line border-t px-5 py-5 sm:px-6">{footer}</div>}
      </div>
    </dialog>
  );
}
