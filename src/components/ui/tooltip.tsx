import { useId, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * CSS-only tooltip shown on hover and keyboard focus. Use for supplementary hints only —
 * never put information here that is needed to complete a task.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}) {
  const id = useId();
  return (
    <span className="group/tooltip relative inline-flex">
      {cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "type-caption bg-charcoal text-ivory pointer-events-none absolute left-1/2 z-50 w-max max-w-60 -translate-x-1/2 px-3 py-2",
          // display:none while hidden so it never causes horizontal scroll; fades in via @starting-style
          "hidden opacity-0 transition-[opacity,display] transition-discrete duration-160",
          "group-focus-within/tooltip:block group-focus-within/tooltip:opacity-100 group-hover/tooltip:block group-hover/tooltip:opacity-100",
          "starting:group-focus-within/tooltip:opacity-0 starting:group-hover/tooltip:opacity-0",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
