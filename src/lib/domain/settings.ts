import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/create";
import { storeSettings } from "../db/schema";

/**
 * Typed store settings, editable from the admin (Phase 8). Each key has a Zod schema and
 * a safe default, so the storefront works before anything has been configured.
 */

const paise = z.number().int().nonnegative();

const link = z.object({ label: z.string().min(1).max(40), href: z.string().min(1) });
/** `placeholder:<tone>` or `cld:<public id>` */
const imageRef = z.string().min(1);

/** Editable homepage copy and imagery (admin, Phase 8). */
const homepageSchema = z.object({
  hero: z.object({
    eyebrow: z.string().max(40),
    headline: z.string().min(1).max(80),
    body: z.string().max(240),
    primary: link,
    secondary: link.nullable(),
    image: imageRef,
    imageAlt: z.string().min(1),
    detailImage: imageRef.nullable(),
    detailImageAlt: z.string(),
    caption: z.string().max(120),
  }),
  philosophy: z.object({ eyebrow: z.string().max(40), statement: z.string().min(1).max(240) }),
  material: z.object({
    title: z.string().min(1).max(60),
    image: imageRef,
    imageAlt: z.string().min(1),
    notes: z.array(z.object({ title: z.string().min(1).max(40), body: z.string().max(200) })).max(3),
  }),
  editorial: z.object({
    title: z.string().min(1).max(60),
    image: imageRef,
    imageAlt: z.string().min(1),
    /** Product hotspots on the image; x/y are percentages from the top-left */
    hotspots: z
      .array(
        z.object({ productSlug: z.string(), x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
      )
      .max(4),
  }),
  newsletter: z.object({ title: z.string().min(1).max(60), body: z.string().max(200) }),
});

export const settingsSchemas = {
  announcement: z.object({
    enabled: z.boolean(),
    message: z.string().max(140),
    href: z.string().optional(),
  }),
  seller: z.object({
    legalName: z.string(),
    gstin: z.string(),
    /** GST state code of the seller's registered address — decides CGST/SGST vs IGST */
    stateCode: z.string().length(2),
    address: z.string(),
    /** Placeholder until confirmed by the owner */
    isConfirmed: z.boolean(),
  }),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    whatsapp: z.string(),
    hours: z.string(),
    grievanceOfficer: z.object({ name: z.string(), email: z.string(), designation: z.string() }),
  }),
  social: z.object({ instagram: z.string(), pinterest: z.string() }),
  shipping: z.object({
    /** Until the owner confirms rates, shoppers see "calculated at checkout", never a guessed price */
    ratesConfirmed: z.boolean(),
    /** Flat charge per order, in paise, when below the free threshold */
    flatRate: paise,
    /** null = no free-shipping threshold */
    freeAbove: paise.nullable(),
    expressRate: paise.nullable(),
    /** GST rate on shipping, gift wrap and COD fee (to be confirmed by the CA) */
    chargesGstRateBp: z.number().int().min(0).max(2800),
  }),
  cod: z.object({
    enabled: z.boolean(),
    maxOrderTotal: paise,
    fee: paise,
  }),
  gifting: z.object({ wrapEnabled: z.boolean(), wrapPrice: paise }),
  checkout: z.object({
    /** Minutes stock is held while the customer pays */
    reservationMinutes: z.number().int().min(5).max(60),
  }),
  homepage: homepageSchema,
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchemas)[K]>;

export const settingDefaults: { [K in SettingKey]: SettingValue<K> } = {
  announcement: { enabled: false, message: "" },
  seller: {
    legalName: "Studio Clayrity",
    gstin: "",
    stateCode: "29",
    address: "",
    isConfirmed: false,
  },
  contact: {
    email: "hello@studioclayrity.com",
    phone: "",
    whatsapp: "",
    hours: "",
    grievanceOfficer: { name: "", email: "", designation: "Grievance Officer" },
  },
  social: { instagram: "", pinterest: "" },
  shipping: {
    ratesConfirmed: false,
    flatRate: 0,
    freeAbove: null,
    expressRate: null,
    chargesGstRateBp: 1800,
  },
  cod: { enabled: false, maxOrderTotal: 0, fee: 0 },
  gifting: { wrapEnabled: false, wrapPrice: 0 },
  checkout: { reservationMinutes: 15 },
  // Illustrative defaults, replaced with the owner's own copy and photography in the admin
  homepage: {
    hero: {
      eyebrow: "The Stone Edit",
      headline: "Objects shaped by stone and time",
      body: "Decor pieces in natural stone, each with a surface of its own. Made to be kept.",
      primary: { label: "Explore the collection", href: "/shop" },
      secondary: { label: "Our story", href: "/about" },
      image: "placeholder:white-marble",
      imageAlt: "Placeholder: a stone bowl on a console in window light",
      detailImage: "placeholder:green-marble",
      detailImageAlt: "Placeholder: close-up of green marble veining",
      caption: "Natural stone: veining and tone vary from piece to piece.",
    },
    philosophy: {
      eyebrow: "Philosophy",
      statement: "Fewer, better things. Pieces chosen for the way light moves across their surface.",
    },
    material: {
      title: "Material, up close",
      image: "placeholder:travertine",
      imageAlt: "Placeholder: close-up of travertine texture",
      notes: [
        { title: "Veining", body: "Every block carries its own pattern, so no two pieces are identical." },
        {
          title: "Finish",
          body: "Honed surfaces are soft and matte; polished surfaces deepen colour and reflect light.",
        },
        {
          title: "Weight",
          body: "Stone is dense. The weight of every piece is listed so you know what to expect.",
        },
      ],
    },
    editorial: {
      title: "In the room",
      image: "placeholder:charcoal-stone",
      imageAlt: "Placeholder: stone objects arranged on a shelf",
      hotspots: [],
    },
    newsletter: {
      title: "Letters from the studio",
      body: "New pieces and the occasional note on caring for stone. A few emails a year.",
    },
  },
};

/** Read a setting; falls back to the default if missing or invalid (and never throws). */
export async function getSetting<K extends SettingKey>(db: Executor, key: K): Promise<SettingValue<K>> {
  const [row] = await db
    .select({ value: storeSettings.value })
    .from(storeSettings)
    .where(eq(storeSettings.key, key));
  if (!row) return settingDefaults[key];
  const parsed = settingsSchemas[key].safeParse(row.value);
  return parsed.success ? (parsed.data as SettingValue<K>) : settingDefaults[key];
}

/** Validate and save a setting. Throws a ZodError for invalid values. */
export async function setSetting<K extends SettingKey>(
  db: Executor,
  key: K,
  value: SettingValue<K>,
  updatedBy: string | null = null,
) {
  const parsed = settingsSchemas[key].parse(value);
  await db
    .insert(storeSettings)
    .values({ key, value: parsed, updatedBy })
    .onConflictDoUpdate({
      target: storeSettings.key,
      set: { value: parsed, updatedBy, updatedAt: new Date() },
    });
}
