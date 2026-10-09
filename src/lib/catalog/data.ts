import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db/client";
import { getSetting, type SettingKey } from "../domain/settings";
import type { ListingFilters } from "./filters";
import * as repo from "./repository";

/**
 * Cached catalogue reads for pages. Tags let the admin (Phase 8) and checkout (Phase 6)
 * refresh exactly what changed:
 *   catalog        any product/collection/category change
 *   product:<slug> one product (price, stock, content)
 *   settings       store settings and pages
 *
 * Stock shown here can be a few minutes old; the bag and checkout always re-read it live.
 */

export async function getNavigation() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getNavigation(getDb());
}

export async function listProducts(scope: repo.ListingScope, filters: ListingFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return repo.listProducts(getDb(), scope, filters);
}

export async function getFacets(scope: repo.ListingScope) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getFacets(getDb(), scope);
}

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog", `product:${slug}`);
  return repo.getProductBySlug(getDb(), slug);
}

export async function getRelatedProducts(productId: string, categorySlug: string | null) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getRelatedProducts(getDb(), { id: productId, categorySlug });
}

export async function getComplementaryProducts(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getComplementaryProducts(getDb(), productId);
}

export async function getFeaturedProducts(limit = 8) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return repo.getFeaturedProducts(getDb(), limit);
}

export async function getGiftableProducts(limit = 4) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return repo.getGiftableProducts(getDb(), limit);
}

export async function getProductsBySlugs(slugs: string[]) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return repo.getProductsBySlugs(getDb(), slugs);
}

export async function getCollections(featuredOnly = false) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getCollections(getDb(), { featuredOnly });
}

export async function getCollection(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getCollection(getDb(), slug);
}

export async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getCategory(getDb(), slug);
}

export async function searchProducts(query: string, limit = 24) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return repo.searchProducts(getDb(), query, limit);
}

export async function resolveRedirect(entity: "product" | "collection" | "category", slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.resolveRedirect(getDb(), entity, slug);
}

export async function getStaticSlugs() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return repo.getStaticSlugs(getDb());
}

export async function getPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  return repo.getPublishedPage(getDb(), slug);
}

export async function getPageLinks() {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  return repo.getPublishedPageLinks(getDb());
}

export async function getStoreSetting<K extends SettingKey>(key: K) {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  return getSetting(getDb(), key);
}
