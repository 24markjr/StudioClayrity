# Product Data Template — How to Fill It

Open `product-template.csv` in Google Sheets or Excel. **One row per variant.** A product with no variants has one row. A product in two sizes has two rows with the same `slug`, `name` and description, and different `variant_name`, `sku`, `price_inr`, `stock` and dimensions. The rows starting with `SAMPLE` are examples — delete them.

| Column                         | Required         | Meaning                                                                                             |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------- |
| `slug`                         | yes              | URL name, lowercase with hyphens: `nero-marble-bowl` → studioclayrity.com/products/nero-marble-bowl |
| `name`                         | yes              | Product name as customers see it                                                                    |
| `category`                     | yes              | One category (Trays, Bowls, Vases…)                                                                 |
| `collections`                  | no               | Zero or more collections, separated by semicolons: `Living Room;Gifting`                            |
| `material`, `finish`, `colour` | yes              | e.g. Marble · Honed · White with grey veining                                                       |
| `short_description`            | yes              | One sentence, shown near the price                                                                  |
| `description`                  | yes              | Full description. Facts only — no unverified origin or "handmade" claims.                           |
| `uniqueness_type`              | yes              | `unique` (one-of-a-kind), `stock` (repeatable), or `made_to_order`                                  |
| `lead_time_days`               | if made to order | Days from order to dispatch                                                                         |
| `variant_name`                 | if variants      | e.g. Small / Large, or Honed / Polished                                                             |
| `sku`                          | yes              | Your unique stock code, e.g. `SC-TRAY-001-L`                                                        |
| `price_inr`                    | yes              | Selling price in rupees **including GST**                                                           |
| `compare_at_price_inr`         | no               | Only if genuinely reduced from a previous price                                                     |
| `stock`                        | yes              | Units available now (always 1 for `unique`)                                                         |
| `length_cm` … `net_weight_g`   | yes              | Product's own size and weight                                                                       |
| `packed_*`                     | yes              | Size and weight **after packing** — used for shipping costs                                         |
| `care_instructions`            | yes              | How to clean and look after it                                                                      |
| `hsn_code`, `gst_rate_percent` | yes              | **From your CA.** Needed for GST invoices.                                                          |
| `country_of_origin`            | yes              | Legal requirement on product pages                                                                  |
| `is_featured`                  | no               | `yes` to show on the homepage "Curated pieces" section                                              |
| `is_giftable`                  | no               | `yes` to include in the gifting edit                                                                |
| `seo_title`, `seo_description` | no               | Leave blank — we'll write these                                                                     |

Photos are matched to products by folder name = `slug` (see `PHOTOGRAPHY_SHOT_LIST.md`).
