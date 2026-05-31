import { describe, it, expect } from "vitest";
import { getModel, MODELS, DEFAULT_MODEL } from "./models";

describe("models registry", () => {
  it("has nano-banana-edit as the default KIE edit model", () => {
    const m = getModel(DEFAULT_MODEL);
    expect(m.id).toBe("google/nano-banana-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
  });

  it("maps business sizes to KIE image_size params", () => {
    const m = getModel(DEFAULT_MODEL);
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

  it("exposes the flux kontext models too", () => {
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-pro");
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-max");
  });

  it("throws a Chinese error on unknown model", () => {
    expect(() => getModel("nope")).toThrow(/未知模型/);
  });
});
