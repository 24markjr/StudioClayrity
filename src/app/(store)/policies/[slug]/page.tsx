import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContentPage } from "@/components/store/content-page";
import { Skeleton } from "@/components/ui/display";
import { getPage } from "@/lib/catalog/data";
import { isPolicySlug, POLICY_PAGES } from "@/lib/content/pages";

export function generateStaticParams() {
  return POLICY_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return {};
  const page = await getPage(slug);
  return {
    title: page?.seoTitle ?? page?.title,
    description: page?.seoDescription ?? undefined,
    alternates: { canonical: `/policies/${slug}` },
  };
}

async function Policy({ params }: Pick<PageProps<"/policies/[slug]">, "params">) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const page = await getPage(slug);
  if (!page) notFound();
  return (
    <ContentPage
      title={page.title}
      body={page.body}
      isApproved={page.isApproved}
      updatedAt={page.updatedAt}
      crumbs={[{ label: "Home", href: "/" }, { label: page.title }]}
    />
  );
}

export default function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="container-prose space-y-4 pt-12">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <Policy params={params} />
    </Suspense>
  );
}
