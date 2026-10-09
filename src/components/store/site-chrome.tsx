import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { WhatsAppIcon } from "@/components/ui/icons";
import { getNavigation, getPageLinks, getStoreSetting } from "@/lib/catalog/data";
import { POLICY_PAGES } from "@/lib/content/pages";
import { normaliseIndianMobile } from "@/lib/domain/india";
import { features } from "@/lib/features";
import { AnnouncementBar } from "./announcement-bar";
import { NewsletterForm } from "./forms";
import { HeaderBar } from "./header-bar";

export async function SiteHeader() {
  const [nav, pages, announcement] = await Promise.all([
    getNavigation(),
    getPageLinks(),
    getStoreSetting("announcement"),
  ]);
  return (
    <>
      {announcement.enabled && announcement.message && (
        <AnnouncementBar message={announcement.message} href={announcement.href} />
      )}
      <header className="border-line bg-ivory/95 supports-[backdrop-filter]:bg-ivory/85 sticky top-0 z-30 border-b backdrop-blur">
        <HeaderBar
          nav={{
            categories: nav.categories,
            collections: nav.collections.map((c) => ({ slug: c.slug, name: c.name, cover: c.cover })),
            showAbout: pages.some((p) => p.slug === "about"),
            bag: features.bag,
            wishlist: features.wishlist,
          }}
        />
      </header>
    </>
  );
}

/** wa.me link from an Indian mobile number in settings, or null when not configured. */
export function whatsappHref(number: string, message: string) {
  const mobile = normaliseIndianMobile(number);
  return mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}` : null;
}

export async function WhatsAppButton() {
  const contact = await getStoreSetting("contact");
  const href = whatsappHref(contact.whatsapp, "Hello Studio Clayrity, I have a question about a piece.");
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens in a new tab)"
      className="bg-charcoal text-ivory hover:bg-earth fixed right-4 bottom-4 z-20 flex size-12 items-center justify-center shadow-[0_8px_24px_-8px_rgb(39_38_34/0.5)] transition-colors sm:right-6 sm:bottom-6"
    >
      <WhatsAppIcon />
    </a>
  );
}

export async function SiteFooter() {
  "use cache";
  cacheLife("days");
  cacheTag("catalog", "settings");

  const [nav, pages, contact, seller, social] = await Promise.all([
    getNavigation(),
    getPageLinks(),
    getStoreSetting("contact"),
    getStoreSetting("seller"),
    getStoreSetting("social"),
  ]);
  const policies = POLICY_PAGES.filter((p) => pages.some((page) => page.slug === p.slug));
  const year = new Date().getFullYear();
  const columnTitle = "type-overline text-stone";
  const linkClass = "type-small text-ivory/90 hover:text-ivory transition-colors";

  return (
    <footer className="surface-dark mt-auto">
      <div className="container-wide py-section-sm grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Link href="/" aria-label="Studio Clayrity — home" className="text-xl">
            <Wordmark />
          </Link>
          <p className="type-small text-stone mt-6 max-w-sm">
            Letters from the studio: new pieces and notes on caring for stone.
          </p>
          <NewsletterForm
            source="footer"
            tone="dark"
            className="[&_input]:border-line-strong [&_input]:text-ivory mt-5 max-w-md [&_input]:bg-transparent"
          />
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7 lg:col-start-6"
        >
          <div>
            <h2 className={columnTitle}>Shop</h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/shop" className={linkClass}>
                  All pieces
                </Link>
              </li>
              {nav.categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/shop/${c.slug}`} className={linkClass}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/collections" className={linkClass}>
                  Collections
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={columnTitle}>Help</h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/track-order" className={linkClass}>
                  Track your order
                </Link>
              </li>
              {policies.map((p) => (
                <li key={p.slug}>
                  <Link href={`/policies/${p.slug}`} className={linkClass}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={columnTitle}>Studio</h2>
            <ul className="mt-4 space-y-2.5">
              {pages.some((p) => p.slug === "about") && (
                <li>
                  <Link href="/about" className={linkClass}>
                    Our story
                  </Link>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} className={linkClass}>
                    {contact.email}
                  </a>
                </li>
              )}
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className={linkClass}>
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.hours && <li className="type-small text-stone">{contact.hours}</li>}
              {social.instagram && (
                <li>
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Instagram
                  </a>
                </li>
              )}
              {social.pinterest && (
                <li>
                  <a href={social.pinterest} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Pinterest
                  </a>
                </li>
              )}
            </ul>
          </div>
        </nav>
      </div>

      <div className="border-line border-t">
        <div className="container-wide type-caption text-stone flex flex-col gap-2 py-6 md:flex-row md:flex-wrap md:justify-between">
          <p>
            © {year} {seller.legalName}
            {seller.gstin && <> · GSTIN {seller.gstin}</>}
          </p>
          {contact.grievanceOfficer.name && contact.grievanceOfficer.email && (
            <p>
              {contact.grievanceOfficer.designation}: {contact.grievanceOfficer.name} ·{" "}
              <a
                href={`mailto:${contact.grievanceOfficer.email}`}
                className="hover:text-ivory underline underline-offset-4"
              >
                {contact.grievanceOfficer.email}
              </a>
            </p>
          )}
          <p>Prices include GST.</p>
        </div>
      </div>
    </footer>
  );
}
