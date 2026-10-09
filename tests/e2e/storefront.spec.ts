import { expect, test, type Page } from "@playwright/test";

/** Requires the sample catalogue (`pnpm db:seed`) in the database the server uses. */

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
}

test("homepage shows the hero, collections and curated pieces", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    "Objects shaped by stone and time",
  );
  await expect(page.getByRole("heading", { name: "Curated pieces" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nero Marble Bowl" }).first()).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("navigates from the shop to a product", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { name: "All pieces", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "12 pieces" })).toBeVisible();
  await page.getByRole("link", { name: "Travertine Tray" }).click();
  await expect(page).toHaveURL(/\/products\/travertine-tray$/);
  await expect(page.getByRole("heading", { level: 1, name: "Travertine Tray" })).toBeVisible();
});

test("filters and sorting update the results and the URL", async ({ page, isMobile }) => {
  await page.goto("/shop");
  if (isMobile) {
    await page.getByRole("button", { name: /^Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("checkbox", { name: /^Travertine/ }).check();
    await sheet.getByRole("button", { name: "Show results" }).click();
  } else {
    await page
      .getByRole("complementary", { name: "Filters" })
      .getByRole("checkbox", { name: /^Travertine/ })
      .check();
  }
  await expect(page).toHaveURL(/material=Travertine/);
  await expect(page.getByRole("status").filter({ hasText: "3 pieces" })).toBeVisible();

  await page.getByRole("combobox", { name: "Sort by" }).selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  const names = page.locator("main article h3");
  await expect(names.first()).toHaveText("Travertine Tray");

  // Reloading the URL restores the same view
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "3 pieces" })).toBeVisible();
});

test("shows an empty state when nothing matches", async ({ page }) => {
  await page.goto("/shop?min=900000");
  await expect(page.getByRole("heading", { name: "No pieces match these filters" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/shop$/);
});

test("choosing a variant updates price and SKU", async ({ page }) => {
  await page.goto("/products/travertine-tray");
  await expect(page.getByRole("main").getByText("SKU SAMPLE-TRAY-001-S")).toBeVisible();
  await page.getByRole("radio", { name: "Large" }).click();
  await expect(page.getByRole("radio", { name: "Large" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("main").getByText("SKU SAMPLE-TRAY-001-L")).toBeVisible();
  await expect(page.getByText("₹8,500").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to bag" }).first()).toBeEnabled();
});

test("product details expand, and structured data is present", async ({ page }) => {
  await page.goto("/products/nero-marble-bowl");
  await page.getByRole("button", { name: "Dimensions & weight" }).click();
  await expect(page.getByRole("region", { name: "Dimensions & weight" })).toContainText("32 cm");
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = jsonLd.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Product");
  expect(product.offers[0]).toMatchObject({ price: "8500.00", priceCurrency: "INR" });
});

test("sold-out pieces offer a back-in-stock email", async ({ page }) => {
  await page.goto("/products/bianco-bookends");
  await expect(page.getByRole("main").getByText("Currently sold out.")).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email address" }).first();
  await email.fill("not-an-email");
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await email.fill(`e2e-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText("We'll email you if it becomes available.")).toBeVisible();
});

test("the lightbox opens and closes with the keyboard", async ({ page, isMobile }) => {
  await page.goto("/products/travertine-tray");
  const opener = isMobile
    ? page.getByRole("button", { name: /View image 1 of 4 full screen/ })
    : page.getByRole("button", { name: /full screen$/ }).last();
  await opener.click();
  const viewer = page.getByRole("dialog", { name: "Image viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("1 / 4")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("2 / 4")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("search suggests products and opens full results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search" }).click();
  const box = page.getByRole("searchbox", { name: "Search products" });
  await box.fill("travertin");
  await expect(
    page.getByRole("dialog", { name: "Search" }).getByRole("link", { name: /Travertine Tray/ }),
  ).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=travertin/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("travertin");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Travertine Tray", exact: true }),
  ).toBeVisible();
});

test("newsletter requires consent", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("section", {
    has: page.getByRole("heading", { name: "Letters from the studio" }),
  });
  await form.getByRole("textbox", { name: "Email address" }).fill(`news-${Date.now()}@example.com`);
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText("Please tick the box")).toBeVisible();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText("you're on the list")).toBeVisible();
});

test("collections and policy pages render", async ({ page }) => {
  await page.goto("/collections");
  await page.getByRole("link", { name: /The Stone Edit/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Stone Edit" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "5 pieces" })).toBeVisible();

  await page.goto("/policies/returns");
  await expect(page.getByRole("heading", { level: 1, name: "Returns and refunds" })).toBeVisible();
  await expect(page.getByText("Pending owner approval")).toBeVisible();
});

test("unknown products show the not-found page", async ({ page }) => {
  await page.goto("/products/does-not-exist");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("mobile menu opens and navigates", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "Bowls" }).click();
  await expect(page).toHaveURL(/\/shop\/bowls$/);
  await expect(menu).toBeHidden();
});
