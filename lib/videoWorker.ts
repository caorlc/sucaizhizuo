// 视频生成后台 worker：模仿 worker.ts 的 fire-and-forget 模式
import path from "path";
import { createVideoTask, pollTaskResult } from "./kie";
import { getVideoModel } from "./videoModels";
import { downloadToFile } from "./video";
import {
  getVideoRun,
  updateVideoRun,
  rawMp4RelPath,
  VIDEO_OUTPUT_DIR,
} from "./videoStorage";

/**
 * 执行单个视频生成任务的全流程：
 * 1. 标记 startedAt
 * 2. 读取 run 记录，组装 input
 * 3. createVideoTask → 获取 taskId
 * 4. pollTaskResult（最多 200 次 × 3s，约 10 分钟超时）→ mp4Url
 * 5. 下载 mp4 到本地 _raw 目录
 * 6. 更新 run 记录为 success
 * 失败时 catch，更新为 failed + 中文错误信息
 */
export async function generateVideo(runId: string): Promise<void> {
  const now = () => new Date().toISOString();

  // 标记任务开始
  await updateVideoRun(runId, { status: "pending", startedAt: now() });

  try {
    // 读取 run 记录
    const record = await getVideoRun(runId);

    // 从模型注册表取 buildInput，组装 KIE input 对象
    const modelDef = getVideoModel(record.model);
    const input = modelDef.buildInput({
      prompt: record.prompt,
      // i2v 时 imageUrls 传单元素数组；t2v 时 imageUrls 为 undefined
      imageUrls: record.imageUrl ? [record.imageUrl] : undefined,
      aspectRatio: record.aspectRatio as import("./videoModels").VideoAspect,
      resolution: record.resolution as import("./videoModels").VideoResolution,
      // t2v/i2v 的 duration 由 generate route 保证必定存在；import 模式走 importWorker 不会到这里
      duration: record.duration!,
    });

    // 创建 KIE 任务
    const taskId = await createVideoTask({ model: record.model, input });

    // 轮询任务结果（约 10 分钟超时：200 次 × 3 秒）
    const mp4Url = await pollTaskResult(taskId, { maxAttempts: 200 });

    // 计算本地 mp4 落盘路径
    // relPath 相对 output/（如 _videos/_raw/xxx.mp4），VIDEO_OUTPUT_DIR 即 output/ 的绝对路径
    const relPath = rawMp4RelPath(record.name, runId);
    const absRawPath = path.join(VIDEO_OUTPUT_DIR, relPath);

    // 下载 mp4 到本地
    await downloadToFile(mp4Url, absRawPath);

    // 更新 run 记录为成功
    await updateVideoRun(runId, {
      status: "success",
      mp4Url,
      rawMp4Path: relPath, // 相对 output/ 的路径
      completedAt: now(),
    });
  } catch (err) {
    // 统一用中文错误信息
    const message = err instanceof Error ? err.message : "视频生成失败：未知错误";
    await updateVideoRun(runId, {
      status: "failed",
      error: message,
      completedAt: now(),
    }).catch(console.error); // catch 防止二次异常掩盖原始错误
  }
}

/**
 * fire-and-forget 调用入口（命名风格与现有 runBackgroundWorker 保持一致）
 */
export async function runVideoWorker(runId: string): Promise<void> {
  await generateVideo(runId);
}
