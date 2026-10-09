import { stateName } from "../domain/india";
import { ProviderError } from "./errors";

/**
 * Shipping boundary.
 *  - ShiprocketProvider: serviceability by PIN code, booking (order → AWB → label → pickup)
 *    and tracking, via Shiprocket's API.
 *  - ManualShippingProvider: used until Shiprocket credentials exist. Serviceability is
 *    "unknown" and the carrier + AWB are entered by hand.
 */

export type Serviceability =
  | {
      status: "serviceable";
      etaDays: { min: number; max: number } | null;
      codAvailable: boolean;
      courier: string | null;
    }
  | { status: "not_serviceable" }
  | { status: "unknown" };

export type ShipmentRequest = {
  orderRef: string;
  orderDate: Date;
  customer: {
    name: string;
    phone: string;
    email: string;
    line1: string;
    line2?: string | null;
    city: string;
    stateCode: string;
    pincode: string;
  };
  items: Array<{ name: string; sku: string; quantity: number; unitPrice: number }>;
  /** Paise */
  subtotal: number;
  weightG: number;
  dimensionsMm: { length: number; width: number; height: number };
  cod: boolean;
};

export type CreatedShipment = {
  providerShipmentId: string;
  carrier: string;
  awb: string;
  labelUrl: string | null;
  trackingUrl: string | null;
};

export interface ShippingProvider {
  readonly name: "shiprocket" | "manual";
  /** Can this PIN code receive a parcel of this weight? */
  checkServiceability(input: {
    deliveryPincode: string;
    weightG: number;
    cod: boolean;
  }): Promise<Serviceability>;
  /** Book the shipment with a courier and get an AWB. Manual provider: not supported. */
  createShipment(input: ShipmentRequest): Promise<CreatedShipment>;
  /** Public tracking page for an AWB, if one is known */
  trackingUrl(carrier: string | null, awb: string): string | null;
}

/* ---------- Tracking statuses ---------- */

export type ShipmentState =
  | "pending"
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

/**
 * Map a courier status text (as Shiprocket sends it, e.g. "OUT FOR DELIVERY") to our
 * shipment state. Unknown texts return null and are ignored rather than guessed.
 */
export function mapCourierStatus(raw: string | null | undefined): ShipmentState | null {
  const s = (raw ?? "").trim().toUpperCase().replace(/[_-]+/g, " ");
  if (!s) return null;
  if (s.startsWith("RTO") || s.includes("RETURN")) return "returned";
  if (s.includes("CANCEL")) return "cancelled";
  if (s === "DELIVERED") return "delivered";
  if (s.includes("OUT FOR DELIVERY")) return "out_for_delivery";
  if (s.includes("PICKED UP") || s === "PICKUP COMPLETE" || s === "SHIPPED") return "picked_up";
  if (
    s.includes("IN TRANSIT") ||
    s.includes("REACHED") ||
    s.includes("DESTINATION") ||
    s.includes("MISROUTED") ||
    s.includes("DELAYED")
  ) {
    return "in_transit";
  }
  if (s.includes("PICKUP") || s.includes("MANIFEST") || s.includes("AWB ASSIGNED") || s.includes("LABEL"))
    return "label_created";
  return null;
}

/** Rank so tracking updates only ever move a shipment forward. */
export const shipmentProgress: Record<ShipmentState, number> = {
  pending: 0,
  label_created: 1,
  picked_up: 2,
  in_transit: 3,
  out_for_delivery: 4,
  delivered: 5,
  returned: 5,
  cancelled: 5,
};

