"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { confirmPayment, retryOrderPayment } from "@/lib/checkout/actions";
import { openRazorpay } from "./razorpay";

/** While a payment is being confirmed, re-check every few seconds (up to ~1 minute). */
export function PendingRefresher() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (attempts >= 20) return;
    const timer = window.setTimeout(() => {
      router.refresh();
      setAttempts((a) => a + 1);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [attempts, router]);
  if (attempts < 20) return null;
  return (
    <p className="type-small text-stone mt-4">
      This is taking longer than usual. If money has left your account, your order will be confirmed by email
      shortly — you don&apos;t need to pay again.
    </p>
  );
}

export function RetryPayment({ orderRef, accessToken }: { orderRef: string; accessToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const launch = await retryOrderPayment({ orderRef, accessToken }).catch(() => null);
    if (!launch || launch.kind === "error") {
      setBusy(false);
      setError(launch?.message ?? "We couldn't reopen the payment. Please try again.");
      return;
    }
    try {
      await openRazorpay(launch, {
        onSuccess: async (response) => {
          await confirmPayment(response).catch(() => {});
          router.refresh();
        },
        onDismiss: () => setBusy(false),
        onFailure: (message) => setError(message),
      });
    } catch {
      setBusy(false);
      setError("The payment window couldn't load. Check your connection and try again.");
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <Button onClick={retry} loading={busy} size="lg">
        Try payment again
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
