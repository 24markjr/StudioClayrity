import { describe, expect, it } from "vitest";
import { cloudinaryUrl, isCloudinarySrc } from "./cloudinary";

describe("cloudinary", () => {
  it("detects prefixed sources", () => {
    expect(isCloudinarySrc("cld:products/a")).toBe(true);
    expect(isCloudinarySrc("/images/a.jpg")).toBe(false);
  });

  it("builds a width-limited, auto-format URL", () => {
    expect(cloudinaryUrl({ src: "cld:products/nero-bowl/01-hero", width: 828, cloudName: "demo" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_828/products/nero-bowl/01-hero",
    );
  });

  it("fails loudly without a cloud name", () => {
    expect(() => cloudinaryUrl({ src: "cld:x", width: 100, cloudName: "" })).toThrow(/CLOUDINARY/);
  });
});
