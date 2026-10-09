import { expect, test } from "@playwright/test";

test.describe("protected areas", () => {
  for (const path of ["/admin", "/admin/orders?status=paid", "/account", "/account/orders"]) {
    test(`${path} sends signed-out visitors to sign-in`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308]).toContain(response.status());
      const location = new URL(response.headers().location, "http://localhost");
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("next")).toBe(path);
    });
  }

  test("public pages are not affected", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });
});
