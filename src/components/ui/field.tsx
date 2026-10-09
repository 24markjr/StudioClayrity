"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const controlBase =
  "w-full bg-soft-white text-charcoal type-body placeholder:text-stone/70 border border-line-strong " +
  "transition-[border-color,box-shadow] duration-160 ease-out-soft " +
  "hover:border-stone focus-visible:outline-none focus-visible:border-charcoal focus-visible:ring-1 focus-visible:ring-charcoal " +
  "disabled:cursor-not-allowed disabled:bg-limestone/40 disabled:text-stone " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:focus-visible:ring-error";

export function controlStyles(className?: string) {
  return cn(controlBase, className);
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("type-label text-charcoal block", className)} {...props} />;
}

export function FieldHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("type-small text-stone mt-1.5", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p className={cn("type-small text-error mt-1.5", className)} {...props}>
      {children}
    </p>
  );
}

type FieldChrome = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Visually hide the label but keep it for assistive technology */
  hideLabel?: boolean;
  optional?: boolean;
};

function useFieldIds(id?: string) {
  const generated = useId();
  const fieldId = id ?? generated;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

function describedBy(hint: unknown, error: unknown, hintId: string, errorId: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
}

function FieldLabel({
  htmlFor,
  label,
  hideLabel,
  optional,
}: {
  htmlFor: string;
  label: ReactNode;
  hideLabel?: boolean;
  optional?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className={cn("mb-2", hideLabel && "sr-only")}>
      {label}
      {optional && <span className="text-stone ml-1.5 font-normal">(optional)</span>}
    </Label>
  );
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  optional,
  id,
  className,
  ...props
}: FieldChrome & ComponentProps<"input">) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <FieldLabel htmlFor={fieldId} label={label} hideLabel={hideLabel} optional={optional} />
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errorId)}
        className={controlStyles("h-12 px-4")}
        {...props}
      />
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  hideLabel,
  optional,
  id,
  className,
  rows = 5,
  ...props
}: FieldChrome & ComponentProps<"textarea">) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <FieldLabel htmlFor={fieldId} label={label} hideLabel={hideLabel} optional={optional} />
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errorId)}
        className={controlStyles("min-h-28 px-4 py-3")}
        {...props}
      />
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  hideLabel,
  optional,
  id,
  className,
  children,
  ...props
}: FieldChrome & ComponentProps<"select">) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <FieldLabel htmlFor={fieldId} label={label} hideLabel={hideLabel} optional={optional} />
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint, error, hintId, errorId)}
          className={controlStyles("h-12 cursor-pointer appearance-none pr-11 pl-4")}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="text-charcoal pointer-events-none absolute top-1/2 right-4 size-3.5 -translate-y-1/2"
        >
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      </div>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export function Checkbox({
  label,
  hint,
  id,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hint?: ReactNode }) {
  const { fieldId, hintId } = useFieldIds(id);
  return (
    <div className={cn("flex gap-3", className)}>
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          id={fieldId}
          type="checkbox"
          aria-describedby={hint ? hintId : undefined}
          className="peer border-line-strong bg-soft-white checked:border-charcoal checked:bg-charcoal hover:border-stone focus-visible:outline-charcoal size-5 cursor-pointer appearance-none border transition-colors duration-160 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="text-ivory pointer-events-none absolute size-3 opacity-0 peer-checked:opacity-100"
        >
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </span>
      <span>
        <label htmlFor={fieldId} className="type-small cursor-pointer">
          {label}
        </label>
        {hint && (
          <FieldHint id={hintId} className="mt-0.5">
            {hint}
          </FieldHint>
        )}
      </span>
    </div>
  );
}

export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  error,
  className,
  hideLegend,
}: {
  legend: ReactNode;
  name: string;
  options: Array<{ value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
  className?: string;
  hideLegend?: boolean;
}) {
  const groupId = useId();
  return (
    <fieldset className={className} aria-describedby={error ? `${groupId}-error` : undefined}>
      <legend className={cn("type-label text-charcoal mb-3", hideLegend && "sr-only")}>{legend}</legend>
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`;
          return (
            <div key={option.value} className="flex gap-3">
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                disabled={option.disabled}
                checked={value === undefined ? undefined : value === option.value}
                defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
                onChange={(event) => onChange?.(event.target.value)}
                className="border-line-strong bg-soft-white checked:border-charcoal hover:border-stone focus-visible:outline-charcoal mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-full border transition-[border-width,border-color] duration-160 checked:border-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <label htmlFor={optionId} className="type-small text-charcoal cursor-pointer">
                {option.label}
                {option.hint && <span className="text-stone mt-0.5 block">{option.hint}</span>}
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={`${groupId}-error`}>{error}</FieldError>
    </fieldset>
  );
}

export function Switch({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className="border-line-strong bg-limestone before:bg-soft-white before:ease-out-quint checked:border-charcoal checked:bg-charcoal focus-visible:outline-charcoal relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border transition-colors duration-240 before:absolute before:top-0.5 before:left-0.5 before:size-[18px] before:rounded-full before:shadow-sm before:transition-transform before:duration-240 checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label htmlFor={id} className="type-small text-charcoal cursor-pointer">
        {label}
      </label>
    </div>
  );
}
