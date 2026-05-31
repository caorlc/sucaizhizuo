import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// kie.ts 在模块加载时读取 KIE_API_KEY，必须在 import 前用 vi.hoisted 设好
vi.hoisted(() => {
  process.env.KIE_API_KEY = "test-key";
});

import { createTask } from "./kie";

function mockFetchOk() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 200, msg: "success", data: { taskId: "t-1" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createTask request body per model", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("builds legacy edit body for nano-banana (image_urls + image_size)", async () => {
    const fetchMock = mockFetchOk();
    const taskId = await createTask({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrl: "https://src/a.jpg",
      imageSize: "9:16",
    });
    expect(taskId).toBe("t-1");
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("google/nano-banana-edit");
    expect(body.input).toEqual({
      prompt: "make a figure",
      image_urls: ["https://src/a.jpg"],
      output_format: "png",
      image_size: "9:16",
    });
  });

  it("builds GPT image body (input_urls + aspect_ratio + resolution, no image_size)", async () => {
    const fetchMock = mockFetchOk();
    await createTask({
      model: "gpt-image-2-image-to-image",
      prompt: "edit it",
      imageUrl: "https://src/b.jpg",
      imageSize: "16:9",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("gpt-image-2-image-to-image");
    expect(body.input).toEqual({
      prompt: "edit it",
      input_urls: ["https://src/b.jpg"],
      aspect_ratio: "16:9",
      resolution: "1K",
    });
    expect(body.input.image_size).toBeUndefined();
  });
});
