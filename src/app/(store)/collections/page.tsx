import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion/primitives";
import { CatalogImage } from "@/components/store/catalog-image";
import { PageHeader } from "@/components/store/page-header";
import { EmptyState } from "@/components/ui/display";
import { getCollections } from "@/lib/catalog/data";

export const metadata: Metadata = {
  title: "Collections",
  description: "Curated collections of decor objects in natural stone.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const collections = await getCollections();
  return (
    <div className="container-wide pb-section-md">
      <PageHeader title="Collections" crumbs={[{ label: "Home", href: "/" }, { label: "Collections" }]} />
      {collections.length === 0 ? (
        <EmptyState title="No collections yet" description="Collections will appear here soon." />
      ) : (
        <ul className="grid gap-x-6 gap-y-14 md:grid-cols-2">
          {collections.map((c, i) => (
            <li key={c.slug}>
              <Reveal delay={(i % 2) * 0.08}>
                <Link href={`/collections/${c.slug}`} className="group block">
                  <div className="overflow-hidden">
                    <div className="ease-out-quint transition-transform duration-700 group-hover:scale-[1.03]">
                      <CatalogImage
                        src={c.cover}
                        alt={c.name}
                        ratio="3/2"
                        sizes="(min-width: 48rem) 50vw, 100vw"
                        priority={i < 2}
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex items-baseline justify-between gap-4">
                    <h2 className="type-h3">{c.name}</h2>
                    <span className="type-caption text-stone shrink-0">
                      {c.productCount} {c.productCount === 1 ? "piece" : "pieces"}
                    </span>
                  </div>
                  {c.intro && <p className="type-small text-stone mt-2 max-w-lg">{c.intro.split("\n")[0]}</p>}
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
