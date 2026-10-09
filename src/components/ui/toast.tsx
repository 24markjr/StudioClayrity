"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

export type ToastTone = "neutral" | "success" | "error";

type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Optional action, e.g. "View bag" */
  action?: { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. Errors default to persistent. */
  duration?: number;
};

type ToastRecord = ToastInput & { id: number };

const ToastContext = createContext<{
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const toneIcon: Record<ToastTone, ReactNode> = {
  neutral: <InfoIcon className="size-4" />,
  success: <CheckIcon className="size-4" />,
  error: <AlertIcon className="size-4" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...input, id }]);
      const ms = input.duration ?? (input.tone === "error" ? 0 : 5000);
      if (ms > 0) window.setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region: announced without interrupting the user */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: duration.micro } }}
              transition={{ duration: duration.overlay, ease: ease.outQuint }}
              className={cn(
                "bg-charcoal text-ivory pointer-events-auto flex w-full max-w-sm items-start gap-3 px-5 py-4 shadow-[0_16px_40px_-16px_rgb(39_38_34/0.5)]",
              )}
            >
              <span className="text-taupe mt-0.5 shrink-0">{toneIcon[t.tone ?? "neutral"]}</span>
              <div className="min-w-0 flex-1">
                <p className="type-small font-medium">{t.title}</p>
                {t.description && <p className="type-small text-taupe mt-0.5">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="type-button mt-3 underline underline-offset-4"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
                className="text-taupe hover:text-ivory -mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center"
              >
                <CloseIcon className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
