import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/create";
import { storeSettings } from "../db/schema";

/**
 * Typed store settings, editable from the admin (Phase 8). Each key has a Zod schema and
 * a safe default, so the storefront works before anything has been configured.
 */

const paise = z.number().int().nonnegative();

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
  shipping: { flatRate: 0, freeAbove: null, expressRate: null, chargesGstRateBp: 1800 },
  cod: { enabled: false, maxOrderTotal: 0, fee: 0 },
  gifting: { wrapEnabled: false, wrapPrice: 0 },
  checkout: { reservationMinutes: 15 },
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
