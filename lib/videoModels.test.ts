import { describe, it, expect } from "vitest";
import {
  VIDEO_MODELS,
  VIDEO_ASPECTS,
  VIDEO_RESOLUTIONS,
  getVideoModel,
  getVideoModelByMode,
} from "./videoModels";

describe("videoModels 注册表", () => {
  it("包含两个模型：t2v 和 i2v", () => {
    expect(VIDEO_MODELS.map((m) => m.id)).toEqual([
      "grok-imagine/text-to-video",
      "grok-imagine/image-to-video",
    ]);
  });

  it("VIDEO_ASPECTS 包含所有五种比例", () => {
    expect(VIDEO_ASPECTS).toEqual(["2:3", "3:2", "1:1", "16:9", "9:16"]);
  });

  it("VIDEO_RESOLUTIONS 包含 480p 和 720p", () => {
    expect(VIDEO_RESOLUTIONS).toEqual(["480p", "720p"]);
  });

  describe("getVideoModel", () => {
    it("按 id 取到 t2v 模型", () => {
      const m = getVideoModel("grok-imagine/text-to-video");
      expect(m.id).toBe("grok-imagine/text-to-video");
      expect(m.kind).toBe("t2v");
      expect(m.label).toBeTruthy();
    });

    it("按 id 取到 i2v 模型", () => {
      const m = getVideoModel("grok-imagine/image-to-video");
      expect(m.id).toBe("grok-imagine/image-to-video");
      expect(m.kind).toBe("i2v");
    });

    it("未知 id 抛中文错误", () => {
      expect(() => getVideoModel("unknown/model")).toThrow(/未知视频模型/);
    });
  });

  describe("getVideoModelByMode", () => {
    it("mode=t2v 返回文生视频模型", () => {
      const m = getVideoModelByMode("t2v");
      expect(m.kind).toBe("t2v");
    });

    it("mode=i2v 返回图生视频模型", () => {
      const m = getVideoModelByMode("i2v");
      expect(m.kind).toBe("i2v");
    });
  });

  describe("t2v buildInput", () => {
    const t2v = getVideoModel("grok-imagine/text-to-video");
    const args = {
      prompt: "a cat walking on moonlit road",
      aspectRatio: "16:9" as const,
      resolution: "480p" as const,
      duration: 10,
    };

    it("包含 prompt / aspect_ratio / resolution / duration", () => {
      const input = t2v.buildInput(args);
      expect(input.prompt).toBe("a cat walking on moonlit road");
      expect(input.aspect_ratio).toBe("16:9");
      expect(input.resolution).toBe("480p");
      expect(input.duration).toBe(10);
    });

    it("mode 固定为 normal", () => {
      const input = t2v.buildInput(args);
      expect(input.mode).toBe("normal");
    });

    it("不包含 image_urls 字段", () => {
      const input = t2v.buildInput(args);
      expect(input.image_urls).toBeUndefined();
    });
  });

  describe("i2v buildInput", () => {
    const i2v = getVideoModel("grok-imagine/image-to-video");
    const args = {
      prompt: "slow zoom in",
      imageUrls: ["https://example.com/photo.jpg"],
      aspectRatio: "9:16" as const,
      resolution: "720p" as const,
      duration: 6,
    };

    it("包含 image_urls 数组", () => {
      const input = i2v.buildInput(args);
      expect(input.image_urls).toEqual(["https://example.com/photo.jpg"]);
    });

    it("包含 prompt / aspect_ratio / resolution / duration", () => {
      const input = i2v.buildInput(args);
      expect(input.prompt).toBe("slow zoom in");
      expect(input.aspect_ratio).toBe("9:16");
      expect(input.resolution).toBe("720p");
      expect(input.duration).toBe(6);
    });

    it("mode 固定为 normal，不暴露 spicy", () => {
      const input = i2v.buildInput(args);
      expect(input.mode).toBe("normal");
    });

    it("imageUrls 为空时 image_urls 为空数组", () => {
      const input = i2v.buildInput({
        prompt: "p",
        imageUrls: undefined,
        aspectRatio: "1:1",
        resolution: "480p",
        duration: 6,
      });
      expect(input.image_urls).toEqual([]);
    });
  });
});
