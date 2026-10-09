import { createHash } from "node:crypto";
import { IntegrationNotConfiguredError } from "./errors";

/**
 * Image storage boundary (Cloudinary). The browser uploads straight to Cloudinary using a
 * short-lived signature from our server, so image bytes never pass through our functions
 * and the API secret never leaves the server.
 */

/**
 * Cloudinary request signature: parameters sorted by key, joined as k=v with "&",
 * followed by the API secret, then SHA-1. `file`, `api_key`, `resource_type` and
 * `cloud_name` are excluded, as are empty values.
 */
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const excluded = new Set(["file", "api_key", "resource_type", "cloud_name"]);
  const toSign = Object.keys(params)
    .filter((key) => !excluded.has(key) && params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

export type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string>;
};

export interface StorageProvider {
  readonly name: string;
  /** Parameters for one signed browser upload into `folder` */
  createSignedUpload(input: { folder: string; publicId?: string }): SignedUpload;
}

export class CloudinaryStorage implements StorageProvider {
  readonly name = "cloudinary";

  constructor(
    private readonly cloudName: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly now: () => number = Date.now,
  ) {}

  createSignedUpload(input: { folder: string; publicId?: string }): SignedUpload {
    if (!/^[a-z0-9/_-]+$/i.test(input.folder)) throw new RangeError("Invalid upload folder");
    const params: Record<string, string> = {
      folder: input.folder,
      timestamp: String(Math.floor(this.now() / 1000)),
      ...(input.publicId ? { public_id: input.publicId } : {}),
    };
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      fields: { ...params, api_key: this.apiKey, signature: signCloudinaryParams(params, this.apiSecret) },
    };
  }
}

export class UnconfiguredStorage implements StorageProvider {
  readonly name = "unconfigured";
  createSignedUpload(): SignedUpload {
    throw new IntegrationNotConfiguredError("Cloudinary");
  }
}
