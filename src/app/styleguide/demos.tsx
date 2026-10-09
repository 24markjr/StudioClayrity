"use client";

import { useState } from "react";
import { AnimatedCount, FadeSwap, Reveal } from "@/components/motion/primitives";
import { ProductCard } from "@/components/store/product-card";
import { Accordion } from "@/components/ui/accordion";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, Drawer } from "@/components/ui/dialog";
import { Checkbox, RadioGroup, SelectField, Switch, TextAreaField, TextField } from "@/components/ui/field";
import { BagIcon, ChevronDownIcon, HeartIcon, InfoIcon } from "@/components/ui/icons";
import { PlaceholderImage } from "@/components/ui/placeholder-image";
import { Popover } from "@/components/ui/popover";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

export function ButtonDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button>Add to bag</Button>
      <Button variant="secondary">View collection</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="text">Text link button</Button>
      <Button
        loading={loading}
        onClick={() => {
          setLoading(true);
          window.setTimeout(() => setLoading(false), 1600);
        }}
      >
        Click for loading
      </Button>
      <Button disabled>Disabled</Button>
      <Button size="sm" variant="secondary">
        Small
      </Button>
      <Button size="lg">Large</Button>
      <IconButton label="Open bag">
        <BagIcon />
      </IconButton>
    </div>
  );
}

export function FormDemo() {
  const [qty, setQty] = useState(1);
  return (
    <form className="grid max-w-2xl gap-6 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
      <TextField label="Full name" name="name" autoComplete="name" placeholder="Ananya Rao" />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        hint="We'll send your order updates here."
      />
      <TextField
        label="Pincode"
        name="pincode"
        inputMode="numeric"
        defaultValue="56003"
        error="Enter a 6-digit pincode."
      />
      <TextField label="Company / GSTIN" name="gstin" optional />
      <SelectField label="State" name="state" defaultValue="">
        <option value="" disabled>
          Select a state
        </option>
        <option>Karnataka</option>
        <option>Kerala</option>
        <option>Maharashtra</option>
      </SelectField>
      <TextField label="Disabled field" name="disabled" disabled defaultValue="Read only" />
      <TextAreaField
        className="sm:col-span-2"
        label="Gift message"
        name="message"
        optional
        hint="Up to 200 characters."
      />
      <div className="flex flex-col gap-4">
        <Checkbox label="Same as delivery address" defaultChecked />
        <Checkbox label="Send me news about new pieces" hint="Occasional emails. Unsubscribe anytime." />
        <Switch label="Gift wrap this order" />
      </div>
      <RadioGroup
        legend="Delivery method"
        name="delivery"
        defaultValue="standard"
        options={[
          { value: "standard", label: "Standard — 5–7 business days", hint: "Insured, fragile handling" },
          { value: "express", label: "Express — 2–3 business days" },
          { value: "pickup", label: "Studio pickup", disabled: true, hint: "Not available yet" },
        ]}
      />
      <div>
        <p className="type-label mb-2">Quantity</p>
        <QuantityStepper value={qty} onChange={setQty} max={4} />
      </div>
    </form>
  );
}

