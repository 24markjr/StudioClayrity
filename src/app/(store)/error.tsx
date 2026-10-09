"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/display";

/** Storefront error boundary: keeps the header and footer, offers a retry. */
export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-section-md">
      <ErrorState
        title="This page didn't load"
        description="Something went wrong on our side. Please try again — if it keeps happening, let us know."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Go to the homepage
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
