// POST /api/video/finalize：用户确认后将 mp4 转码为 webm 并保存成片元信息
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getVideoRun, updateVideoRun, saveVideoMeta, webmRelPath, VIDEO_OUTPUT_DIR } from "@/lib/videoStorage";
import { convertMp4ToWebm } from "@/lib/video";

interface FinalizeVideoBody {
  runId: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: FinalizeVideoBody;
  try {
    body = (await request.json()) as FinalizeVideoBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { runId } = body;
  if (!runId) {
    return NextResponse.json({ error: "runId 不能为空" }, { status: 400 });
  }

  let record;
  try {
    record = await getVideoRun(runId);
  } catch {
    return NextResponse.json({ error: "找不到该视频运行记录" }, { status: 404 });
  }

  // 要求 status === "success" 且本地 mp4 已落盘
  if (record.status !== "success") {
    return NextResponse.json(
      { error: `视频尚未生成成功（当前状态：${record.status}）` },
      { status: 400 }
    );
  }
  if (!record.rawMp4Path) {
    return NextResponse.json(
      { error: "找不到原始 mp4 路径，无法转码" },
      { status: 400 }
    );
  }

  // 计算输入 mp4 和输出 webm 的绝对路径
  // rawMp4Path 是相对 output/ 的路径（如 _videos/_raw/xxx.mp4）
  const absRawMp4 = path.join(VIDEO_OUTPUT_DIR, record.rawMp4Path);
  const relWebm = webmRelPath(record.name, runId);
  const absWebm = path.join(VIDEO_OUTPUT_DIR, relWebm);

  try {
    // 调用 ffmpeg 将 mp4 转为 webm（VP9 + Opus），转码耗时约 10-60 秒
    await convertMp4ToWebm(absRawMp4, absWebm);
  } catch (err) {
    const message = err instanceof Error ? err.message : "转码失败：未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 保存成片元信息 JSON（文件名不含扩展名）
  const webmFilename = path.basename(relWebm, ".webm");
  const meta = {
    name: record.name,
    mode: record.mode,
    model: record.model,
    prompt: record.prompt,
    ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    duration: record.duration,
    webmPath: relWebm,
    createdAt: new Date().toISOString(),
  };
  await saveVideoMeta(webmFilename, meta);

  // 更新 run 记录，记录 webm 相对路径
  await updateVideoRun(runId, { webmPath: relWebm });

  return NextResponse.json({
    ok: true,
    webmPath: relWebm,
    name: record.name,
  });
}
