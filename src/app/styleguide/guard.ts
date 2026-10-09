import { notFound } from "next/navigation";

/**
 * The style guide is for internal review. It is hidden in production unless
 * SHOW_STYLEGUIDE=true (useful before launch, so the owner can review it on the live URL).
 */
export function assertStyleguideEnabled() {
  if (process.env.APP_ENV === "production" && process.env.SHOW_STYLEGUIDE !== "true") {
    notFound();
  }
}
