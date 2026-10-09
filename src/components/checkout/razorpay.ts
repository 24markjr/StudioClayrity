/**
 * Loads Razorpay Checkout on demand (only when the shopper pays) and opens the modal.
 * The browser never decides that an order is paid — the handler only passes Razorpay's
 * signed response to the server for verification.
 */

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayFailure = { error: { description?: string; reason?: string } };

type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: RazorpayFailure) => void): void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay unavailable"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load Razorpay"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type LaunchParams = {
  keyId: string;
  providerOrderId: string;
  amount: number;
  orderRef: string;
  prefill: { name: string; email: string; contact: string };
};

export async function openRazorpay(
  launch: LaunchParams,
  callbacks: {
    onSuccess: (response: { providerOrderId: string; providerPaymentId: string; signature: string }) => void;
    onDismiss: () => void;
    onFailure: (message: string) => void;
  },
) {
  const Razorpay = await loadRazorpay();
  const instance = new Razorpay({
    key: launch.keyId,
    order_id: launch.providerOrderId,
    amount: launch.amount,
    currency: "INR",
    name: "Studio Clayrity",
    description: `Order ${launch.orderRef}`,
    prefill: launch.prefill,
    notes: { order_ref: launch.orderRef },
    theme: { color: "#272622" },
    handler: (r: RazorpayResponse) =>
      callbacks.onSuccess({
        providerOrderId: r.razorpay_order_id,
        providerPaymentId: r.razorpay_payment_id,
        signature: r.razorpay_signature,
      }),
    modal: { ondismiss: callbacks.onDismiss, confirm_close: true },
  });
  instance.on("payment.failed", (r) =>
    callbacks.onFailure(r.error.description ?? "The payment didn't go through."),
  );
  instance.open();
}
