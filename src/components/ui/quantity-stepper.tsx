"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = "Quantity",
  size = "md",
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, Number.isFinite(next) ? Math.trunc(next) : min));
  const buttonClass = cn(
    "flex items-center justify-center text-charcoal transition-colors duration-160 hover:bg-limestone/60 disabled:cursor-not-allowed disabled:opacity-35",
    size === "md" ? "size-12" : "size-10",
  );

  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="border-line-strong bg-soft-white inline-flex items-center border">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(clamp(event.target.valueAsNumber))}
          className={cn(
            "type-price w-10 [appearance:textfield] bg-transparent text-center focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            size === "md" ? "h-12" : "h-10",
          )}
        />
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
      </div>
    </div>
  );
}