export function OverlayDemo() {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Button variant="secondary" onClick={() => setDialog(true)}>
        Open dialog
      </Button>
      <Button variant="secondary" onClick={() => setDrawer(true)}>
        Open bag drawer
      </Button>
      <Button variant="secondary" onClick={() => setSheet(true)}>
        Open bottom sheet (mobile filters)
      </Button>
      <Popover
        trigger={(props) => (
          <Button variant="secondary" iconEnd={<ChevronDownIcon className="size-4" />} {...props}>
            Sort: Featured
          </Button>
        )}
      >
        {(close) => (
          <ul className="type-small">
            {["Featured", "Newest", "Price: low to high", "Price: high to low"].map((label) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={close}
                  className="hover:bg-limestone/60 w-full px-4 py-2.5 text-left transition-colors"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      <Tooltip content="Includes all taxes. Shipping calculated at checkout.">
        <button
          type="button"
          className="flex size-11 items-center justify-center"
          aria-label="Price information"
        >
          <InfoIcon />
        </button>
      </Tooltip>
      <Button
        variant="ghost"
        onClick={() =>
          toast({
            tone: "success",
            title: "Added to your bag",
            description: "Nero Marble Bowl — Large",
            action: { label: "View bag", onClick: () => setDrawer(true) },
          })
        }
      >
        Show success toast
      </Button>
      <Button
        variant="ghost"
        onClick={() =>
          toast({
            tone: "error",
            title: "Couldn't update your bag",
            description: "Check your connection and try again.",
          })
        }
      >
        Show error toast
      </Button>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Request more photos"
        description="We'll send close-ups of this exact piece within one business day."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialog(false)}>Send request</Button>
          </div>
        }
      >
        <div className="grid gap-5">
          <TextField label="Email" type="email" autoComplete="email" />
          <TextAreaField label="Anything specific?" optional rows={3} />
        </div>
      </Dialog>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Your bag (1)"
        footer={
          <div className="grid gap-4">
            <div className="type-price flex justify-between">
              <span>Subtotal</span>
              <span>₹8,500</span>
            </div>
            <p className="type-caption text-stone">
              Inclusive of all taxes. Shipping calculated at checkout.
            </p>
            <Button fullWidth>Checkout</Button>
          </div>
        }
      >
        <div className="flex gap-4">
          <PlaceholderImage className="w-24 shrink-0" showLabel={false} />
          <div className="flex-1">
            <p className="type-card-title">Nero Marble Bowl</p>
            <p className="type-small text-stone">Large · Honed</p>
            <p className="type-price mt-2">₹8,500</p>
          </div>
        </div>
      </Drawer>

      <Drawer open={sheet} onClose={() => setSheet(false)} side="bottom" title="Filter">
        <div className="grid gap-4">
          <Checkbox label="Marble" />
          <Checkbox label="Travertine" />
          <Checkbox label="In stock only" />
        </div>
      </Drawer>
    </div>
  );
}

export function DisclosureDemo() {
  return (
    <div className="grid gap-12 lg:grid-cols-2">
      <Accordion
        defaultOpen={["description"]}
        items={[
          {
            id: "description",
            title: "Description",
            content:
              "A low, generous bowl turned from a single block. The veining is unique to each piece, so the bowl you receive will differ slightly from the photographs.",
          },
          { id: "dimensions", title: "Dimensions & weight", content: "Ø 32 cm × H 9 cm · 3.4 kg" },
          {
            id: "care",
            title: "Care",
            content: "Wipe with a soft, damp cloth. Avoid acidic liquids and abrasive cleaners.",
          },
          {
            id: "shipping",
            title: "Shipping & packaging",
            content: "Dispatched in 2–3 business days, insured, in protective packaging.",
          },
        ]}
      />
      <Tabs
        tabs={[
          {
            id: "details",
            label: "Details",
            content: <p className="type-small text-stone">Honed white marble with grey veining.</p>,
          },
          {
            id: "care",
            label: "Care",
            content: <p className="type-small text-stone">Seal annually for best results.</p>,
          },
          {
            id: "returns",
            label: "Returns",
            content: <p className="type-small text-stone">Policy pending owner approval.</p>,
          },
        ]}
      />
    </div>
  );
}

export function ProductCardDemo() {
  const [wished, setWished] = useState<Record<string, boolean>>({});
  const products = [
    {
      slug: "nero-bowl",
      name: "Nero Marble Bowl",
      price: 850000,
      tone: "charcoal-stone",
      alt: "white-marble",
      status: "One of a kind",
    },
    {
      slug: "verde-vase",
      name: "Verde Sculptural Vase",
      price: 2400000,
      tone: "green-marble",
      alt: "travertine",
      status: "Made to order · 3 weeks",
    },
    {
      slug: "travertine-tray",
      name: "Travertine Tray",
      price: 550000,
      compareAt: 650000,
      tone: "travertine",
      alt: "white-marble",
    },
    {
      slug: "bianco-bookends",
      name: "Bianco Bookends, Pair",
      price: 720000,
      tone: "white-marble",
      alt: "clay",
      status: "Sold",
    },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {products.map((p) => (
        <ProductCard
          key={p.slug}
          href="#"
          name={p.name}
          price={p.price}
          compareAt={"compareAt" in p ? p.compareAt : undefined}
          status={"status" in p ? p.status : undefined}
          image={<PlaceholderImage tone={p.tone} showLabel={false} />}
          hoverImage={<PlaceholderImage tone={p.alt} showLabel={false} />}
          action={
            <IconButton
              label={wished[p.slug] ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
              size="sm"
              aria-pressed={!!wished[p.slug]}
              onClick={() => setWished((w) => ({ ...w, [p.slug]: !w[p.slug] }))}
              className="bg-ivory/70 hover:bg-ivory backdrop-blur-sm"
            >
              <HeartIcon className="size-4" filled={!!wished[p.slug]} />
            </IconButton>
          }
        />
      ))}
    </div>
  );
}

export function MotionDemo() {
  const [count, setCount] = useState(0);
  const [variant, setVariant] = useState(0);
  const tones = ["white-marble", "green-marble", "travertine"] as const;
  return (
    <div className="grid gap-12 md:grid-cols-3">
      <div>
        <p className="type-overline text-stone mb-4">Bag count (spring)</p>
        <div className="flex items-center gap-4">
          <span className="relative">
            <BagIcon className="size-6" />
            <span className="type-caption bg-charcoal text-ivory absolute -top-2 -right-3 flex min-w-5 justify-center px-1">
              <AnimatedCount value={count} />
            </span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => setCount((c) => c + 1)}>
            Add item
          </Button>
        </div>
      </div>
      <div>
        <p className="type-overline text-stone mb-4">Variant image swap (fade)</p>
        <FadeSwap id={variant} className="w-40">
          <PlaceholderImage tone={tones[variant]} showLabel={false} />
        </FadeSwap>
        <div className="mt-3 flex gap-2">
          {tones.map((t, i) => (
            <button
              key={t}
              type="button"
              aria-pressed={variant === i}
              onClick={() => setVariant(i)}
              className="type-caption border-line-strong aria-pressed:border-charcoal aria-pressed:bg-charcoal aria-pressed:text-ivory border px-3 py-1.5"
            >
              {t.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="type-overline text-stone mb-4">Scroll reveal</p>
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} delay={i * 0.08} className="type-small border-taupe text-stone border-l pl-4">
              Section content rises 20px and fades in once.
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
