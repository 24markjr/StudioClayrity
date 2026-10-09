/**
 * Shipping boundary. Shiprocket (rates, serviceability, labels, tracking) is implemented in
 * Phase 7. Until then the manual provider is used: serviceability is "unknown" (checkout
 * falls back to the configured shipping rules) and tracking is entered by hand in the admin.
 */

export type Serviceability =
  | { status: "serviceable"; etaDays: { min: number; max: number } | null; codAvailable: boolean }
  | { status: "not_serviceable" }
  | { status: "unknown" };

export type ShipmentRequest = {
  orderRef: string;
  pickupPincode: string;
  deliveryPincode: string;
  weightG: number;
  dimensionsMm: { length: number; width: number; height: number };
  declaredValue: number;
  cod: boolean;
};

export type CreatedShipment = {
  providerShipmentId: string;
  carrier: string;
  awb: string;
  labelUrl: string | null;
};

export interface ShippingProvider {
  readonly name: string;
  /** Can this pincode receive a parcel of this weight? */
  checkServiceability(input: {
    deliveryPincode: string;
    weightG: number;
    cod: boolean;
  }): Promise<Serviceability>;
  /** Book a pickup and get an AWB. Manual provider: not supported. */
  createShipment(input: ShipmentRequest): Promise<CreatedShipment>;
  /** Public tracking URL for a carrier + AWB, if known */
  trackingUrl(carrier: string, awb: string): string | null;
}

export class ManualShippingProvider implements ShippingProvider {
  readonly name = "manual";

  async checkServiceability(): Promise<Serviceability> {
    return { status: "unknown" };
  }

  async createShipment(): Promise<CreatedShipment> {
    throw new Error("Automatic shipment booking is not available yet. Add the carrier and AWB manually.");
  }

  trackingUrl(): string | null {
    return null;
  }
}
