import { expect, test, type Page } from "@playwright/test";

/** Each test gets a fresh browser context, so a fresh bag and wishlist cookie. */

async function addFromProductPage(page: Page, slug: string, variant?: string) {
  await page.goto(`/products/${slug}`);
  if (variant) await page.getByRole("radio", { name: variant }).click();
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Your bag/ });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("adding a piece opens the bag and updates the count", async ({ page }) => {
  const drawer = await addFromProductPage(page, "travertine-tray", "Large");
  await expect(drawer.getByRole("link", { name: "Travertine Tray" })).toBeVisible();
  await expect(drawer.getByText("Large")).toBeVisible();
  await expect(drawer.getByText("₹8,500").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toBeAttached();
  await expect(drawer.getByRole("link", { name: "Checkout" })).toBeVisible();
});

test("the bag survives a reload and quantities update totals", async ({ page }) => {
  const drawer = await addFromProductPage(page, "coaster-set");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await drawer.getByRole("button", { name: "Increase quantity of Coasters, Set of Four" }).click();
  await saved;
  await expect(drawer.getByRole("spinbutton", { name: "Quantity of Coasters, Set of Four" })).toHaveValue(
    "2",
  );
  await expect(drawer.getByText("₹5,600").first()).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Bag, 2 items" }).click();
  await expect(page.getByRole("dialog", { name: /Your bag \(2\)/ })).toBeVisible();
});

test("a one-of-a-kind piece can only be added once", async ({ page }) => {
  const drawer = await addFromProductPage(page, "nero-marble-bowl");
  await expect(drawer.getByText("Qty 1")).toBeVisible();
  await expect(drawer.getByRole("spinbutton")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await expect(page.getByText(/Only 1 available/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toBeAttached();
});

test("coupons apply, explain rejections and can be removed", async ({ page }) => {
  const drawer = await addFromProductPage(page, "catchall-dish");
  await drawer.getByRole("button", { name: "Have a code?" }).click();
  const input = drawer.getByRole("textbox", { name: "Discount code" });

  await input.fill("SAMPLE10");
  await drawer.getByRole("button", { name: "Apply" }).click();
  await expect(drawer.getByText("SAMPLE10 needs a minimum order of ₹5,000.")).toBeVisible();

  await input.fill("NOTACODE");
  await drawer.getByRole("button", { name: "Apply" }).click();
  await expect(drawer.getByText("That code isn't valid.")).toBeVisible();

  await drawer.getByRole("button", { name: "Increase quantity of Catchall Dish" }).click();
  await expect(drawer.getByRole("spinbutton", { name: "Quantity of Catchall Dish" })).toHaveValue("2");
  await input.fill("sample10");
  await drawer.getByRole("button", { name: "Apply" }).click();
  await expect(drawer.getByText("Discount (SAMPLE10)")).toBeVisible();
  await expect(drawer.getByText("− ₹500")).toBeVisible();

  await drawer.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(drawer.getByText("Discount (SAMPLE10)")).toBeHidden();
});

test("removing the last item shows the empty bag", async ({ page }) => {
  const drawer = await addFromProductPage(page, "catchall-dish");
  await drawer.getByRole("button", { name: "Remove Catchall Dish from your bag" }).click();
  await expect(drawer.getByRole("heading", { name: "Your bag is empty" })).toBeVisible();
});

test("gift options are saved with the bag", async ({ page }) => {
  const drawer = await addFromProductPage(page, "catchall-dish");
  // Each change is a server action (POST); wait for each to be confirmed
  const saved = () => page.waitForResponse((r) => r.request().method() === "POST" && r.ok());

  await drawer.getByRole("checkbox", { name: "This is a gift" }).check();
  let response = saved();
  await drawer.getByRole("checkbox", { name: "Hide prices on the packing slip" }).check();
  await response;

  await drawer.getByRole("textbox", { name: /Gift message/ }).fill("For your new home");
  response = saved();
  await drawer.getByRole("textbox", { name: /Gift message/ }).blur();
  await response;

  await page.goto("/bag");
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByRole("checkbox", { name: "Hide prices on the packing slip" })).toBeChecked();
  await expect(summary.getByRole("textbox", { name: /Gift message/ })).toHaveValue("For your new home");
});

// Rates are confirmed in tests/e2e/global-setup.ts (₹500, free above ₹15,000). The
// "not confirmed yet" behaviour is covered by the cart integration tests.
test("shipping is quoted from the store's rates, with the free-shipping gap", async ({ page }) => {
  const drawer = await addFromProductPage(page, "catchall-dish");
  await expect(drawer.getByText("Add ₹12,500 more for free shipping.")).toBeVisible();
  await expect(drawer.getByText("Total", { exact: true })).toBeVisible();
});

test("the bag page lists items with a summary", async ({ page }) => {
  await addFromProductPage(page, "arc-candle-holder", "Black");
  await page.goto("/bag");
  await expect(page.getByRole("heading", { level: 1, name: "Your bag" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Arc Candle Holder" }).first()).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Order summary" }).getByText("₹3,400").first(),
  ).toBeVisible();
});

test("wishlist hearts save pieces to the wishlist page", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: "Save Travertine Tray to your wishlist" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Travertine Tray from your wishlist" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Wait for the server to confirm before leaving the page
  await expect(page.getByText("Saved to your wishlist.")).toBeAttached();

  await page.goto("/wishlist");
  await expect(page.getByRole("link", { name: "Travertine Tray", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Travertine Tray from your wishlist" }).click();
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
});

test("mobile shows a sticky add-to-bag bar after scrolling past the button", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/products/slab-serving-board");
  const bar = page.locator(".fixed.bottom-0").filter({ hasText: "Slab Serving Board" });
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: "Description" }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 900);
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
});
