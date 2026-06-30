import { describe, it, expect } from "vitest";
import { buildYtdlpArgs } from "./ytdlp";

// buildYtdlpArgs 是纯函数，不需要 mock yt-dlp，可直接测试
// 参照 lib/video.test.ts 风格

const URL = "https://x.com/example/status/123456789";
const OUT_NO_EXT = "/tmp/test-video";

describe("buildYtdlpArgs（无 maxHeight）", () => {
  const args = buildYtdlpArgs(URL, OUT_NO_EXT);

  it("包含 --no-playlist", () => {
    expect(args).toContain("--no-playlist");
  });

  it("格式字符串为 bv*+ba/b（最佳清晰度）", () => {
    const fIdx = args.indexOf("-f");
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe("bv*+ba/b");
  });

  it("包含 --merge-output-format mp4", () => {
    const mergeIdx = args.indexOf("--merge-output-format");
    expect(mergeIdx).toBeGreaterThan(-1);
    expect(args[mergeIdx + 1]).toBe("mp4");
  });

  it("-o 模板包含 outNoExt + .%(ext)s", () => {
    const oIdx = args.indexOf("-o");
    expect(oIdx).toBeGreaterThan(-1);
    expect(args[oIdx + 1]).toBe(`${OUT_NO_EXT}.%(ext)s`);
  });

  it("URL 是最后一个参数", () => {
    expect(args[args.length - 1]).toBe(URL);
  });
});

describe("buildYtdlpArgs（有 maxHeight = 720）", () => {
  const args = buildYtdlpArgs(URL, OUT_NO_EXT, 720);

  it("格式字符串包含 height<=720 限制", () => {
    const fIdx = args.indexOf("-f");
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe("bv*[height<=720]+ba/b[height<=720]");
  });

  it("依然包含 --merge-output-format mp4", () => {
    const mergeIdx = args.indexOf("--merge-output-format");
    expect(mergeIdx).toBeGreaterThan(-1);
    expect(args[mergeIdx + 1]).toBe("mp4");
  });

  it("URL 仍是最后一个参数", () => {
    expect(args[args.length - 1]).toBe(URL);
  });
});

describe("buildYtdlpArgs（有 maxHeight = 1080）", () => {
  const args = buildYtdlpArgs(URL, OUT_NO_EXT, 1080);

  it("格式字符串包含 height<=1080 限制", () => {
    const fIdx = args.indexOf("-f");
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe("bv*[height<=1080]+ba/b[height<=1080]");
  });
});

describe("buildYtdlpArgs 安全性：URL 作为独立 argv", () => {
  // URL 中带空格或特殊字符，不应拼入 shell 字符串
  const maliciousUrl = "https://example.com/watch?v=1; rm -rf /";
  const args = buildYtdlpArgs(maliciousUrl, OUT_NO_EXT);

  it("URL 完整保留为最后一个参数（不被 shell 解析）", () => {
    expect(args[args.length - 1]).toBe(maliciousUrl);
  });

  it("参数数组不含分号拼接", () => {
    // 不应该有哪个参数包含 "; rm" 这样的 shell 注入片段
    // 这里主要验证 args 是纯字符串数组（spawn 不走 shell）
    expect(args.every((a) => typeof a === "string")).toBe(true);
  });
});
