import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "text";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "group/button relative inline-flex items-center justify-center gap-2.5 type-button whitespace-nowrap select-none " +
  "transition-[background-color,color,border-color,opacity] duration-240 ease-out-soft " +
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-charcoal text-ivory hover:bg-earth active:bg-charcoal",
  secondary: "border border-charcoal text-charcoal hover:bg-charcoal hover:text-ivory",
  ghost: "text-charcoal hover:bg-limestone/60",
  text:
    "h-auto px-0 text-charcoal underline decoration-transparent decoration-1 underline-offset-[6px] " +
    "hover:decoration-current",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-5",
  md: "h-12 px-7",
  lg: "h-14 px-9",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(base, variants[variant], variant !== "text" && sizes[size], fullWidth && "w-full", className);
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Icon placed after the label */
  iconEnd?: ReactNode;
  /** Icon placed before the label */
  iconStart?: ReactNode;
};

export type ButtonProps = ComponentProps<"button"> &
  CommonProps & {
    /** Shows a spinner, keeps the button width and blocks repeat clicks */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  iconStart,
  iconEnd,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2.5", loading && "invisible")}>
        {iconStart}
        {children}
        {iconEnd}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & CommonProps;

export function ButtonLink({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {iconStart}
      {children}
      {iconEnd}
    </Link>
  );
}

export type IconButtonProps = ComponentProps<"button"> & {
  /** Accessible name — required because the button has no visible text */
  label: string;
  size?: "sm" | "md";
};

export function IconButton({
  label,
  size = "md",
  className,
  children,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "text-charcoal hover:bg-limestone/60 inline-flex shrink-0 items-center justify-center transition-colors duration-160 disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "size-11" : "size-9",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
