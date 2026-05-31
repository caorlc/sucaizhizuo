import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../kie", () => ({
  createTask: vi.fn(async () => "task-123"),
  pollTaskResult: vi.fn(async () => "https://result/img.png"),
}));

import { createTask, pollTaskResult } from "../kie";
import { kieProvider } from "./kie";

describe("kie provider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a task with mapped params then returns the polled url", async () => {
    const out = await kieProvider.generate({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrls: ["https://src/a.jpg"],
      size: "9:16",
    });
    expect(createTask).toHaveBeenCalledWith({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrl: "https://src/a.jpg",
      imageSize: "9:16",
    });
    expect(pollTaskResult).toHaveBeenCalledWith("task-123");
    expect(out.imageUrl).toBe("https://result/img.png");
  });

  it("passes a Seedream image_size string through to createTask unchanged", async () => {
    await kieProvider.generate({
      model: "bytedance/seedream-v4-edit",
      prompt: "edit it",
      imageUrls: ["https://src/b.jpg"],
      size: "landscape_16_9",
    });
    expect(createTask).toHaveBeenCalledWith({
      model: "bytedance/seedream-v4-edit",
      prompt: "edit it",
      imageUrl: "https://src/b.jpg",
      imageSize: "landscape_16_9",
    });
  });

  it("throws when no input image is provided (edit model needs one)", async () => {
    await expect(
      kieProvider.generate({ model: "m", prompt: "p", size: "1:1" })
    ).rejects.toThrow(/需要至少一张输入图/);
  });
});
