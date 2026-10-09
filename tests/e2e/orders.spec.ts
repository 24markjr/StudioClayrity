import { expect, test } from "@playwright/test";

/**
 * After the order: guest tracking, the GST invoice download, and the endpoints that must
 * refuse callers without the right secret.
 */

test("guest tracking finds an order only with the matching contact, and the invoice downloads", async ({
  page,
}) => {
  const email = `track-${Date.now()}@example.com`;
  await page.goto("/products/catchall-dish");
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page
    .getByRole("dialog", { name: /Your bag/ })
    .getByRole("link", { name: "Checkout" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Full name" }).fill("Ananya Rao");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("98765 43210");
  await page.getByRole("textbox", { name: "House / flat, street" }).fill("12 Lavelle Road");
  await page.getByRole("textbox", { name: "City / town" }).fill("Bengaluru");
  await page.getByRole("combobox", { name: "State" }).selectOption({ label: "Karnataka" });
  await page.getByRole("textbox", { name: "PIN code" }).fill("560001");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/order\/SC-[A-Z0-9]+\?t=/);
  const ref = /\/order\/(SC-[A-Z0-9]+)/.exec(page.url())![1];

  // Invoice PDF through the private link
  const invoice = page.getByRole("link", { name: "Download GST invoice (PDF)" });
  await expect(invoice).toBeVisible();
  const href = (await invoice.getAttribute("href"))!;
  const pdf = await page.request.get(href);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get(`/api/orders/${ref}/invoice?t=wrong`)).status()).toBe(404);

  // Wrong contact: the same "not found" as a wrong reference
  await page.goto(`/track-order?ref=${ref}`);
  await expect(page.getByRole("textbox", { name: "Order number" })).toHaveValue(ref);
  await page.getByRole("textbox", { name: "Email or mobile number" }).fill("someone@example.com");
  await page.getByRole("button", { name: "Track order" }).click();
  await expect(page.getByText(/We couldn't find an order with those details/)).toBeVisible();

  // Right contact (the mobile number, typed differently)
  await page.getByRole("textbox", { name: "Email or mobile number" }).fill("+91 9876543210");
  await page.getByRole("button", { name: "Track order" }).click();
  await expect(page.getByRole("heading", { name: "Order confirmed (cash on delivery)" })).toBeVisible();
  await expect(page.getByText("1 × Catchall Dish", { exact: false })).toBeVisible();
});

test("the footer links to order tracking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Track your order" }).click();
  await expect(page).toHaveURL(/\/track-order$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("courier webhook and daily cron refuse unauthenticated calls", async ({ request }) => {
  // No SHIPROCKET_WEBHOOK_TOKEN in the test environment: the webhook is switched off
  const webhook = await request.post("/api/webhooks/courier-tracking", {
    data: { awb: "AWB1", current_status: "DELIVERED" },
  });
  expect(webhook.status()).toBe(503);
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  expect(
    (await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } })).status(),
  ).toBe(401);
});
