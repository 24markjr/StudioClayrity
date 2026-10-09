import { createHmac, timingSafeEqual } from "node:crypto";
import { IntegrationNotConfiguredError, ProviderError } from "./errors";

/**
 * Payment boundary. Razorpay is the India-first implementation; the interface keeps the
 * rest of the app independent of it. There is deliberately no "fake success" provider:
 * without keys every call throws IntegrationNotConfiguredError.
 */

export type ProviderOrder = { id: string; amount: number; currency: string; receipt: string; status: string };

export type ProviderPayment = {
  id: string;
  orderId: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

export type ProviderRefund = { id: string; paymentId: string; amount: number; status: string };

export interface PaymentProvider {
  readonly name: "razorpay";
  readonly isTestMode: boolean;
  /** Public key id for the browser checkout */
  readonly publicKey: string;
  createOrder(input: {
    amount: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  refund(input: {
    paymentId: string;
    amount: number;
    notes?: Record<string, string>;
  }): Promise<ProviderRefund>;
  /** Verifies the signature Checkout returns to the browser after payment */
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Verifies X-Razorpay-Signature on webhooks, using the exact raw request body */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** Constant-time HMAC-SHA256 hex comparison. */
export function verifyHmacSha256(payload: string, secret: string, signatureHex: string) {
  if (!secret || !signatureHex || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(signatureHex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  private readonly base = "https://api.razorpay.com/v1";

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get isTestMode() {
    return this.keyId.startsWith("rzp_test_");
  }

  get publicKey() {
    return this.keyId;
  }

  private async request<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new ProviderError("Razorpay", response.status, text);
    return JSON.parse(text) as T;
  }

  async createOrder(input: {
    amount: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }) {
    if (!Number.isSafeInteger(input.amount) || input.amount < 100) {
      throw new RangeError("Razorpay orders must be at least ₹1 (100 paise)");
    }
    const order = await this.request<{
      id: string;
      amount: number;
      currency: string;
      receipt: string;
      status: string;
    }>("/orders", {
      method: "POST",
      body: { amount: input.amount, currency: input.currency, receipt: input.receipt, notes: input.notes },
    });
    return order;
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const p = await this.request<{
      id: string;
      order_id: string | null;
      amount: number;
      currency: string;
      status: ProviderPayment["status"];
      method: string | null;
      error_code: string | null;
      error_description: string | null;
    }>(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
    return {
      id: p.id,
      orderId: p.order_id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      method: p.method,
      errorCode: p.error_code,
      errorDescription: p.error_description,
    };
  }

  async refund(input: { paymentId: string; amount: number; notes?: Record<string, string> }) {
    const r = await this.request<{ id: string; payment_id: string; amount: number; status: string }>(
      `/payments/${encodeURIComponent(input.paymentId)}/refund`,
      { method: "POST", body: { amount: input.amount, notes: input.notes } },
    );
    return { id: r.id, paymentId: r.payment_id, amount: r.amount, status: r.status };
  }

  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }) {
    return verifyHmacSha256(`${input.orderId}|${input.paymentId}`, this.keySecret, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    if (!this.webhookSecret) throw new IntegrationNotConfiguredError("Razorpay webhook secret");
    return verifyHmacSha256(rawBody, this.webhookSecret, signature);
  }
}

/** Used when keys are missing: every operation fails loudly. */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly isTestMode = true;
  readonly publicKey = "";
  private fail(): never {
    throw new IntegrationNotConfiguredError("Razorpay");
  }
  createOrder(): Promise<ProviderOrder> {
    return Promise.reject(new IntegrationNotConfiguredError("Razorpay"));
  }
  fetchPayment(): Promise<ProviderPayment> {
    return Promise.reject(new IntegrationNotConfiguredError("Razorpay"));
  }
  refund(): Promise<ProviderRefund> {
    return Promise.reject(new IntegrationNotConfiguredError("Razorpay"));
  }
  verifyPaymentSignature(): boolean {
    return this.fail();
  }
  verifyWebhookSignature(): boolean {
    return this.fail();
  }
}
