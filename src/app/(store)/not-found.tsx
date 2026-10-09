import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

export default function NotFound() {
  return (
    <div className="container-page py-section-md">
      <p className="type-overline text-stone text-center">404</p>
      <EmptyState
        className="pt-6"
        title="We couldn't find that page"
        description="The piece may have found a home, or the link may have changed."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/shop">Browse all pieces</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Homepage
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
