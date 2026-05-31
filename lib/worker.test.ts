import { describe, it, expect } from "vitest";
import { resolveImageSize } from "./worker";

describe("resolveImageSize", () => {
  it("maps aspect to nano-banana image_size", () => {
    expect(resolveImageSize("google/nano-banana-edit", "landscape")).toBe("16:9");
    expect(resolveImageSize("google/nano-banana-edit", "square")).toBe("1:1");
    expect(resolveImageSize("google/nano-banana-edit", "portrait")).toBe("9:16");
  });

  it("maps aspect to Seedream image_size vocabulary", () => {
    expect(resolveImageSize("bytedance/seedream-v4-edit", "landscape")).toBe("landscape_16_9");
    expect(resolveImageSize("bytedance/seedream-v4-edit", "square")).toBe("square_hd");
    expect(resolveImageSize("bytedance/seedream-v4-edit", "portrait")).toBe("portrait_16_9");
  });

  it("defaults an undefined aspect to square", () => {
    expect(resolveImageSize("google/nano-banana-edit", undefined)).toBe("1:1");
  });
});
