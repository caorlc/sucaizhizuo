import { describe, it, expect } from "vitest";
import { buildFfmpegArgs } from "./video";

// buildFfmpegArgs 是纯函数，不需要 mock ffmpeg，可直接测试
describe("buildFfmpegArgs", () => {
  const INPUT = "/tmp/test.mp4";
  const OUTPUT = "/tmp/test.webm";
  const args = buildFfmpegArgs(INPUT, OUTPUT);

  it("包含 -y 强制覆盖标志", () => {
    expect(args).toContain("-y");
  });

  it("第一个 -i 参数后面紧跟 input 路径", () => {
    const iIdx = args.indexOf("-i");
    expect(iIdx).toBeGreaterThan(-1);
    expect(args[iIdx + 1]).toBe(INPUT);
  });

  it("使用 libvpx-vp9 视频编码器", () => {
    expect(args).toContain("libvpx-vp9");
  });

  it("CRF=32 + 目标码率 0（CRF 模式）", () => {
    const crfIdx = args.indexOf("-crf");
    expect(crfIdx).toBeGreaterThan(-1);
    expect(args[crfIdx + 1]).toBe("32");

    const bvIdx = args.indexOf("-b:v");
    expect(bvIdx).toBeGreaterThan(-1);
    expect(args[bvIdx + 1]).toBe("0");
  });

  it("使用 libopus 音频编码器，96k 码率", () => {
    expect(args).toContain("libopus");
    const baIdx = args.indexOf("-b:a");
    expect(baIdx).toBeGreaterThan(-1);
    expect(args[baIdx + 1]).toBe("96k");
  });

  it("最后一个参数是 output 路径", () => {
    expect(args[args.length - 1]).toBe(OUTPUT);
  });

  it("输入先于输出（i 在 output 之前）", () => {
    const iIdx = args.indexOf("-i");
    const outIdx = args.lastIndexOf(OUTPUT);
    expect(iIdx).toBeLessThan(outIdx);
  });
});
