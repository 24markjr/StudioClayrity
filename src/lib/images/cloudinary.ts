/**
 * Cloudinary delivery helpers. Product images are stored as Cloudinary public IDs and
 * referenced in the app with a `cld:` prefix, e.g. `cld:products/nero-bowl/01-hero`.
 * Anything else (local `/images/...` or absolute URLs) goes through next/image as usual.
 */

export const CLOUDINARY_PREFIX = "cld:";

export function isCloudinarySrc(src: string) {
  return src.startsWith(CLOUDINARY_PREFIX);
}

export function cloudinaryUrl({
  src,
  width,
  quality,
  cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
}: {
  src: string;
  width: number;
  quality?: number;
  cloudName?: string;
}) {
  if (!cloudName) {
    throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set but a Cloudinary image was requested.");
  }
  const publicId = src.slice(CLOUDINARY_PREFIX.length).replace(/^\/+/, "");
  // f_auto → AVIF/WebP where supported; q_auto picks a perceptual quality; c_limit never upscales.
  const transforms = ["f_auto", quality ? `q_${quality}` : "q_auto", "c_limit", `w_${width}`].join(",");
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms}/${publicId}`;
}
