"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogImage } from "../catalog-image";

type Entry = { slug: string; name: string; image: string | null; alt: string };

const KEY = "sc-recently-viewed";
const MAX = 8;

function read(): Entry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e?.slug === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/**
 * Records the current product and shows others viewed on this device. Stored only in
 * this browser. Prices are deliberately not stored or shown, so they can never be stale.
 */
export function RecentlyViewed({ current }: { current: Entry }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const previous = read().filter((e) => e.slug !== current.slug);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setEntries(previous.slice(0, 4));
    try {
      localStorage.setItem(KEY, JSON.stringify([current, ...previous].slice(0, MAX)));
    } catch {
      // storage unavailable — nothing to remember
    }
  }, [current]);

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="recent-title" className="border-line pt-section-sm border-t">
      <h2 id="recent-title" className="type-h3 mb-8">
        Recently viewed
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:gap-x-6">
        {entries.map((e) => (
          <li key={e.slug}>
            <Link href={`/products/${e.slug}`} className="group block">
              <CatalogImage src={e.image} alt={e.alt} sizes="(min-width: 48rem) 22vw, 45vw" />
              <span className="type-card-title group-hover:text-earth mt-3 block">{e.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
