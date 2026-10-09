import postgres from "postgres";
import { loadLocalEnv } from "../../scripts/load-env";

/**
 * Store settings the checkout tests rely on (test values, not real rates):
 * shipping confirmed at a flat ₹500 (free above ₹15,000) and cash on delivery up to ₹20,000.
 * Also tops up stock on the pieces the checkout tests buy, so repeated runs keep working.
 */
export default async function globalSetup() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set for e2e tests");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const settings: Record<string, unknown> = {
      shipping: {
        ratesConfirmed: true,
        flatRate: 50_000,
        freeAbove: 1_500_000,
        expressRate: 120_000,
        chargesGstRateBp: 1800,
      },
      cod: { enabled: true, maxOrderTotal: 2_000_000, fee: 5_000 },
      seller: { legalName: "Studio Clayrity", gstin: "", stateCode: "29", address: "", isConfirmed: true },
    };
    for (const [key, value] of Object.entries(settings)) {
      await sql`insert into store_settings (key, value) values (${key}, ${sql.json(value as never)})
        on conflict (key) do update set value = excluded.value`;
    }
    await sql`update inventory set on_hand = 25, reserved = 0
      where variant_id in (select id from product_variants where sku in ('SAMPLE-CSTR-001', 'SAMPLE-DISH-001'))`;
  } finally {
    await sql.end();
  }
}
