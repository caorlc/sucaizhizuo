// 文件存储：slug 生成、run 元信息读写、output 元信息读写
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import type { UnsplashAttribution } from "./unsplash";
import type { Aspect } from "./aspect";

export type CandidateStatus = "pending" | "success" | "failed";

export interface CandidateRecord {
  index: number;            // 0-based 在 run 内的位置
  name: string;             // slug 化的文件名
  prompt: string;           // 完整 prompt 文本
  keywordOverride?: string; // 段内 keyword: xxx 行（可选）
  keywordUsed?: string;     // 实际用的 keyword（生成时填）
  source?: UnsplashAttribution;
  candidatePath?: string;   // 候选 webp 相对路径，相对 output/ 根
  status: CandidateStatus;
  error?: string;           // failed 时的中文错误信息
  startedAt?: string;
  completedAt?: string;
}

export interface RunRecord {
  runId: string;
  landing: string;         // slug 化
  model: string;
  globalKeyword: string;   // 全局源图主题，必填
  aspect: Aspect;          // 输出比例（横/方/竖）
  candidates: CandidateRecord[];
  createdAt: string;
}

export interface OutputMeta {
  landing: string;
  name: string;
  prompt: string;
  model: string;
  keyword?: string;
  aspect?: Aspect;
  source: UnsplashAttribution;
  createdAt: string;
}

export interface HistoryItem {
  landing: string;
  name: string;
  webpPath: string; // 相对路径，用于 /api/image 服务
  meta: OutputMeta;
}

const RUNS_DIR = path.join(process.cwd(), "runs");
const OUTPUT_DIR = path.join(process.cwd(), "output");

// 解析逗号分隔的多主题字符串：支持英文逗号、中文逗号、顿号、分号
export function parseKeywords(text: string): string[] {
  return text
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 从多主题中随机选一个
export function pickRandomKeyword(text: string): string {
  const list = parseKeywords(text);
  if (list.length === 0) return text.trim();
  return list[Math.floor(Math.random() * list.length)];
}

// 把任意字符串转成 URL 友好的 slug
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// 从 prompt 自动提取文件名（取第一行）
export function nameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0].trim();
  if (firstLine.length > 0) {
    return slugify(firstLine) || slugify(prompt.split(/\s+/).slice(0, 5).join(" "));
  }
  const words = prompt
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return slugify(words.join(" ")) || "untitled";
}

/**
 * 解析批量 prompt 文本
 * - 用 \n---\n 分隔（容忍前后空格）
 * - 每段第一行作为 name（slugify 后；同名加 -2/-3 后缀）
 * - 段内匹配 ^keyword:\s*(.+)$ 的行提取为 keywordOverride 并从 prompt 中移除
 * - 空段忽略
 */
export function parsePromptsText(
  text: string
): { name: string; prompt: string; keywordOverride?: string }[] {
  const segments = text.split(/\n\s*---\s*\n/);
  const results: { name: string; prompt: string; keywordOverride?: string }[] = [];
  const nameCount: Record<string, number> = {};

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    let keywordOverride: string | undefined;

    // 过滤掉 keyword: xxx 行，提取 keyword
    const filteredLines: string[] = [];
    for (const line of lines) {
      const kwMatch = line.match(/^keyword:\s*(.+)$/i);
      if (kwMatch) {
        keywordOverride = kwMatch[1].trim();
      } else {
        filteredLines.push(line);
      }
    }

    const promptText = filteredLines.join("\n").trim();
    if (!promptText) continue;

    // 第一行作为名称
    const firstLine = filteredLines[0]?.trim() ?? "";
    let baseName = slugify(firstLine) || "untitled";

    // 处理重名
    if (!nameCount[baseName]) {
      nameCount[baseName] = 1;
    } else {
      nameCount[baseName]++;
      baseName = `${baseName}-${nameCount[baseName]}`;
    }

    const entry: { name: string; prompt: string; keywordOverride?: string } = {
      name: baseName,
      prompt: promptText,
    };
    if (keywordOverride) {
      entry.keywordOverride = keywordOverride;
    }
    results.push(entry);
  }

  return results;
}

// 用于序列化写操作，避免并发读改写竞态
const runWriteLocks = new Map<string, Promise<void>>();

function withRunLock(runId: string, fn: () => Promise<void>): Promise<void> {
  const prev = runWriteLocks.get(runId) ?? Promise.resolve();
  const next = prev.then(fn).catch(() => {
    // 确保 lock 链不因一次失败而断掉
  });
  runWriteLocks.set(runId, next);
  return next;
}

export async function saveRun(record: RunRecord): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(RUNS_DIR, `${record.runId}.json`),
    JSON.stringify(record, null, 2),
    "utf-8"
  );
}

export async function getRun(runId: string): Promise<RunRecord> {
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as RunRecord;
  } catch {
    throw new Error(`找不到运行记录：${runId}`);
  }
}

export async function updateCandidate(
  runId: string,
  index: number,
  patch: Partial<CandidateRecord>
): Promise<void> {
  return withRunLock(runId, async () => {
    const run = await getRun(runId);
    const candidate = run.candidates[index];
    if (!candidate) {
      throw new Error(`找不到候选 index=${index}`);
    }
    run.candidates[index] = { ...candidate, ...patch };
    await fs.writeFile(
      path.join(RUNS_DIR, `${runId}.json`),
      JSON.stringify(run, null, 2),
      "utf-8"
    );
  });
}

export async function saveOutputMeta(
  landing: string,
  name: string,
  meta: OutputMeta
): Promise<void> {
  const dir = path.join(OUTPUT_DIR, landing);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${name}.json`),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );
}

// 扫描 output/ 目录，列出所有 {landing}/{name}.webp
export async function listHistory(): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];

  let landings: string[];
  try {
    landings = await fs.readdir(OUTPUT_DIR);
  } catch {
    return items;
  }

  for (const landing of landings) {
    if (landing.startsWith(".") || landing === "_candidates") continue;

    const landingDir = path.join(OUTPUT_DIR, landing);
    const stat = await fs.stat(landingDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    let files: string[];
    try {
      files = await fs.readdir(landingDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".webp")) continue;
      const name = file.replace(/\.webp$/, "");
      const metaPath = path.join(landingDir, `${name}.json`);

      let meta: OutputMeta;
      try {
        const content = await fs.readFile(metaPath, "utf-8");
        meta = JSON.parse(content) as OutputMeta;
      } catch {
        continue;
      }

      items.push({
        landing,
        name,
        webpPath: `${landing}/${file}`,
        meta,
      });
    }
  }

  // 按时间倒序
  items.sort(
    (a, b) =>
      new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime()
  );

  return items;
}
