import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/store/content-page";
import { getPage } from "@/lib/catalog/data";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("about");
  return {
    title: page?.seoTitle ?? page?.title ?? "Our story",
    description: page?.seoDescription ?? undefined,
    alternates: { canonical: "/about" },
  };
}

export default async function AboutPage() {
  const page = await getPage("about");
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
