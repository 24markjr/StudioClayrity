"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/ui/icons";

const KEY = "sc-announcement-dismissed";

function readDismissed(message: string) {
  try {
    return sessionStorage.getItem(KEY) === message;
  } catch {
    return false;
  }
}

/** Dismissible for the browser session; a new message shows again. */
export function AnnouncementBar({ message, href }: { message: string; href?: string }) {
  const dismissed = useSyncExternalStore(
    (notify) => {
      window.addEventListener("sc-announcement", notify);
      return () => window.removeEventListener("sc-announcement", notify);
    },
    () => readDismissed(message),
    () => false,
  );
  if (dismissed) return null;

  return (
    <div className="bg-charcoal text-ivory relative">
      <p className="type-caption container-page py-2.5 pr-12 text-center tracking-[0.06em]">
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {message}
          </Link>
        ) : (
          message
        )}
      </p>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, message);
          } catch {
            // storage unavailable — the bar simply stays
          }
          window.dispatchEvent(new Event("sc-announcement"));
        }}
        className="text-taupe hover:text-ivory absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
