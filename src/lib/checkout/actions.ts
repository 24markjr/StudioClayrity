"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { findCart } from "../cart/service";
import { getDb } from "../db/client";
import { hashToken } from "../domain/identifiers";
import { isStateCode } from "../domain/india";
import { features } from "../features";
import { getServices } from "../services";
import { RazorpayProvider } from "../services/payment";
import { afterOrderConfirmed, afterPaymentOutcome } from "./effects";
import { buildQuote, checkoutReadiness, loadCheckoutSettings, type Quote, type Readiness } from "./quote";
import { checkoutSchema, fieldErrors, type CheckoutInput } from "./schema";
import * as service from "./service";

/** Checkout actions called from the browser. All pricing happens here, on the server. */

function deps(): service.CheckoutDeps {
  const payment = getServices().payment;
  return {
    payment,
    shipping: getServices().shipping,
    paymentsConfigured: payment instanceof RazorpayProvider,
    appEnv: process.env.APP_ENV,
  };
}

async function cartTokenHash() {
  const token = (await cookies()).get("sc_bag")?.value;
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? hashToken(token) : null;
}

export type QuoteResponse = { readiness: Readiness; quote: Quote | null };

const quoteParams = z.object({
  stateCode: z.string().refine(isStateCode).catch("29"),
  shippingMethod: z.enum(["standard", "express"]).catch("standard"),
  paymentMethod: z.enum(["razorpay", "cod"]).catch("razorpay"),
  email: z.email().optional().catch(undefined),
});

/** Live quote for the checkout summary (tax depends on the delivery state). */
export async function getCheckoutQuote(params: Partial<z.input<typeof quoteParams>>): Promise<QuoteResponse> {
  if (!features.checkout)
    return { readiness: { ready: false, reason: "Checkout isn't open yet." }, quote: null };
  const p = quoteParams.parse(params);
  const db = getDb();
  const settings = await loadCheckoutSettings(db);
  const d = deps();
  const readiness = checkoutReadiness(settings, {
    paymentsConfigured: d.paymentsConfigured,
    appEnv: d.appEnv,
  });
  const hash = await cartTokenHash();
  const cart = hash ? await findCart(db, hash) : null;
  if (!cart) return { readiness, quote: null };
  const quote = await buildQuote(db, cart, settings, {
    email: p.email,
    placeOfSupplyStateCode: p.stateCode,
    shippingMethod: p.shippingMethod,
    paymentMethod: p.paymentMethod,
  });
  return { readiness, quote };
}

export type SubmitResult =
  service.PlaceOrderResult | { kind: "invalid"; fieldErrors: Record<string, string>; message: string };

export async function submitCheckout(raw: CheckoutInput): Promise<SubmitResult> {
  if (!features.checkout) return { kind: "error", message: "Checkout isn't open yet." };
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      kind: "invalid",
      fieldErrors: fieldErrors(parsed.error),
      message: "Please check the highlighted details.",
    };
  }
  try {
    const result = await service.placeOrder(getDb(), deps(), {
      cartTokenHash: await cartTokenHash(),
      input: parsed.data,
    });
    if (result.kind === "confirmed") {
      await afterOrderConfirmed(result.orderId, []).catch((error) =>
        console.error("Order follow-up failed", error),
      );
    }
    return result;
  } catch (error) {
    console.error("Checkout failed", error);
    return {
      kind: "error",
      message: "Something went wrong placing your order. Nothing has been charged — please try again.",
    };
  }
}

const confirmInput = z.object({
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

/**
 * Called by the Razorpay modal's success handler. Never trusted on its own: the signature
 * is verified and Razorpay is asked for the payment status before anything is marked paid.
 */
export async function confirmPayment(raw: z.input<typeof confirmInput>) {
  const input = confirmInput.parse(raw);
  try {
    const outcome = await service.confirmClientPayment(getDb(), deps().payment, input);
    if (outcome.kind !== "invalid") await afterPaymentOutcome(outcome).catch(() => {});
    return { status: outcome.kind };
  } catch (error) {
    console.error("Payment confirmation failed", error);
    // The webhook will still confirm the payment; the order page shows the current state
    return { status: "pending" as const };
  }
}

const retryInput = z.object({
  orderRef: z.string().regex(/^SC-[A-Z0-9]{4,10}$/),
  accessToken: z.string().min(20).max(100),
});

export async function retryOrderPayment(raw: z.input<typeof retryInput>) {
  const parsed = retryInput.safeParse(raw);
  if (!parsed.success) return { kind: "error" as const, message: "We couldn't find that order." };
  return service.retryPayment(getDb(), deps(), parsed.data);
}
