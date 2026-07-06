// yt-dlp 工具封装：参数构造 + 标题获取 + 视频下载
// 通过 child_process.spawn 调用系统命令（URL 作为独立 argv 元素，防注入）
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

// yt-dlp 可执行路径：优先读环境变量，否则假设已在 PATH 中
const YTDLP_BIN = process.env.YTDLP_PATH ?? "yt-dlp";

// 下载超时：10 分钟（视频可能较大）
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// 标题获取超时：30 秒
const TITLE_TIMEOUT_MS = 30 * 1000;

/**
 * 构造 yt-dlp 下载参数（纯函数，便于单元测试）。
 *
 * 格式选择策略：
 *   - 有 maxHeight 时：优先下载 ≤ maxHeight 的最佳视频 + 最佳音频，合并为 mp4
 *   - 无 maxHeight 时：下载最佳视频 + 最佳音频，合并为 mp4
 * --merge-output-format mp4 确保最终产物扩展名固定为 mp4
 * -o 模板使用 %(ext)s，结合 --merge-output-format，实际落盘为 ${outNoExt}.mp4
 */
export function buildYtdlpArgs(
  url: string,
  outNoExt: string,
  maxHeight?: number
): string[] {
  // 根据是否限制清晰度选择格式字符串
  const fmt =
    maxHeight !== undefined
      ? `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`
      : "bv*+ba/b";

  return [
    "--no-playlist",              // 禁止下载整个播放列表，只取单个视频
    "--socket-timeout", "30",     // 单连接读超时 30s（默认 20s，X 的 API 偶发慢）
    "--retries", "5",             // 下载失败重试 5 次
    "--fragment-retries", "5",    // HLS 分片失败重试 5 次
    "--extractor-retries", "3",   // 元信息提取（如 X 的 JSON API）重试 3 次
    "-f", fmt,                    // 格式选择
    "--merge-output-format", "mp4", // 合并输出固定为 mp4
    "-o", `${outNoExt}.%(ext)s`, // 输出路径模板（扩展名动态，但合并后固定 .mp4）
    url,                          // 视频 URL 作为独立参数（防 shell 注入）
  ];
}

/**
 * 获取视频标题（最多 80 字符）。
 * spawn yt-dlp --skip-download --print "%(title).80s"
 * 任何失败或超时（30s）均返回 null，不抛异常。
 */
export async function fetchVideoTitle(url: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const args = [
      "--no-playlist",
      "--socket-timeout", "30",   // 与下载一致，缓解 X API 偶发超时
      "--extractor-retries", "3", // 元信息提取重试 3 次
      "--skip-download",     // 不下载，只获取元信息
      "--print", "%(title).80s", // 输出视频标题（截断至 80 字符）
      url,
    ];

    const stdoutChunks: Buffer[] = [];
    let settled = false;

    // 超时保护：30 秒后 kill 并返回 null
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        resolve(null);
      }
    }, TITLE_TIMEOUT_MS);

    const proc = spawn(YTDLP_BIN, args, {
      stdio: ["ignore", "pipe", "ignore"], // 只捕获 stdout
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        resolve(null);
        return;
      }

      const title = Buffer.concat(stdoutChunks).toString("utf-8").trim();
      resolve(title || null);
    });

    proc.on("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve(null); // 找不到 yt-dlp 时也返回 null，不抛
      }
    });
  });
}

/**
 * 使用 yt-dlp 下载视频到本地，返回落盘后的绝对 mp4 路径。
 *
 * @param url       视频 URL（必须是 http/https）
 * @param outNoExt  输出路径不含扩展名（绝对路径），最终产物为 ${outNoExt}.mp4
 * @param maxHeight 可选最大高度（如 720、1080），超过则选次优清晰度
 * @returns         下载完成后的绝对 mp4 路径
 */
export async function downloadVideo(
  url: string,
  outNoExt: string,
  maxHeight?: number
): Promise<string> {
  // 确保输出目录存在
  await fs.mkdir(path.dirname(outNoExt), { recursive: true });

  const args = buildYtdlpArgs(url, outNoExt, maxHeight);

  return new Promise<string>((resolve, reject) => {
    const stderrChunks: Buffer[] = [];
    let settled = false;

    // 超时保护：10 分钟后 kill 进程
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error("yt-dlp 下载超时（超过 10 分钟），已强制终止进程"));
      }
    }, DOWNLOAD_TIMEOUT_MS);

    const proc = spawn(YTDLP_BIN, args, {
      stdio: ["ignore", "ignore", "pipe"], // 只捕获 stderr（进度信息）
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code === 0) {
        // 成功，返回固定 .mp4 路径
        resolve(`${outNoExt}.mp4`);
        return;
      }

      // 非零退出码，从 stderr 提取错误摘要
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const tail = stderr.slice(-500).trim();
      reject(
        new Error(
          `yt-dlp 下载失败（退出码 ${code}）：${tail || "（无 stderr 输出）"}`
        )
      );
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `未检测到 yt-dlp 或启动失败：${err.message}（请确认已安装 yt-dlp）`
          )
        );
      }
    });
  });
}
