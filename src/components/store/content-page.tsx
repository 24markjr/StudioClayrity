import { Breadcrumbs, Notice, type Crumb } from "@/components/ui/display";
import { Markdown } from "@/lib/content/markdown";

/** Owner-edited pages (About, policies). Unapproved drafts carry a visible notice. */
export function ContentPage({
  title,
  body,
  isApproved,
  crumbs,
  updatedAt,
}: {
  title: string;
  body: string;
  isApproved: boolean;
  crumbs: Crumb[];
  updatedAt: Date;
}) {
  return (
    <article className="container-prose pb-section-md pt-8 lg:pt-12">
      <Breadcrumbs items={crumbs} />
      <h1 className="type-h1 mt-6">{title}</h1>
      {!isApproved && (
        <Notice tone="warning" title="Pending owner approval" className="mt-8">
          This page is a draft and may change before launch.
        </Notice>
      )}
      <Markdown source={body} className="type-body mt-8" />
      <p className="type-caption text-stone border-line mt-16 border-t pt-6">
        Last updated{" "}
        {updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
    </article>
  );
}
