import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Inline text link with a hairline underline that draws in from the left on hover.
 * `variant="persistent"` keeps the underline visible (use inside body copy).
 */
export function TextLink({
  className,
  variant = "hover",
  ...props
}: ComponentProps<typeof Link> & { variant?: "hover" | "persistent" }) {
  return (
    <Link
      className={cn(
        "bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5",
        "ease-out-quint transition-[background-size,color] duration-240 hover:bg-[length:100%_1px]",
        variant === "persistent" && "hover:text-earth bg-[length:100%_1px]",
        className,
      )}
      {...props}
    />
  );
}
