"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Checkbox, FieldError, TextField } from "@/components/ui/field";
import { requestBackInStock, subscribeToNewsletter, type FormState } from "@/lib/forms/actions";
import { cn } from "@/lib/utils/cn";

const initial: FormState = { status: "idle" };

/** Off-screen field that people never fill in; bots usually do. */
function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function NewsletterForm({
  source,
  tone = "light",
  className,
}: {
  source: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const [state, action, pending] = useActionState(subscribeToNewsletter, initial);
  const consentId = useId();

  if (state.status === "success") {
    return (
      <p role="status" className={cn("type-body", className)}>
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} noValidate className={cn("relative", className)}>
      <Honeypot />
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Email address"
          hideLabel
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          required
          error={state.fieldErrors?.email}
          defaultValue={state.values?.email}
          className="flex-1"
        />
        <Button
          type="submit"
          loading={pending}
          variant={tone === "dark" ? "secondary" : "primary"}
          className={cn(tone === "dark" && "border-ivory text-ivory hover:bg-ivory hover:text-charcoal")}
        >
          Subscribe
        </Button>
      </div>
      <Checkbox
        id={consentId}
        name="consent"
        defaultChecked={state.values?.consent === "on"}
        className="mt-4"
        label="I agree to receive occasional emails from Studio Clayrity. I can unsubscribe at any time."
        aria-invalid={state.fieldErrors?.consent ? true : undefined}
        aria-describedby={state.fieldErrors?.consent ? `${consentId}-error` : undefined}
      />
      <FieldError id={`${consentId}-error`}>{state.fieldErrors?.consent}</FieldError>
      {state.message && (
        <Notice tone="error" className="mt-4">
          {state.message}
        </Notice>
      )}
    </form>
  );
}

export function BackInStockForm({ variantId, productName }: { variantId: string; productName: string }) {
  const [state, action, pending] = useActionState(requestBackInStock, initial);
  if (state.status === "success") {
    return <Notice tone="success">{state.message}</Notice>;
  }
  return (
    <form action={action} noValidate className="relative">
      <Honeypot />
      <input type="hidden" name="variantId" value={variantId} />
      <p className="type-small text-stone mb-3">
        Leave your email and we&apos;ll let you know if {productName} becomes available.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Email address"
          hideLabel
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          required
          error={state.fieldErrors?.email}
          defaultValue={state.values?.email}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" loading={pending}>
          Notify me
        </Button>
      </div>
      {state.message && (
        <Notice tone="error" className="mt-3">
          {state.message}
        </Notice>
      )}
    </form>
  );
}
