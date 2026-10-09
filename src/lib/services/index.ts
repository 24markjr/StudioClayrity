import "server-only";
import { NoopAnalytics, type AnalyticsProvider } from "./analytics";
import {
  DevLogEmailProvider,
  ResendEmailProvider,
  UnconfiguredEmailProvider,
  type EmailProvider,
} from "./email";
import { RazorpayProvider, UnconfiguredPaymentProvider, type PaymentProvider } from "./payment";
import { ManualShippingProvider, type ShippingProvider } from "./shipping";
import { CloudinaryStorage, UnconfiguredStorage, type StorageProvider } from "./storage";

export type Services = {
  payment: PaymentProvider;
  email: EmailProvider;
  storage: StorageProvider;
  shipping: ShippingProvider;
  analytics: AnalyticsProvider;
};

/**
 * Picks each integration from the environment. Real providers when keys exist; otherwise
 * a provider that fails loudly — except email in local/staging, which logs instead.
 */
export function selectServices(env: Record<string, string | undefined> = process.env): Services {
  const isProduction = env.APP_ENV === "production";

  const payment =
    env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
      ? new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET)
      : new UnconfiguredPaymentProvider();

  const email =
    env.RESEND_API_KEY && env.EMAIL_FROM
      ? new ResendEmailProvider(env.RESEND_API_KEY, `Studio Clayrity <${env.EMAIL_FROM}>`)
      : isProduction
        ? new UnconfiguredEmailProvider()
        : new DevLogEmailProvider();

  const storage =
    env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
      ? new CloudinaryStorage(
          env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
          env.CLOUDINARY_API_KEY,
          env.CLOUDINARY_API_SECRET,
        )
      : new UnconfiguredStorage();

  return {
    payment,
    email,
    storage,
    shipping: new ManualShippingProvider(),
    analytics: new NoopAnalytics(),
  };
}

let cached: Services | undefined;

export function getServices(): Services {
  cached ??= selectServices();
  return cached;
}
