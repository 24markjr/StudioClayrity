import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";

/** 404 for URLs outside any route (store pages use app/(store)/not-found.tsx). */
export default function RootNotFound() {
  return (
    <main className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center">
      <Link href="/" aria-label="Studio Clayrity — home" className="text-xl">
        <Wordmark />
      </Link>
      <p className="type-overline text-stone mt-16">404</p>
      <h1 className="type-h2 mt-4">We couldn&apos;t find that page</h1>
      <p className="type-body text-stone mt-4 max-w-md">
        The link may have changed, or the page may have moved.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/shop">Browse all pieces</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Homepage
        </ButtonLink>
      </div>
    </main>
  );
}
