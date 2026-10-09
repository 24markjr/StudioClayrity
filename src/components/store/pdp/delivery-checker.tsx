"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { checkDelivery, type DeliveryCheck } from "@/lib/orders/actions";
import { cn } from "@/lib/utils/cn";

/** "Check delivery" by PIN code — shown only when Shiprocket is connected. */
export function DeliveryChecker({ weightG }: { weightG: number }) {
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<DeliveryCheck | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(
      await checkDelivery(pincode, weightG).catch(() => ({
        status: "error" as const,
        message: "Please try again.",
      })),
    );
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="border-line mt-6 border-t pt-6" noValidate>
      <label htmlFor="pdp-pincode" className="type-label mb-2 block">
        Check delivery
      </label>
      <div className="flex gap-2">
        <input
          id="pdp-pincode"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          placeholder="PIN code"
          value={pincode}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, ""));
            setResult(null);
          }}
          className="border-line-strong bg-soft-white type-body focus-visible:border-charcoal h-11 w-36 border px-3 focus-visible:outline-none"
        />
        <Button type="submit" variant="secondary" size="sm" loading={busy} className="h-11">
          Check
        </Button>
      </div>
      {result && (
        <p
          role="status"
          className={cn(
            "type-small mt-3",
            result.status === "serviceable"
              ? "text-success"
              : result.status === "not_serviceable"
                ? "text-error"
                : "text-stone",
          )}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
