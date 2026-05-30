import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { composeComparison } from "./postprocess";

async function solid(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer();
}

describe("composeComparison", () => {
  it("produces a 1200x800 webp from two source buffers", async () => {
    const before = await solid(400, 600);
    const after = await solid(400, 600);
    const out = await composeComparison(before, after);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);
  });
});
