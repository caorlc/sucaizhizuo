// 视频任务存储：run 元信息读写 + 成片 meta 读写 + 历史列表，模仿 storage.ts 风格
import path from "path";
import fs from "fs/promises";
import { slugify } from "./storage"; // 复用 storage.ts 的 slugify

// 视频生成模式（import = 从外部链接下载）
export type VideoMode = "t2v" | "i2v" | "import";

// 视频任务状态
export type VideoStatus = "pending" | "success" | "failed";

// 视频 run 记录（落在 runs/video/{runId}.json）
export interface VideoRunRecord {
  runId: string;
  mode: VideoMode;
  model: string;
  prompt: string;
  imageUrl?: string;        // 仅 i2v 时有值
  aspectRatio?: string;     // import 模式无此字段
  resolution?: string;      // import 模式无此字段
  duration?: number;        // import 模式无此字段
  name: string;             // slug 文件名基（不含扩展名）
  status: VideoStatus;
  mp4Url?: string;          // KIE 返回的原始 mp4 URL（仅 t2v/i2v）
  rawMp4Path?: string;      // 相对 output/ 的本地 mp4 路径（output/_videos/_raw/...）
  webmPath?: string;        // 相对 output/ 的成片 webm 路径（output/_videos/...）
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  // import 模式专用字段
  sourceUrl?: string;       // 原始视频 URL（如 X/YouTube/TikTok 链接）
  sourceTitle?: string;     // 从 yt-dlp 获取的视频标题
  maxHeight?: number;       // 限制清晰度上限（如 720、1080），不传则最佳清晰度
}

// 成片元信息（落在 output/_videos/{name}-{shortId}.json）
export interface VideoMeta {
  name: string;
  mode: VideoMode;
  model: string;
  prompt: string;
  imageUrl?: string;
  aspectRatio?: string;   // import 模式无此字段
  resolution?: string;    // import 模式无此字段
  duration?: number;      // import 模式无此字段
  webmPath: string;       // 相对 output/ 的 webm 路径
  createdAt: string;
  sourceUrl?: string;     // import 模式：原始视频来源 URL
}

// 视频历史列表条目
export interface VideoHistoryItem {
  name: string;
  webmPath: string;
  meta: VideoMeta;
}

// ---- 路径常量 ----
const RUNS_DIR = path.join(process.cwd(), "runs", "video");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEOS_DIR = path.join(OUTPUT_DIR, "_videos");
const RAW_DIR = path.join(VIDEOS_DIR, "_raw");

/**
 * 从 prompt 生成文件名 slug（取首行，空则回退）。
 * 与现有 worker.ts 风格保持一致。
 */
export function videoNameFromPrompt(prompt: string): string {
  const firstLine = (prompt ?? "").split("\n")[0].trim();
  if (firstLine.length > 0) {
    const slug = slugify(firstLine);
    if (slug) return slug;
  }
  return `video-${Date.now()}`;
}

/**
 * 取 runId 前 8 位作为短 ID，用于避免同名文件覆盖。
 */
export function shortId(runId: string): string {
  return runId.slice(0, 8);
}

/**
 * 获取原始 mp4 文件的相对路径（相对 output/）。
 */
export function rawMp4RelPath(name: string, runId: string): string {
  return `_videos/_raw/${name}-${shortId(runId)}.mp4`;
}

/**
 * 获取成片 webm 文件的相对路径（相对 output/）。
 */
export function webmRelPath(name: string, runId: string): string {
  return `_videos/${name}-${shortId(runId)}.webm`;
}

// ---- 串行写锁（防并发读改写竞态，模仿 storage.ts withRunLock）----
const videoRunWriteLocks = new Map<string, Promise<void>>();

function withVideoRunLock(runId: string, fn: () => Promise<void>): Promise<void> {
  const prev = videoRunWriteLocks.get(runId) ?? Promise.resolve();
  const next = prev.then(fn).catch(() => {
    // 确保锁链不因单次失败中断
  });
  videoRunWriteLocks.set(runId, next);
  return next;
}

// ---- VideoRunRecord CRUD ----

/** 写入新 run 记录 */
export async function saveVideoRun(record: VideoRunRecord): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(RUNS_DIR, `${record.runId}.json`),
    JSON.stringify(record, null, 2),
    "utf-8"
  );
}

/** 读取 run 记录，找不到抛中文错误 */
export async function getVideoRun(runId: string): Promise<VideoRunRecord> {
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as VideoRunRecord;
  } catch {
    throw new Error(`找不到视频运行记录：${runId}`);
  }
}

/** 更新 run 记录（串行写，防竞态） */
export async function updateVideoRun(
  runId: string,
  patch: Partial<VideoRunRecord>
): Promise<void> {
  return withVideoRunLock(runId, async () => {
    const record = await getVideoRun(runId);
    const updated = { ...record, ...patch };
    await fs.writeFile(
      path.join(RUNS_DIR, `${runId}.json`),
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
  });
}

// ---- VideoMeta 写入 ----

/** 保存成片元信息到 output/_videos/{filename}.json */
export async function saveVideoMeta(
  filename: string,
  meta: VideoMeta
): Promise<void> {
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(VIDEOS_DIR, `${filename}.json`),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );
}

// ---- 历史列表 ----

/**
 * 扫描 output/_videos/ 目录，列出所有 .webm + 同名 .json。
 * 按 createdAt 倒序，跳过 _raw 子目录和点开头文件。
 */
export async function listVideos(): Promise<VideoHistoryItem[]> {
  const items: VideoHistoryItem[] = [];

  let files: string[];
  try {
    files = await fs.readdir(VIDEOS_DIR);
  } catch {
    // 目录不存在时返回空列表
    return items;
  }

  for (const file of files) {
    // 跳过非 webm 文件、隐藏文件、_raw 目录
    if (!file.endsWith(".webm") || file.startsWith(".")) continue;

    const name = file.replace(/\.webm$/, "");
    const metaPath = path.join(VIDEOS_DIR, `${name}.json`);

    let meta: VideoMeta;
    try {
      const content = await fs.readFile(metaPath, "utf-8");
      meta = JSON.parse(content) as VideoMeta;
    } catch {
      // meta 文件不存在或损坏，跳过
      continue;
    }

    items.push({
      name,
      webmPath: `_videos/${file}`,
      meta,
    });
  }

  // 按 createdAt 倒序排列
  items.sort(
    (a, b) =>
      new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime()
  );

  return items;
}

// 导出绝对路径工具（供 worker / finalize 使用）
export { VIDEOS_DIR, RAW_DIR, OUTPUT_DIR as VIDEO_OUTPUT_DIR };
