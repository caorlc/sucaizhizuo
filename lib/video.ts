// 视频工具：ffmpeg 参数构造 + mp4 下载 + mp4→webm 转码
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

// ffmpeg 可执行路径：优先 PATH，本机 /opt/homebrew/bin/ffmpeg 已确认带 libvpx-vp9 + libopus
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";

/**
 * 构造 ffmpeg 转码参数（纯函数，便于单元测试）。
 * 编码策略：VP9 CRF 模式（无目标码率）+ libopus 音频 96k。
 */
export function buildFfmpegArgs(input: string, output: string): string[] {
  return [
    "-y",          // 强制覆盖输出文件，不提示
    "-i", input,   // 输入文件
    "-c:v", "libvpx-vp9",  // 视频编码器 VP9
    "-crf", "32",          // 质量系数（0=最佳，63=最差），32 为合理折中
    "-b:v", "0",           // CRF 模式要求目标码率设为 0
    "-row-mt", "1",        // 启用行级多线程，提高编码速度
    "-deadline", "good",   // 编码速度/质量平衡
    "-cpu-used", "2",      // CPU 使用级别（0=最慢最好，5=最快较差）
    "-pix_fmt", "yuv420p", // 像素格式，兼容性最佳
    "-c:a", "libopus",     // 音频编码器 Opus
    "-b:a", "96k",         // 音频码率 96kbps
    output,
  ];
}

/**
 * 从远程 URL 下载文件并写入本地路径。
 * 失败时抛出中文错误信息。
 */
export async function downloadToFile(url: string, outPath: string): Promise<void> {
  // 确保目标目录存在
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载视频失败：${url}，HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

/**
 * 调用系统 ffmpeg 将 mp4 转为 webm（VP9 + Opus）。
 * 非零退出码时 reject，错误信息包含 stderr 末尾内容。
 */
export async function convertMp4ToWebm(
  mp4Path: string,
  webmPath: string
): Promise<void> {
  // 确保输出目录存在
  await fs.mkdir(path.dirname(webmPath), { recursive: true });

  const args = buildFfmpegArgs(mp4Path, webmPath);

  return new Promise<void>((resolve, reject) => {
    // 收集 stderr 用于错误报告（ffmpeg 进度信息均输出到 stderr）
    const stderrChunks: Buffer[] = [];

    const proc = spawn(FFMPEG_BIN, args, {
      stdio: ["ignore", "ignore", "pipe"], // 只捕获 stderr
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // 取 stderr 末尾 500 字符作为错误摘要
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const tail = stderr.slice(-500).trim();
      reject(
        new Error(
          `ffmpeg 转码失败（退出码 ${code}）：${tail || "（无 stderr 输出）"}`
        )
      );
    });

    proc.on("error", (err) => {
      reject(new Error(`启动 ffmpeg 失败：${err.message}（请确认已安装 ffmpeg）`));
    });
  });
}
