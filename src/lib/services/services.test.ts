import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DevLogEmailProvider, ResendEmailProvider, UnconfiguredEmailProvider } from "./email";
import { IntegrationNotConfiguredError, maskEmail, ProviderError } from "./errors";
import { selectServices } from "./index";
import { RazorpayProvider, UnconfiguredPaymentProvider, verifyHmacSha256 } from "./payment";
import { CloudinaryStorage, signCloudinaryParams, UnconfiguredStorage } from "./storage";

const hmac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");

function mockFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("Razorpay", () => {
  const provider = new RazorpayProvider("rzp_test_abc", "key_secret", "hook_secret");

  it("verifies the checkout signature over order_id|payment_id", () => {
    const signature = hmac("order_1|pay_1", "key_secret");
    expect(provider.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(provider.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature })).toBe(
      false,
    );
    expect(provider.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "zz" })).toBe(
      false,
    );
  });

  it("verifies webhook signatures against the exact raw body", () => {
    const body = '{"event":"payment.captured","payload":{}}';
    expect(provider.verifyWebhookSignature(body, hmac(body, "hook_secret"))).toBe(true);
    // Re-serialised JSON (different whitespace) must not verify
    expect(provider.verifyWebhookSignature(body.replace(":", ": "), hmac(body, "hook_secret"))).toBe(false);
    expect(provider.verifyWebhookSignature(body, hmac(body, "wrong"))).toBe(false);
  });

  it("detects test mode from the key id", () => {
    expect(provider.isTestMode).toBe(true);
    expect(new RazorpayProvider("rzp_live_x", "s", undefined).isTestMode).toBe(false);
  });

  it("creates orders with basic auth and paise amounts", async () => {
    const fetchImpl = mockFetch(200, {
      id: "order_X",
      amount: 850000,
      currency: "INR",
      receipt: "SC-ABC",
      status: "created",
    });
    const p = new RazorpayProvider("rzp_test_abc", "key_secret", undefined, fetchImpl);
    const order = await p.createOrder({ amount: 850000, currency: "INR", receipt: "SC-ABC" });
    expect(order.id).toBe("order_X");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("rzp_test_abc:key_secret").toString("base64")}`,
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      amount: 850000,
      currency: "INR",
      receipt: "SC-ABC",
    });
  });

  it("refuses amounts below ₹1 and surfaces provider errors", async () => {
    await expect(provider.createOrder({ amount: 99, currency: "INR", receipt: "x" })).rejects.toThrow(
      RangeError,
    );
    const p = new RazorpayProvider("k", "s", undefined, mockFetch(400, { error: {} }));
    await expect(p.createOrder({ amount: 1000, currency: "INR", receipt: "x" })).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it("never fakes success when unconfigured", async () => {
    const p = new UnconfiguredPaymentProvider();
    await expect(p.createOrder()).rejects.toBeInstanceOf(IntegrationNotConfiguredError);
    expect(() => p.verifyPaymentSignature()).toThrow(IntegrationNotConfiguredError);
    expect(() => p.verifyWebhookSignature()).toThrow(IntegrationNotConfiguredError);
  });

  it("rejects malformed signatures without throwing", () => {
    expect(verifyHmacSha256("x", "secret", "")).toBe(false);
    expect(verifyHmacSha256("x", "", hmac("x", ""))).toBe(false);
  });
});

describe("email", () => {
  it("sends through Resend with an idempotency key", async () => {
    const fetchImpl = mockFetch(200, { id: "msg_1" });
    const p = new ResendEmailProvider("re_key", "Studio Clayrity <orders@studioclayrity.com>", fetchImpl);
    const result = await p.send({
      to: "a@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: "k1",
    });
    expect(result.id).toBe("msg_1");
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("k1");
    expect(headers.Authorization).toBe("Bearer re_key");
  });

  it("dev logger masks the recipient", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await new DevLogEmailProvider().send({
      to: "ananya.rao@example.com",
      subject: "Order",
      html: "",
      text: "",
    });
    expect(spy.mock.calls[0][0]).toContain("a***@example.com");
    expect(spy.mock.calls[0][0]).not.toContain("ananya");
    spy.mockRestore();
  });

  it("masks emails for logs", () => {
    expect(maskEmail("ananya@example.com")).toBe("a***@example.com");
    expect(maskEmail("nonsense")).toBe("***");
  });
});

describe("Cloudinary signing", () => {
  it("matches Cloudinary's documented example", () => {
    // https://cloudinary.com/documentation/authentication_signatures
    expect(
      signCloudinaryParams(
        { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 },
        "abcd",
      ),
    ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("excludes api_key, file and empty values from the signature", () => {
    const base = signCloudinaryParams({ folder: "products", timestamp: 1 }, "s");
    expect(
      signCloudinaryParams({ folder: "products", timestamp: 1, api_key: "k", file: "x", public_id: "" }, "s"),
    ).toBe(base);
  });

  it("creates a signed upload without exposing the secret", () => {
    const storage = new CloudinaryStorage("demo", "key", "super_secret", () => 1_700_000_000_000);
    const upload = storage.createSignedUpload({ folder: "products/nero-bowl" });
    expect(upload.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(upload.fields).toMatchObject({
      folder: "products/nero-bowl",
      timestamp: "1700000000",
      api_key: "key",
    });
    expect(JSON.stringify(upload)).not.toContain("super_secret");
    expect(() => storage.createSignedUpload({ folder: "../etc" })).toThrow();
  });
});

describe("selectServices", () => {
  it("uses safe fallbacks with no keys in development", () => {
    const s = selectServices({ APP_ENV: "local" });
    expect(s.payment).toBeInstanceOf(UnconfiguredPaymentProvider);
    expect(s.email).toBeInstanceOf(DevLogEmailProvider);
    expect(s.storage).toBeInstanceOf(UnconfiguredStorage);
  });

  it("never silently drops email in production", () => {
    expect(selectServices({ APP_ENV: "production" }).email).toBeInstanceOf(UnconfiguredEmailProvider);
  });

  it("uses real providers when keys are present", () => {
    const s = selectServices({
      RAZORPAY_KEY_ID: "rzp_test_x",
      RAZORPAY_KEY_SECRET: "s",
      RESEND_API_KEY: "re",
      EMAIL_FROM: "orders@studioclayrity.com",
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "c",
      CLOUDINARY_API_KEY: "k",
      CLOUDINARY_API_SECRET: "s",
    });
    expect(s.payment).toBeInstanceOf(RazorpayProvider);
    expect(s.email).toBeInstanceOf(ResendEmailProvider);
    expect(s.storage).toBeInstanceOf(CloudinaryStorage);
  });
});
