"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Checkbox, RadioGroup, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { confirmPayment, getCheckoutQuote, submitCheckout } from "@/lib/checkout/actions";
import type { Quote } from "@/lib/checkout/quote";
import { checkoutSchema, fieldErrors, type AddressInput, type PaymentMethod } from "@/lib/checkout/schema";
import { INDIAN_STATES } from "@/lib/domain/india";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { OrderSummary } from "./order-summary";
import { openRazorpay, type LaunchParams } from "./razorpay";

const emptyAddress: AddressInput = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  stateCode: "",
  pincode: "",
};

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${step}`} className="border-line border-t pt-8">
      <h2 id={`step-${step}`} className="type-h4 mb-6">
        <span className="text-stone mr-3 font-sans text-sm tabular-nums">
          {String(step).padStart(2, "0")}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function AddressFields({
  prefix,
  value,
  onChange,
  errors,
  onStateChange,
}: {
  prefix: "shipping" | "billing";
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  errors: Record<string, string>;
  onStateChange?: (stateCode: string) => void;
}) {
  const set = (key: keyof AddressInput) => (e: { target: { value: string } }) =>
    onChange({ ...value, [key]: e.target.value });
  const err = (key: string) => errors[`${prefix}.${key}`];
  const auto = prefix === "shipping" ? "shipping" : "billing";
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        className="sm:col-span-2"
        label="Full name"
        autoComplete={`${auto} name`}
        value={value.fullName}
        onChange={set("fullName")}
        error={err("fullName")}
      />
      <TextField
        className="sm:col-span-2"
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete={`${auto} tel`}
        value={value.phone}
        onChange={set("phone")}
        error={err("phone")}
        hint={prefix === "shipping" ? "For delivery updates from the courier." : undefined}
      />
      <TextField
        className="sm:col-span-2"
        label="House / flat, street"
        autoComplete={`${auto} address-line1`}
        value={value.line1}
        onChange={set("line1")}
        error={err("line1")}
      />
      <TextField
        className="sm:col-span-2"
        label="Area, building"
        optional
        autoComplete={`${auto} address-line2`}
        value={value.line2 ?? ""}
        onChange={set("line2")}
      />
      <TextField label="Landmark" optional value={value.landmark ?? ""} onChange={set("landmark")} />
      <TextField
        label="City / town"
        autoComplete={`${auto} address-level2`}
        value={value.city}
        onChange={set("city")}
        error={err("city")}
      />
      <SelectField
        label="State"
        autoComplete={`${auto} address-level1`}
        value={value.stateCode}
        onChange={(e) => {
          onChange({ ...value, stateCode: e.target.value });
          onStateChange?.(e.target.value);
        }}
        error={err("stateCode")}
      >
        <option value="" disabled>
          Choose a state
        </option>
        {INDIAN_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label="PIN code"
        inputMode="numeric"
        autoComplete={`${auto} postal-code`}
        maxLength={6}
        value={value.pincode}
        onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, "") })}
        error={err("pincode")}
      />
    </div>
  );
}

export function CheckoutForm({
  initialQuote,
  paymentMethods,
  defaultStateCode,
}: {
  initialQuote: Quote;
  paymentMethods: PaymentMethod[];
  defaultStateCode: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [email, setEmail] = useState("");
  const [shipping, setShipping] = useState<AddressInput>(emptyAddress);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressInput>(emptyAddress);
  const [showGstin, setShowGstin] = useState(false);
  const [gstin, setGstin] = useState("");
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">(initialQuote.shippingMethod);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethods[0]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "warning" | "info"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<(LaunchParams & { accessToken: string }) | null>(null);
  const [quoting, startQuote] = useTransition();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const summaryRef = useRef<HTMLDivElement>(null);

  // Re-price when anything that affects tax, shipping or fees changes
  const stateForTax = shipping.stateCode || defaultStateCode;
  useEffect(() => {
    startQuote(async () => {
      const response = await getCheckoutQuote({
        stateCode: stateForTax,
        shippingMethod,
        paymentMethod,
        email: email || undefined,
      });
      if (response.quote) setQuote(response.quote);
    });
    // email is applied on blur (below), not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateForTax, shippingMethod, paymentMethod]);

  function refreshForEmail() {
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    startQuote(async () => {
      const response = await getCheckoutQuote({
        stateCode: stateForTax,
        shippingMethod,
        paymentMethod,
        email,
      });
      if (response.quote) setQuote(response.quote);
    });
  }

  function goToOrder(orderRef: string, accessToken: string) {
    router.push(`/order/${orderRef}?t=${encodeURIComponent(accessToken)}`);
  }

  async function launch(params: LaunchParams & { accessToken: string }) {
    setPendingPayment(params);
    try {
      await openRazorpay(params, {
        onSuccess: async (response) => {
          setMessage({ tone: "info", text: "Payment received — confirming your order…" });
          await confirmPayment(response).catch(() => {});
          goToOrder(params.orderRef, params.accessToken);
        },
        onDismiss: () => {
          setSubmitting(false);
          setMessage({
            tone: "warning",
            text: "The payment wasn't completed. Your pieces are held for a few minutes — you can try again.",
          });
        },
        onFailure: (text) => setMessage({ tone: "error", text }),
      });
    } catch {
      setSubmitting(false);
      setMessage({
        tone: "error",
        text: "The payment window couldn't load. Check your connection and try again.",
      });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (pendingPayment) {
      setSubmitting(true);
      return launch(pendingPayment);
    }

    const payload = {
      email,
      shipping,
      billingSameAsShipping: billingSame,
      billing: billingSame ? undefined : billing,
      gstin: showGstin ? gstin : undefined,
      shippingMethod,
      paymentMethod,
      customerNote: note,
      expectedTotal: quote.total,
      idempotencyKey: idempotencyKey.current,
    };
    const local = checkoutSchema.safeParse(payload);
    if (!local.success) {
      const found = fieldErrors(local.error);
      setErrors(found);
      setMessage({ tone: "error", text: "Please check the highlighted details." });
      document.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);

    const result = await submitCheckout(payload).catch(() => null);
    if (!result) {
      setSubmitting(false);
      setMessage({
        tone: "error",
        text: "We couldn't reach the server. Nothing has been charged — please try again.",
      });
      return;
    }
    switch (result.kind) {
      case "razorpay":
        return launch(result);
      case "confirmed":
        return goToOrder(result.orderRef, result.accessToken);
      case "changed":
        idempotencyKey.current = crypto.randomUUID();
        setQuote(result.quote);
        setSubmitting(false);
        setMessage({ tone: "warning", text: result.message });
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      case "invalid":
        setErrors(result.fieldErrors);
        setSubmitting(false);
        setMessage({ tone: "error", text: result.message });
        return;
      case "error":
        idempotencyKey.current = crypto.randomUUID();
        setSubmitting(false);
        setMessage({ tone: "error", text: result.message });
        return;
    }
  }

  const blocked = quote.problems.length > 0;
  const payLabel = pendingPayment
    ? `Try payment again · ${formatMoney(pendingPayment.amount)}`
    : paymentMethod === "cod"
      ? `Place order · pay ${formatMoney(quote.total)} on delivery`
      : `Pay ${formatMoney(quote.total)}`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-x-16">
      <div className="min-w-0 space-y-10 lg:col-span-7">
        <Section step={1} title="Contact">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={refreshForEmail}
            error={errors.email}
            hint="Your order confirmation and delivery updates go here."
          />
        </Section>

        <Section step={2} title="Delivery address">
          <AddressFields prefix="shipping" value={shipping} onChange={setShipping} errors={errors} />
          <div className="mt-6 space-y-4">
            <Checkbox
              label="Billing address is the same"
              checked={billingSame}
              onChange={(e) => setBillingSame(e.target.checked)}
            />
            {!billingSame && (
              <div className="border-line border-l pl-5">
                <AddressFields prefix="billing" value={billing} onChange={setBilling} errors={errors} />
              </div>
            )}
            <Checkbox
              label="Add a GSTIN for a business invoice"
              checked={showGstin}
              onChange={(e) => setShowGstin(e.target.checked)}
            />
            {showGstin && (
              <TextField
                label="GSTIN"
                value={gstin}
                maxLength={15}
                autoCapitalize="characters"
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                error={errors.gstin}
                className="max-w-xs"
              />
            )}
          </div>
        </Section>

        <Section step={3} title="Delivery">
          <RadioGroup
            legend="Delivery method"
            hideLegend
            name="shippingMethod"
            value={shippingMethod}
            onChange={(v) => setShippingMethod(v as "standard" | "express")}
            options={quote.shippingOptions.map((o) => ({
              value: o.method,
              label: `${o.method === "standard" ? "Standard delivery" : "Express delivery"} — ${o.amount === 0 ? "Free" : formatMoney(o.amount)}`,
              hint: o.method === "standard" ? "Insured, packed for fragile pieces." : undefined,
            }))}
          />
          <TextAreaField
            className="mt-6"
            label="Delivery note"
            optional
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Section>

        <Section step={4} title="Payment">
          <RadioGroup
            legend="Payment method"
            hideLegend
            name="paymentMethod"
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v as PaymentMethod)}
            options={paymentMethods.map((m) =>
              m === "razorpay"
                ? {
                    value: m,
                    label: "Pay online — UPI, cards, net banking, wallets",
                    hint: "Secure payment through Razorpay.",
                  }
                : {
                    value: m,
                    label: `Cash on delivery${quote.cod.fee ? ` (+ ${formatMoney(quote.cod.fee)})` : ""}`,
                    disabled: !quote.cod.available,
                    hint: quote.cod.reason ?? "Pay the courier when your parcel arrives.",
                  },
            )}
          />
        </Section>
      </div>

      <aside aria-label="Order summary" className="min-w-0 lg:col-span-5">
        <div ref={summaryRef} className="bg-soft-white scroll-mt-24 p-6 sm:p-8 lg:sticky lg:top-8">
          <h2 className="type-h4 mb-6">Order summary</h2>
          <div className={cn("transition-opacity", quoting && "opacity-60")} aria-busy={quoting}>
            <OrderSummary quote={quote} paymentMethod={paymentMethod} />
          </div>
          <div className="mt-8 space-y-4" aria-live="polite">
            {quote.problems.map((p) => (
              <Notice key={p} tone="error">
                {p}
              </Notice>
            ))}
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button type="submit" size="lg" fullWidth loading={submitting} disabled={blocked || quoting}>
              {payLabel}
            </Button>
            <p className="type-caption text-stone text-center">
              By placing this order you agree to our terms. Your payment details are handled by Razorpay and
              never stored by us.
            </p>
          </div>
        </div>
      </aside>
    </form>
  );
}
