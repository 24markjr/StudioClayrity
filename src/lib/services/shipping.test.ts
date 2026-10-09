import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./errors";
import {
  ManualShippingProvider,
  mapCourierStatus,
  ShiprocketProvider,
  type ShipmentRequest,
} from "./shipping";

describe("mapCourierStatus", () => {
  it.each([
    ["DELIVERED", "delivered"],
    ["OUT FOR DELIVERY", "out_for_delivery"],
    ["Out_For_Delivery", "out_for_delivery"],
    ["PICKED UP", "picked_up"],
    ["IN TRANSIT", "in_transit"],
    ["REACHED AT DESTINATION HUB", "in_transit"],
    ["PICKUP SCHEDULED", "label_created"],
    ["AWB ASSIGNED", "label_created"],
    ["RTO INITIATED", "returned"],
    ["CANCELED", "cancelled"],
  ])("%s → %s", (raw, state) => {
    expect(mapCourierStatus(raw)).toBe(state);
  });

  it("ignores unknown or empty statuses rather than guessing", () => {
    expect(mapCourierStatus("SOMETHING NEW")).toBeNull();
    expect(mapCourierStatus("")).toBeNull();
    expect(mapCourierStatus(undefined)).toBeNull();
  });
});

describe("ManualShippingProvider", () => {
  it("knows tracking pages for common couriers only", () => {
    const manual = new ManualShippingProvider();
    expect(manual.trackingUrl("Delhivery Surface", "123 45")).toBe(
      "https://www.delhivery.com/track/package/123%2045",
    );
    expect(manual.trackingUrl("Some Local Courier", "1")).toBeNull();
  });

  it("can't book shipments", async () => {
    await expect(new ManualShippingProvider().createShipment()).rejects.toThrow(/manually/);
  });
});

function fakeShiprocket(options: { serviceability?: Response; expireTokenOnce?: boolean } = {}) {
  let tokenRejected = false;
  const calls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const path = url.replace("https://apiv2.shiprocket.in/v1/external", "");
    calls.push(`${init?.method} ${path.split("?")[0]}`);
    if (path === "/auth/login") return Response.json({ token: `tok_${calls.length}` });
    if (options.expireTokenOnce && !tokenRejected) {
      tokenRejected = true;
      return new Response("expired", { status: 401 });
    }
    if (path.startsWith("/courier/serviceability/")) {
      return (
        options.serviceability ??
        Response.json({
          data: {
            available_courier_companies: [
              { courier_name: "Delhivery Surface", estimated_delivery_days: "5", cod: 1 },
              { courier_name: "Blue Dart Air", estimated_delivery_days: "2", cod: 0 },
            ],
          },
        })
      );
    }
    if (path === "/orders/create/adhoc")
      return Response.json({ order_id: 111, shipment_id: 222, status: "NEW" });
    if (path === "/courier/assign/awb") {
      return Response.json({ response: { data: { awb_code: "AWB123", courier_name: "Delhivery Surface" } } });
    }
    if (path === "/courier/generate/label")
      return Response.json({ label_url: "https://labels.example/222.pdf" });
    if (path === "/courier/generate/pickup") return Response.json({ pickup_status: 1 });
    return new Response("not found", { status: 404 });
  });
  const provider = new ShiprocketProvider(
    { email: "api@studio.test", password: "secret", pickupLocation: "Studio", pickupPincode: "560001" },
    fetchImpl,
  );
  return { provider, fetchImpl, calls };
}

const request: ShipmentRequest = {
  orderRef: "SC-7K3Q9X",
  orderDate: new Date("2026-10-09T10:00:00Z"),
  customer: {
    name: "Ananya Rao",
    phone: "9876543210",
    email: "a@example.com",
    line1: "12 Lavelle Road",
    city: "Mumbai",
    stateCode: "27",
    pincode: "400001",
  },
  items: [{ name: "Travertine Tray", sku: "T-L", quantity: 1, unitPrice: 850_000 }],
  subtotal: 850_000,
  weightG: 4500,
  dimensionsMm: { length: 480, width: 330, height: 100 },
  cod: false,
};

describe("ShiprocketProvider", () => {
  it("reports serviceability with the delivery-time range and COD support", async () => {
    const { provider, fetchImpl } = fakeShiprocket();
    expect(
      await provider.checkServiceability({ deliveryPincode: "400001", weightG: 4500, cod: false }),
    ).toEqual({
      status: "serviceable",
      etaDays: { min: 2, max: 5 },
      codAvailable: true,
      courier: "Delhivery Surface",
    });
    const url = String(fetchImpl.mock.calls[1][0]);
    expect(url).toContain("pickup_postcode=560001");
    expect(url).toContain("delivery_postcode=400001");
    expect(url).toContain("weight=4.5");
  });

  it("treats Shiprocket's 404 as not serviceable", async () => {
    const { provider } = fakeShiprocket({
      serviceability: new Response('{"message":"no couriers"}', { status: 404 }),
    });
    expect(
      await provider.checkServiceability({ deliveryPincode: "999999", weightG: 100, cod: false }),
    ).toEqual({
      status: "not_serviceable",
    });
  });

  it("logs in once and reuses the token", async () => {
    const { provider, calls } = fakeShiprocket();
    await provider.checkServiceability({ deliveryPincode: "400001", weightG: 100, cod: false });
    await provider.checkServiceability({ deliveryPincode: "400002", weightG: 100, cod: false });
    expect(calls.filter((c) => c.endsWith("/auth/login"))).toHaveLength(1);
  });

  it("logs in again when the token is rejected", async () => {
    const { provider, calls } = fakeShiprocket({ expireTokenOnce: true });
    await provider.checkServiceability({ deliveryPincode: "400001", weightG: 100, cod: false });
    expect(calls.filter((c) => c.endsWith("/auth/login"))).toHaveLength(2);
  });

  it("books a shipment: order → AWB → label → pickup", async () => {
    const { provider, calls, fetchImpl } = fakeShiprocket();
    expect(await provider.createShipment(request)).toEqual({
      providerShipmentId: "222",
      carrier: "Delhivery Surface",
      awb: "AWB123",
      labelUrl: "https://labels.example/222.pdf",
      trackingUrl: "https://shiprocket.co/tracking/AWB123",
    });
    expect(calls.slice(1)).toEqual([
      "POST /orders/create/adhoc",
      "POST /courier/assign/awb",
      "POST /courier/generate/label",
      "POST /courier/generate/pickup",
    ]);
    const body = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      order_id: "SC-7K3Q9X",
      pickup_location: "Studio",
      billing_customer_name: "Ananya",
      billing_last_name: "Rao",
      billing_state: "Maharashtra",
      payment_method: "Prepaid",
      sub_total: "8500.00",
      length: 48,
      breadth: 33,
      height: 10,
      weight: 4.5,
    });
  });

  it("surfaces API failures as ProviderError", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("bad credentials", { status: 403 }));
    const provider = new ShiprocketProvider(
      { email: "x", password: "y", pickupLocation: "p", pickupPincode: "560001" },
      fetchImpl,
    );
    await expect(
      provider.checkServiceability({ deliveryPincode: "400001", weightG: 1, cod: false }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