/** Well-known public tracking pages for manually entered shipments. */
const carrierTracking: Array<[RegExp, (awb: string) => string]> = [
  [/delhivery/i, (a) => `https://www.delhivery.com/track/package/${a}`],
  [/blue ?dart/i, (a) => `https://www.bluedart.com/tracking?trackFor=0&trackNo=${a}`],
  [/dtdc/i, (a) => `https://www.dtdc.in/tracking.asp?strCnno=${a}`],
  [
    /india ?post|speed ?post/i,
    () => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`,
  ],
];

export class ManualShippingProvider implements ShippingProvider {
  readonly name = "manual" as const;

  async checkServiceability(): Promise<Serviceability> {
    return { status: "unknown" };
  }

  async createShipment(): Promise<CreatedShipment> {
    throw new Error("Automatic booking isn't set up. Enter the carrier and AWB manually.");
  }

  trackingUrl(carrier: string | null, awb: string): string | null {
    const match = carrier ? carrierTracking.find(([re]) => re.test(carrier)) : undefined;
    return match ? match[1](encodeURIComponent(awb)) : null;
  }
}

/* ---------- Shiprocket ---------- */

const BASE = "https://apiv2.shiprocket.in/v1/external";

type Json = Record<string, unknown>;

/**
 * Shiprocket API client. Endpoints and fields follow Shiprocket's published API; responses
 * are read defensively. ⚠ Verify against the live account (sandbox or a real pickup) before
 * launch — see docs/SHIPPING.md.
 */
export class ShiprocketProvider implements ShippingProvider {
  readonly name = "shiprocket" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: {
      email: string;
      password: string;
      pickupLocation: string;
      pickupPincode: string;
    },
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async login() {
    const response = await this.fetchImpl(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new ProviderError("Shiprocket", response.status, text);
    const token = (JSON.parse(text) as { token?: string }).token;
    if (!token) throw new ProviderError("Shiprocket", response.status, "No token in login response");
    // Tokens last 10 days; refresh a day early
    this.token = { value: token, expiresAt: this.now() + 9 * 86_400_000 };
    return token;
  }

  private async request<T = Json>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
    retried = false,
  ): Promise<T> {
    const token = this.token && this.token.expiresAt > this.now() ? this.token.value : await this.login();
    const response = await this.fetchImpl(`${BASE}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.request(path, init, true);
    }
    const text = await response.text();
    if (!response.ok) throw new ProviderError("Shiprocket", response.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async checkServiceability(input: {
    deliveryPincode: string;
    weightG: number;
    cod: boolean;
  }): Promise<Serviceability> {
    const params = new URLSearchParams({
      pickup_postcode: this.config.pickupPincode,
      delivery_postcode: input.deliveryPincode,
      weight: String(Math.max(0.1, input.weightG / 1000)),
      cod: input.cod ? "1" : "0",
    });
    let body: { data?: { available_courier_companies?: Json[] } };
    try {
      body = await this.request(`/courier/serviceability/?${params}`, { method: "GET" });
    } catch (error) {
      // Shiprocket answers 404 when no courier serves the PIN code
      if (error instanceof ProviderError && (error.status === 404 || error.status === 422))
        return { status: "not_serviceable" };
      throw error;
    }
    const couriers = body.data?.available_courier_companies ?? [];
    if (couriers.length === 0) return { status: "not_serviceable" };
    const days = couriers
      .map((c) => Number(c.estimated_delivery_days))
      .filter((d) => Number.isFinite(d) && d > 0);
    return {
      status: "serviceable",
      etaDays: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
      codAvailable: couriers.some((c) => Number(c.cod) === 1),
      courier: typeof couriers[0].courier_name === "string" ? couriers[0].courier_name : null,
    };
  }

  async createShipment(input: ShipmentRequest): Promise<CreatedShipment> {
    const [first, ...rest] = input.customer.name.trim().split(/\s+/);
    const order = await this.request<{ order_id?: number; shipment_id?: number }>("/orders/create/adhoc", {
      method: "POST",
      body: {
        order_id: input.orderRef,
        order_date: input.orderDate.toISOString().slice(0, 16).replace("T", " "),
        pickup_location: this.config.pickupLocation,
        billing_customer_name: first,
        billing_last_name: rest.join(" "),
        billing_address: input.customer.line1,
        billing_address_2: input.customer.line2 ?? "",
        billing_city: input.customer.city,
        billing_pincode: input.customer.pincode,
        billing_state: stateName(input.customer.stateCode) ?? input.customer.stateCode,
        billing_country: "India",
        billing_email: input.customer.email,
        billing_phone: input.customer.phone,
        shipping_is_billing: true,
        order_items: input.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          units: i.quantity,
          selling_price: (i.unitPrice / 100).toFixed(2),
        })),
        payment_method: input.cod ? "COD" : "Prepaid",
        sub_total: (input.subtotal / 100).toFixed(2),
        length: Math.max(1, Math.ceil(input.dimensionsMm.length / 10)),
        breadth: Math.max(1, Math.ceil(input.dimensionsMm.width / 10)),
        height: Math.max(1, Math.ceil(input.dimensionsMm.height / 10)),
        weight: Math.max(0.1, input.weightG / 1000),
      },
    });
    const shipmentId = order.shipment_id;
    if (!shipmentId) throw new ProviderError("Shiprocket", 200, "No shipment_id in order response");

    const awb = await this.request<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(
      "/courier/assign/awb",
      { method: "POST", body: { shipment_id: shipmentId } },
    );
    const awbCode = awb.response?.data?.awb_code;
    if (!awbCode)
      throw new ProviderError(
        "Shiprocket",
        200,
        "No AWB assigned — check courier availability in Shiprocket",
      );
    const carrier = awb.response?.data?.courier_name ?? "Courier";

    let labelUrl: string | null = null;
    try {
      const label = await this.request<{ label_url?: string }>("/courier/generate/label", {
        method: "POST",
        body: { shipment_id: [shipmentId] },
      });
      labelUrl = label.label_url ?? null;
      await this.request("/courier/generate/pickup", { method: "POST", body: { shipment_id: [shipmentId] } });
    } catch {
      // The AWB is what matters; the label and pickup can be retried from Shiprocket
    }

    return {
      providerShipmentId: String(shipmentId),
      carrier,
      awb: awbCode,
      labelUrl,
      trackingUrl: this.trackingUrl(carrier, awbCode),
    };
  }

  trackingUrl(_carrier: string | null, awb: string) {
    return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
  }
}
