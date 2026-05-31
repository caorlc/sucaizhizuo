import { describe, it, expect } from "vitest";
import { getModel, MODELS } from "./models";

describe("models registry", () => {
  it("has nano-banana-edit as a KIE edit model", () => {
    const m = getModel("google/nano-banana-edit");
    expect(m.id).toBe("google/nano-banana-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
  });

  it("maps business sizes to nano-banana KIE image_size params", () => {
    const m = getModel("google/nano-banana-edit");
    expect(m.sizeParam("800x800")).toBe("1:1");
    expect(m.sizeParam("800x1200")).toBe("9:16");
    expect(m.sizeParam("1200x800")).toBe("16:9");
  });

  it("registers seedream-v4-edit with Seedream image_size vocabulary", () => {
    const m = getModel("bytedance/seedream-v4-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
    expect(m.sizeParam("800x800")).toBe("square_hd");
    expect(m.sizeParam("800x1200")).toBe("portrait_16_9");
    expect(m.sizeParam("1200x800")).toBe("landscape_16_9");
  });

  it("contains exactly nano-banana-edit and seedream-v4-edit", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "google/nano-banana-edit",
      "bytedance/seedream-v4-edit",
    ]);
  });

  it("throws a Chinese error on unknown model", () => {
    expect(() => getModel("nope")).toThrow(/未知模型/);
  });
});
