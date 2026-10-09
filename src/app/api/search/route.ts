import type { NextRequest } from "next/server";
import { searchProducts } from "@/lib/catalog/data";

/** Instant search suggestions for the header overlay. Public, read-only, top 6. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  const products = await searchProducts(q, 6);
  return Response.json(
    {
      results: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        price: p.price,
        priceVaries: p.priceVaries,
        image: p.images[0] ? { src: p.images[0].src, alt: p.images[0].alt } : null,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
