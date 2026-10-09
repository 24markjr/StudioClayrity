"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { TextField } from "@/components/ui/field";
import { trackOrder, type TrackState } from "@/lib/orders/actions";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

export function TrackOrderForm({ defaultRef }: { defaultRef: string }) {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, { status: "idle" });
  const values = state.status === "error" ? state.values : { orderRef: defaultRef, contact: "" };

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <form action={action} className="space-y-5 lg:col-span-5" noValidate>
        <TextField
          label="Order number"
          name="orderRef"
          defaultValue={values.orderRef}
          placeholder="SC-7K3Q9X"
          autoCapitalize="characters"
          hint="In your confirmation email."
        />
        <TextField
          label="Email or mobile number"
          name="contact"
          defaultValue={values.contact}
          autoComplete="email"
          hint="The one you used at checkout."
        />
        <Button type="submit" loading={pending}>
          Track order
        </Button>
        {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
      </form>

      {state.status === "found" && (
        <section
          aria-labelledby="track-result"
          className="bg-soft-white p-6 sm:p-8 lg:col-span-6 lg:col-start-7"
          aria-live="polite"
        >
          <p className="type-overline text-stone">Order {state.order.orderRef}</p>
          <h2 id="track-result" className="type-h3 mt-3">
            {state.order.statusLabel}
          </h2>

          {state.order.shipment && (
            <div className="border-line mt-6 border-t pt-6">
              <p className="type-small">
                {state.order.shipment.carrier}
                {state.order.shipment.awb ? ` · ${state.order.shipment.awb}` : ""}
              </p>
              {state.order.shipment.trackingUrl && (
                <a
                  href={state.order.shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-small mt-2 inline-block underline underline-offset-4"
                >
                  Track with the courier
                </a>
              )}
            </div>
          )}

          <ol className="border-line mt-6 space-y-4 border-t pt-6">
            {state.order.timeline.map((step, i) => (
              <li key={step.label} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${i === state.order.timeline.length - 1 ? "bg-charcoal" : "bg-taupe"}`}
                />
                <div>
                  <p className="type-small">{step.label}</p>
                  <p className="type-caption text-stone">{when(step.at)}</p>
                </div>
              </li>
            ))}
          </ol>

          <ul className="border-line type-small text-stone mt-6 space-y-1 border-t pt-6">
            {state.order.items.map((item) => (
              <li key={item.name}>
                {item.quantity} × {item.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
