import type { VariantDetail } from "@/lib/catalog/types";

/** Option names in first-seen order, e.g. ["Size"] or ["Size", "Finish"]. */
export function optionNames(variants: VariantDetail[]) {
  const names: string[] = [];
  for (const v of variants)
    for (const key of Object.keys(v.options)) if (!names.includes(key)) names.push(key);
  return names;
}

/** Distinct values for one option, in variant order. */
export function optionValues(variants: VariantDetail[], name: string) {
  const values: string[] = [];
  for (const v of variants) {
    const value = v.options[name];
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

export function isAvailable(v: VariantDetail) {
  return v.available === null || v.available > 0;
}

/** Initial selection: the default variant if purchasable, else the first purchasable, else the first. */
export function initialVariant(variants: VariantDetail[]) {
  return (
    variants.find((v) => v.isDefault && isAvailable(v)) ??
    variants.find(isAvailable) ??
    variants.find((v) => v.isDefault) ??
    variants[0]
  );
}

/**
 * Choose `value` for option `name`, keeping the other current choices where possible.
 * Falls back to any variant with that value, so a selection never lands on nothing.
 */
export function selectOption(variants: VariantDetail[], current: VariantDetail, name: string, value: string) {
  const wanted = { ...current.options, [name]: value };
  return (
    variants.find((v) => Object.entries(wanted).every(([k, val]) => v.options[k] === val)) ??
    variants.find((v) => v.options[name] === value && isAvailable(v)) ??
    variants.find((v) => v.options[name] === value) ??
    current
  );
}

/** Is there a purchasable variant with this value, given the other current choices? */
export function valueAvailable(
  variants: VariantDetail[],
  current: VariantDetail,
  name: string,
  value: string,
) {
  const wanted = { ...current.options, [name]: value };
  return variants.some(
    (v) => Object.entries(wanted).every(([k, val]) => v.options[k] === val) && isAvailable(v),
  );
}
