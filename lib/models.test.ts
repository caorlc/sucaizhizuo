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

  it("contains nano-banana-edit, seedream-v4-edit and gpt-image-2-image-to-image", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "google/nano-banana-edit",
      "bytedance/seedream-v4-edit",
      "gpt-image-2-image-to-image",
    ]);
  });

  it("registers gpt-image-2-image-to-image as a KIE edit model with aspect_ratio sizes", () => {
    const m = getModel("gpt-image-2-image-to-image");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
    expect(m.sizeParam("800x800")).toBe("1:1");
    expect(m.sizeParam("800x1200")).toBe("9:16");
    expect(m.sizeParam("1200x800")).toBe("16:9");
  });

  it("builds the GPT image input body (input_urls + aspect_ratio + resolution, no image_size)", () => {
    const input = getModel("gpt-image-2-image-to-image").buildInput({
      prompt: "p",
      imageUrls: ["https://src/x.jpg"],
      size: "16:9",
    });
    expect(input).toEqual({
      prompt: "p",
      input_urls: ["https://src/x.jpg"],
      aspect_ratio: "16:9",
      resolution: "1K",
    });
    expect(input.image_size).toBeUndefined();
  });

  it("builds the legacy edit input body for nano-banana (image_urls + image_size + output_format)", () => {
    const input = getModel("google/nano-banana-edit").buildInput({
      prompt: "p",
      imageUrls: ["https://src/y.jpg"],
      size: "9:16",
    });
    expect(input).toEqual({
      prompt: "p",
      image_urls: ["https://src/y.jpg"],
      output_format: "png",
      image_size: "9:16",
    });
  });

  it("throws a Chinese error on unknown model", () => {
    expect(() => getModel("nope")).toThrow(/未知模型/);
  });
});
