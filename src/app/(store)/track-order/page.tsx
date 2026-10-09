import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/store/page-header";
import { TrackOrderForm } from "@/components/store/track-order-form";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your Studio Clayrity order.",
  alternates: { canonical: "/track-order" },
};

async function Form({ searchParams }: Pick<PageProps<"/track-order">, "searchParams">) {
  const ref = (await searchParams).ref;
  const value = (Array.isArray(ref) ? ref[0] : ref) ?? "";
  return <TrackOrderForm defaultRef={/^SC-[A-Z0-9]{4,10}$/i.test(value) ? value.toUpperCase() : ""} />;
}

export default function TrackOrderPage({ searchParams }: PageProps<"/track-order">) {
  return (
    <div className="container-page pb-section-md">
      <PageHeader
        title="Track your order"
        intro="Enter your order number and the email or mobile number you used at checkout."
        crumbs={[{ label: "Home", href: "/" }, { label: "Track your order" }]}
      />
      <Suspense fallback={<TrackOrderForm defaultRef="" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
