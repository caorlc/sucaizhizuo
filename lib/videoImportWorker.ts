// 视频导入后台 worker：yt-dlp 下载 → ffmpeg 转 webm → 保存元信息
// 模仿 videoWorker.ts 的 fire-and-forget 模式，不需要 finalize 确认步骤
import path from "path";
import { basename } from "path";
import { downloadVideo } from "./ytdlp";
import { convertMp4ToWebm } from "./video";
import {
  getVideoRun,
  updateVideoRun,
  saveVideoMeta,
  rawMp4RelPath,
  webmRelPath,
  VIDEO_OUTPUT_DIR,
} from "./videoStorage";

/**
 * 执行单个视频导入任务的全流程：
 * 1. 标记 startedAt
 * 2. 读取 run 记录，取 sourceUrl / maxHeight
 * 3. yt-dlp 下载源视频（合并为 mp4）
 * 4. ffmpeg 转码 mp4 → webm（VP9 + Opus）
 * 5. saveVideoMeta 保存到成片历史
 * 6. updateVideoRun 标记 success
 * 失败时 catch，更新为 failed + 中文错误信息
 */
export async function runImportWorker(runId: string): Promise<void> {
  const now = () => new Date().toISOString();

  // 标记任务开始
  await updateVideoRun(runId, { status: "pending", startedAt: now() });

  try {
    // 读取 run 记录
    const record = await getVideoRun(runId);

    // sourceUrl 必须存在（由 import route 保证）
    const sourceUrl = record.sourceUrl;
    if (!sourceUrl) {
      throw new Error("run 记录缺少 sourceUrl，无法下载");
    }

    // 计算原始 mp4 不含扩展名的绝对路径
    // rawMp4RelPath 返回 "_videos/_raw/{name}-{shortId}.mp4"
    const relRaw = rawMp4RelPath(record.name, runId);
    // 去掉 .mp4 得到 outNoExt，供 yt-dlp -o 模板使用
    const absRawNoExt = path.join(
      VIDEO_OUTPUT_DIR,
      relRaw.replace(/\.mp4$/, "")
    );

    // 调用 yt-dlp 下载（最终产物为 absRawNoExt + ".mp4"）
    const absMp4 = await downloadVideo(sourceUrl, absRawNoExt, record.maxHeight);

    // 计算 webm 绝对路径
    const relWebm = webmRelPath(record.name, runId);
    const absWebm = path.join(VIDEO_OUTPUT_DIR, relWebm);

    // 调用 ffmpeg 转 webm（复用现有管线，VP9 + Opus）
    await convertMp4ToWebm(absMp4, absWebm);

    // 保存成片元信息到 output/_videos/{filename}.json
    const webmFilename = basename(relWebm, ".webm");
    await saveVideoMeta(webmFilename, {
      name: record.name,
      mode: "import",
      model: "yt-dlp",
      prompt: record.sourceTitle ?? "", // prompt 字段复用为视频标题
      webmPath: relWebm,
      createdAt: now(),
      sourceUrl,                         // 记录来源 URL，便于历史展示
    });

    // 更新 run 记录为成功，同时记录两条路径
    await updateVideoRun(runId, {
      status: "success",
      rawMp4Path: relRaw,   // 相对 output/ 的原始 mp4 路径
      webmPath: relWebm,    // 相对 output/ 的成片 webm 路径
      completedAt: now(),
    });
  } catch (err) {
    // 统一用中文错误信息（与 videoWorker.ts 风格一致）
    const message = err instanceof Error ? err.message : "视频导入失败：未知错误";
    await updateVideoRun(runId, {
      status: "failed",
      error: message,
      completedAt: now(),
    }).catch(console.error); // catch 防止二次异常掩盖原始错误
  }
}
