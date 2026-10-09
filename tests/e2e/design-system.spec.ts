import { expect, test, type Page } from "@playwright/test";

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

test.describe("style guide", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/styleguide");
    // Surface hydration or runtime errors from the page in the test result
    test.info().annotations.push({ type: "errors", description: errors.join("\n") });
    expect(errors).toEqual([]);
  });

  test("renders every section without horizontal overflow", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Style guide" })).toBeVisible();
    for (const name of ["Brand", "Colour", "Typography", "Buttons", "Forms", "Commerce", "Motion"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
    }
    await noHorizontalOverflow(page);
  });

  test("dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Open dialog" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Request more photos" });
    await expect(dialog).toBeVisible();
    // First focusable element inside the dialog receives focus
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("bag drawer opens, closes with its close button", async ({ page }) => {
    await page.getByRole("button", { name: "Open bag drawer" }).click();
    const drawer = page.getByRole("dialog", { name: "Your bag (1)" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();
  });

  test("toast is announced in a live region and can be dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Show success toast" }).click();
    const region = page.locator("[aria-live=polite]");
    await expect(region).toContainText("Added to your bag");
    await region.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(region).not.toContainText("Added to your bag");
  });

  test("accordion toggles aria-expanded and content", async ({ page }) => {
    const button = page.getByRole("button", { name: "Care", exact: true });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Care" })).toContainText("Wipe with a soft, damp cloth.");
  });

  test("tabs follow arrow keys", async ({ page }) => {
    const details = page.getByRole("tab", { name: "Details" });
    await details.focus();
    await page.keyboard.press("ArrowRight");
    const care = page.getByRole("tab", { name: "Care" });
    await expect(care).toBeFocused();
    await expect(care).toHaveAttribute("aria-selected", "true");
  });

  test("quantity stepper respects its bounds", async ({ page }) => {
    const input = page.getByRole("spinbutton", { name: "Quantity" });
    const decrease = page.getByRole("button", { name: "Decrease quantity" });
    const increase = page.getByRole("button", { name: "Increase quantity" });
    await expect(input).toHaveValue("1");
    await expect(decrease).toBeDisabled();
    for (let i = 0; i < 3; i++) await increase.click();
    await expect(input).toHaveValue("4");
    await expect(increase).toBeDisabled();
  });

  test("form errors are linked to their field", async ({ page }) => {
    const pincode = page.getByRole("textbox", { name: "Pincode" });
    await expect(pincode).toHaveAttribute("aria-invalid", "true");
    await expect(pincode).toHaveAccessibleDescription("Enter a 6-digit pincode.");
  });
});

test.describe("hero mockup", () => {
  test("headline keeps word spacing for assistive tech and is fully visible", async ({ page }) => {
    await page.goto("/styleguide/hero");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveAccessibleName("Objects shaped by stone and time");
    await expect(page.getByRole("link", { name: "Explore the collection" })).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("with reduced motion, content is visible immediately", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/styleguide/hero");
    await expect(page.getByRole("link", { name: "Explore the collection" })).toBeVisible({ timeout: 1500 });
    await context.close();
  });
});
