// 后台生成 worker：供 /api/generate 和 /api/regenerate 共用
import path from "path";
import fs from "fs/promises";
import { createTask, pollTaskResult } from "./kie";
import { searchUnsplashPhoto } from "./unsplash";
import { downloadAndProcess } from "./postprocess";
import { getRun, updateCandidate, pickRandomKeyword } from "./storage";
import { getAspectConfig } from "./aspect";

const OUTPUT_DIR = path.join(process.cwd(), "output");

/**
 * 生成单条候选
 */
export async function generateCandidate(
  runId: string,
  index: number
): Promise<void> {
  const now = () => new Date().toISOString();

  // 标记开始（重新确认 pending 状态）
  await updateCandidate(runId, index, { status: "pending", startedAt: now() });

  try {
    const run = await getRun(runId);
    const candidate = run.candidates[index];
    if (!candidate) throw new Error(`找不到候选 index=${index}`);

    // globalKeyword 支持逗号分隔多主题，每次随机选一个；keywordOverride 优先
    const keyword = candidate.keywordOverride ?? pickRandomKeyword(run.globalKeyword);
    const aspectCfg = getAspectConfig(run.aspect);

    // 1. Unsplash 源图（按目标比例取对应朝向的图）
    const source = await searchUnsplashPhoto(keyword, aspectCfg.unsplashOrientation);

    // 2. 创建 KIE 任务（直接请求目标比例，不靠后处理裁剪）
    const taskId = await createTask({
      model: run.model,
      prompt: candidate.prompt,
      imageUrl: source.imageUrl,
      imageSize: aspectCfg.kieImageSize,
    });

    // 3. 轮询结果
    const resultUrl = await pollTaskResult(taskId);

    // 4. 下载后处理（cover-crop 到目标精确尺寸，再转 WEBP）
    const candidatesDir = path.join(OUTPUT_DIR, run.landing, "_candidates");
    await fs.mkdir(candidatesDir, { recursive: true });
    const outputPath = path.join(candidatesDir, `${candidate.name}.webp`);
    await downloadAndProcess(resultUrl, outputPath, {
      width: aspectCfg.width,
      height: aspectCfg.height,
    });

    // 5. 成功
    await updateCandidate(runId, index, {
      status: "success",
      source,
      keywordUsed: keyword,
      candidatePath: `${run.landing}/_candidates/${candidate.name}.webp`,
      completedAt: now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    await updateCandidate(runId, index, {
      status: "failed",
      error: message,
      completedAt: now(),
    }).catch(console.error);
  }
}

/**
 * 并发跑所有 candidate（fire-and-forget 调用入口）
 */
export async function runBackgroundWorker(runId: string): Promise<void> {
  const run = await getRun(runId);
  await Promise.all(run.candidates.map((c) => generateCandidate(runId, c.index)));
}
