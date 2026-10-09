import { expect, test, type Page } from "@playwright/test";

/**
 * Checkout without Razorpay keys: online payment isn't offered, cash on delivery is (enabled
 * by tests/e2e/global-setup.ts). The Razorpay flow itself is covered by the integration
 * tests; a real test-mode payment needs Razorpay test keys.
 */

async function toCheckout(page: Page, slug = "coaster-set") {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Your bag/ });
  await drawer.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
}

async function fillAddress(page: Page, stateName = "Karnataka") {
  await page.getByRole("textbox", { name: "Email" }).fill(`buyer-${Date.now()}@example.com`);
  await page.getByRole("textbox", { name: "Full name" }).fill("Ananya Rao");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("98765 43210");
  await page.getByRole("textbox", { name: "House / flat, street" }).fill("12 Lavelle Road");
  await page.getByRole("textbox", { name: "City / town" }).fill("Bengaluru");
  await page.getByRole("combobox", { name: "State" }).selectOption({ label: stateName });
  await page.getByRole("textbox", { name: "PIN code" }).fill("560001");
}

test("checkout shows the order, priced by the server", async ({ page }) => {
  await toCheckout(page);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByText("Coasters, Set of Four")).toBeVisible();
  await expect(summary.getByText("₹2,800").first()).toBeVisible();
  // ₹2,800 + ₹500 shipping + ₹50 cash-on-delivery fee (the only method without Razorpay keys)
  await expect(summary.getByText("₹3,350", { exact: true })).toBeVisible();
  // Without Razorpay keys only cash on delivery is offered
  await expect(page.getByRole("radio", { name: /Cash on delivery/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Pay online/ })).toHaveCount(0);
  // Fits the screen at every size (a grid column once pushed the fields off-screen on phones)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});

test("the GST split follows the delivery state", async ({ page }) => {
  await toCheckout(page);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await page.getByRole("combobox", { name: "State" }).selectOption({ label: "Karnataka" });
  await expect(summary.getByText(/CGST .* SGST/)).toBeVisible();
  await page.getByRole("combobox", { name: "State" }).selectOption({ label: "Maharashtra" });
  await expect(summary.getByText(/^IGST/)).toBeVisible();
});

test("missing details are highlighted and nothing is submitted", async ({ page }) => {
  await toCheckout(page);
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByText("Please check the highlighted details.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a 6-digit PIN code.")).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("a cash-on-delivery order is placed, confirmed and the bag emptied", async ({ page }) => {
  await toCheckout(page, "catchall-dish");
  await fillAddress(page);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByText("Cash on delivery fee")).toBeVisible();
  // ₹2,500 + ₹500 shipping + ₹50 COD fee
  await expect(page.getByRole("button", { name: "Place order · pay ₹3,050 on delivery" })).toBeVisible();
  await page.getByRole("button", { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/order\/SC-[A-Z0-9]+\?t=/);
  await expect(page.getByRole("heading", { name: "Thank you — your order is placed" })).toBeVisible();
  await expect(page.getByText("Test order — no real payment was taken.")).toBeVisible();
  await expect(page.getByText(/^SC\/\d{2}-\d{2}\/\d{4,}$/)).toBeVisible();
  await expect(page.getByText("To pay on delivery")).toBeVisible();

  await page.goto("/bag");
  await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible();
});

test("an order link with the wrong token shows nothing", async ({ page }) => {
  await page.goto("/order/SC-ABCDEF?t=not-a-real-token-but-long-enough");
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
});

test("checkout with an empty bag explains itself", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible();
});

test("the payment webhook and expiry job refuse unauthenticated calls", async ({ request }) => {
  const webhook = await request.post("/api/webhooks/razorpay", {
    data: '{"event":"payment.captured"}',
    headers: { "x-razorpay-signature": "forged", "content-type": "application/json" },
  });
  // No Razorpay keys here: the webhook reports "not configured" rather than accepting anything
  expect([401, 503]).toContain(webhook.status());
  const cron = await request.get("/api/cron/expire-orders");
  expect(cron.status()).toBe(401);
});
