import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/display";
import { breadcrumbJsonLd, JsonLd } from "./json-ld";

export function PageHeader({
  title,
  intro,
  crumbs,
  children,
}: {
  title: string;
  intro?: ReactNode;
  crumbs: Crumb[];
  children?: ReactNode;
}) {
  return (
    <header className="pt-8 pb-10 lg:pt-12 lg:pb-14">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <h1 className="type-h1 mt-6">{title}</h1>
      {intro && <div className="type-body-lg text-stone mt-5 max-w-2xl">{intro}</div>}
      {children}
    </header>
  );
}
