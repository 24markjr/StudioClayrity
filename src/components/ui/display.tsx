import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { AlertIcon } from "./icons";

/* ---------- Badge ---------- */

export type BadgeTone = "neutral" | "outline" | "dark" | "success" | "error";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-limestone text-charcoal",
  outline: "border border-line-strong text-charcoal",
  dark: "bg-charcoal text-ivory",
  success: "bg-success-bg text-success",
  error: "bg-error-bg text-error",
};

/** Small status label, e.g. "One of a kind", "Made to order · 3 weeks", "Sold". Use sparingly. */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "type-overline inline-flex items-center px-2.5 py-1 tracking-[0.16em]",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Divider ---------- */

export function Divider({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-line border-0 border-t", className)} {...props} />;
}

/* ---------- VisuallyHidden ---------- */

export function VisuallyHidden(props: ComponentProps<"span">) {
  return <span className="sr-only" {...props} />;
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-limestone/70 motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Price ---------- */

/**
 * Displays a price from integer minor units. When `compareAt` is higher than `amount`
 * the original price is struck through and announced as "Original price".
 */
export function Price({
  amount,
  compareAt,
  className,
  size = "md",
}: {
  amount: number;
  compareAt?: number | null;
  className?: string;
  size?: "md" | "lg";
}) {
  const onSale = compareAt != null && compareAt > amount;
  return (
    <p
      className={cn(
        "type-price flex flex-wrap items-baseline gap-x-3",
        size === "lg" && "text-lg",
        className,
      )}
    >
      {onSale && <VisuallyHidden>Sale price</VisuallyHidden>}
      <span>{formatMoney(amount)}</span>
      {onSale && (
        <>
          <VisuallyHidden>Original price</VisuallyHidden>
          <s className="text-stone decoration-1">{formatMoney(compareAt)}</s>
        </>
      )}
    </p>
  );
}

/* ---------- Breadcrumbs ---------- */

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="type-caption text-stone flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-charcoal transition-colors duration-160">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "text-charcoal")}>
                  {item.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-taupe">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------- Pagination ---------- */

/** Page numbers to show: always first and last, the current page and its neighbours. */
export function pageWindow(current: number, total: number): Array<number | "gap"> {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export function Pagination({
  current,
  total,
  hrefFor,
  className,
}: {
  current: number;
  total: number;
  /** Build the URL for a page, preserving filters, e.g. (p) => `/shop?sort=new&page=${p}` */
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (total <= 1) return null;
  const linkClass =
    "type-small flex size-10 items-center justify-center text-charcoal transition-colors duration-160 hover:bg-limestone/60";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1", className)}>
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} className={cn(linkClass, "w-auto px-3")} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={cn(linkClass, "text-stone/50 w-auto px-3 hover:bg-transparent")} aria-hidden="true">
          Previous
        </span>
      )}
      {/* Compact on small screens; full page list from sm up */}
      <p className="type-small text-stone px-3 sm:hidden">
        Page {current} of {total}
      </p>
      <ol className="hidden items-center gap-1 sm:flex">
        {pageWindow(current, total).map((page, i) =>
          page === "gap" ? (
            <li key={`gap-${i}`} aria-hidden="true" className="type-small text-stone w-6 text-center">
              …
            </li>
          ) : (
            <li key={page}>
              <Link
                href={hrefFor(page)}
                aria-current={page === current ? "page" : undefined}
                aria-label={`Page ${page}`}
                className={cn(linkClass, page === current && "bg-charcoal text-ivory hover:bg-charcoal")}
              >
                {page}
              </Link>
            </li>
          ),
        )}
      </ol>
      {current < total ? (
        <Link href={hrefFor(current + 1)} className={cn(linkClass, "w-auto px-3")} rel="next">
          Next
        </Link>
      ) : (
        <span className={cn(linkClass, "text-stone/50 w-auto px-3 hover:bg-transparent")} aria-hidden="true">
          Next
        </span>
      )}
    </nav>
  );
}

/* ---------- Empty / error states ---------- */

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center py-16 text-center", className)}>
      <span aria-hidden="true" className="bg-taupe mb-6 h-px w-10" />
      <h2 className="type-h4">{title}</h2>
      {description && <p className="type-small text-stone mt-3">{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If the problem continues, contact us and we'll help.",
  action,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Usually a retry button */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("mx-auto flex max-w-md flex-col items-center py-16 text-center", className)}
    >
      <AlertIcon className="text-error mb-5 size-6" />
      <h2 className="type-h4">{title}</h2>
      <p className="type-small text-stone mt-3">{description}</p>
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

/* ---------- Inline notice ---------- */

const noticeTones = {
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof noticeTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("type-small px-4 py-3", noticeTones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}
