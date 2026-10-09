"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/display";
import { Checkbox, TextAreaField } from "@/components/ui/field";
import { CloseIcon } from "@/components/ui/icons";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Skeleton } from "@/components/ui/display";
import type { BagLine, BagView } from "@/lib/cart/types";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { CatalogImage } from "../catalog-image";
import { useBag } from "./bag-provider";

export function BagNotices({ bag }: { bag: BagView }) {
  if (bag.notices.length === 0) return null;
  return (
    <div className="space-y-2" role="status">
      {bag.notices.map((n, i) => (
        <Notice
          key={`${n.kind}-${n.variantId ?? i}`}
          tone={n.kind === "unavailable" || n.kind === "coupon_removed" ? "warning" : "info"}
        >
          {n.message}
        </Notice>
      ))}
    </div>
  );
}

function LineItem({
  line,
  compact,
  onNavigate,
}: {
  line: BagLine;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { setQuantity, remove } = useBag();
  return (
    <div className={cn("flex gap-4", !line.available && "opacity-60")}>
      <Link
        href={`/products/${line.slug}`}
        onClick={onNavigate}
        className={cn("shrink-0", compact ? "w-20" : "w-24 sm:w-32")}
        tabIndex={-1}
        aria-hidden="true"
      >
        <CatalogImage src={line.image?.src} alt="" sizes="8rem" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/products/${line.slug}`}
              onClick={onNavigate}
              className="type-card-title hover:text-earth block"
            >
              {line.name}
            </Link>
            {line.variantName && <p className="type-small text-stone">{line.variantName}</p>}
            {line.uniqueness === "unique" && <p className="type-caption text-stone mt-1">One of a kind</p>}
            {line.uniqueness === "made_to_order" && line.leadTimeDays && (
              <p className="type-caption text-stone mt-1">
                Made to order · ships in about {Math.max(1, Math.round(line.leadTimeDays / 7))} weeks
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(line.variantId)}
            aria-label={`Remove ${line.name}${line.variantName ? ` (${line.variantName})` : ""} from your bag`}
            className="text-stone hover:text-charcoal -mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {!line.available ? (
            <p className="type-small text-error">No longer available</p>
          ) : line.maxQuantity > 1 ? (
            <QuantityStepper
              size="sm"
              value={line.quantity}
              max={line.maxQuantity}
              onChange={(q) => setQuantity(line.variantId, q)}
              label={`Quantity of ${line.name}`}
            />
          ) : (
            <p className="type-small text-stone">Qty 1</p>
          )}
          <p className="type-price">{formatMoney(line.available ? line.lineTotal : line.unitPrice)}</p>
        </div>
      </div>
    </div>
  );
}

function CouponForm() {
  const { bag, applyCoupon, removeCoupon } = useBag();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (bag.coupon) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="type-small">
          Code <span className="font-medium">{bag.coupon.code}</span>
        </p>
        <button
          type="button"
          onClick={removeCoupon}
          className="type-caption text-stone hover:text-charcoal underline underline-offset-4"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="type-small hover:text-earth underline underline-offset-4"
        aria-expanded={false}
      >
        Have a code?
      </button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await applyCoupon(code));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id} className="type-label mb-2 block">
        Discount code
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="border-line-strong bg-soft-white type-body focus-visible:border-charcoal aria-[invalid=true]:border-error h-11 min-w-0 flex-1 border px-3 uppercase focus-visible:outline-none"
        />
        <Button type="submit" variant="secondary" size="sm" loading={busy} className="h-11">
          Apply
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="type-small text-error mt-2">
          {error}
        </p>
      )}
    </form>
  );
}

function GiftOptions() {
  const { bag, updateGift } = useBag();
  const [isGift, setIsGift] = useState(Boolean(bag.giftMessage || bag.hidePrices || bag.giftWrap.selected));
  const [message, setMessage] = useState(bag.giftMessage ?? "");
  // Local copies so the boxes tick instantly; reverted if the server rejects the change
  const [wrap, setWrap] = useState(bag.giftWrap.selected);
  const [hide, setHide] = useState(bag.hidePrices);
  const [error, setError] = useState<string | null>(null);

  async function save(change: { giftWrap?: boolean; hidePrices?: boolean }, revert: () => void) {
    const problem = await updateGift(change);
    if (problem) {
      revert();
      setError(problem);
    }
  }

  return (
    <div className="space-y-4">
      <Checkbox
        label="This is a gift"
        checked={isGift}
        onChange={async (e) => {
          setIsGift(e.target.checked);
          if (!e.target.checked) {
            setMessage("");
            setWrap(false);
            setHide(false);
            await updateGift({ giftWrap: false, giftMessage: null, hidePrices: false });
          }
        }}
      />
      {isGift && (
        <div className="border-line space-y-4 border-l pl-4">
          {bag.giftWrap.offered && (
            <Checkbox
              label={`Gift wrap (${formatMoney(bag.giftWrap.price)})`}
              checked={wrap}
              onChange={(e) => {
                const next = e.target.checked;
                setWrap(next);
                void save({ giftWrap: next }, () => setWrap(!next));
              }}
            />
          )}
          <Checkbox
            label="Hide prices on the packing slip"
            checked={hide}
            onChange={(e) => {
              const next = e.target.checked;
              setHide(next);
              void save({ hidePrices: next }, () => setHide(!next));
            }}
          />
          <TextAreaField
            label="Gift message"
            optional
            rows={3}
            maxLength={200}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
            onBlur={async () => {
              if ((bag.giftMessage ?? "") !== message.trim())
                setError(await updateGift({ giftMessage: message }));
            }}
            hint={`${200 - message.length} characters left. Printed on a card in the parcel.`}
            error={error}
          />
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong ? "type-price text-base" : "type-small")}>
      <dt className={cn(!strong && "text-stone")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Discount code and gift options (scrolls with the items in the drawer). */
export function BagExtras() {
  return (
    <div className="space-y-6">
      <CouponForm />
      <GiftOptions />
    </div>
  );
}

/** Totals and the checkout button (pinned at the bottom of the drawer). */
export function BagTotals({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const { bag, setOpen } = useBag();
  const shipping = bag.shipping;
  return (
    <div className="space-y-4">
      <dl className="space-y-2">
        <SummaryRow label="Subtotal" value={formatMoney(bag.subtotal)} />
        {bag.coupon && (
          <SummaryRow
            label={`Discount (${bag.coupon.code})`}
            value={`− ${formatMoney(bag.coupon.discount)}`}
          />
        )}
        {bag.giftWrap.selected && <SummaryRow label="Gift wrap" value={formatMoney(bag.giftWrap.price)} />}
        <SummaryRow
          label="Shipping"
          value={
            shipping.status === "unconfirmed"
              ? "Calculated at checkout"
              : shipping.isFree
                ? "Free"
                : formatMoney(shipping.amount)
          }
        />
        <div className="border-line border-t pt-3">
          <SummaryRow
            label={shipping.status === "quoted" ? "Total" : "Estimated total"}
            value={formatMoney(bag.total)}
            strong
          />
          <p className="type-caption text-stone mt-1">Inclusive of all taxes</p>
        </div>
      </dl>
      {shipping.status === "quoted" && shipping.amountToFree !== null && shipping.amountToFree > 0 && (
        <p className="type-small text-stone">
          Add {formatMoney(shipping.amountToFree)} more for free shipping.
        </p>
      )}
      {checkoutEnabled ? (
        <ButtonLink href="/checkout" size="lg" fullWidth onClick={() => setOpen(false)}>
          Checkout
        </ButtonLink>
      ) : (
        <div className="space-y-2">
          <Button size="lg" fullWidth disabled>
            Checkout
          </Button>
          <p className="type-small text-stone text-center">
            Checkout opens soon. Your bag will be kept for 30 days.
          </p>
        </div>
      )}
    </div>
  );
}

export function BagLines({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { bag } = useBag();
  return (
    <ul className="divide-line divide-y [&>li]:py-6 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0">
      <AnimatePresence initial={false}>
        {bag.lines.map((line) => (
          <motion.li
            key={line.variantId}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: duration.base, ease: ease.outSoft }}
          >
            <LineItem line={line} compact={compact} onNavigate={onNavigate} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function EmptyBag({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <EmptyState
      title="Your bag is empty"
      description="Pieces you add will appear here."
      action={
        <ButtonLink href="/shop" onClick={onNavigate}>
          Explore the collection
        </ButtonLink>
      }
    />
  );
}

export function BagLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your bag">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="aspect-[4/5] w-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Everything together, for the bag page sidebar. */
export function BagSummary({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  return (
    <div className="space-y-6">
      <BagExtras />
      <div className="border-line border-t pt-5">
        <BagTotals checkoutEnabled={checkoutEnabled} />
      </div>
    </div>
  );
}
