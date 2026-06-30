// POST /api/video/generate：创建视频生成任务，fire-and-forget 后台 worker
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { VIDEO_ASPECTS, VIDEO_RESOLUTIONS, getVideoModelByMode } from "@/lib/videoModels";
import type { VideoAspect, VideoResolution, VideoMode } from "@/lib/videoModels";
import { saveVideoRun, videoNameFromPrompt } from "@/lib/videoStorage";
import { runVideoWorker } from "@/lib/videoWorker";

interface GenerateVideoBody {
  mode: VideoMode;
  prompt?: string;
  imageUrl?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
}

// duration 限制范围（秒）
const DURATION_MIN = 6;
const DURATION_MAX = 30;
const DURATION_DEFAULT = 6;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: GenerateVideoBody;
  try {
    body = (await request.json()) as GenerateVideoBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { mode, prompt = "", imageUrl, aspectRatio, resolution, duration } = body;

  // 校验 mode
  if (mode !== "t2v" && mode !== "i2v") {
    return NextResponse.json(
      { error: "mode 必须是 t2v（文生视频）或 i2v（图生视频）" },
      { status: 400 }
    );
  }

  // 校验 t2v 时 prompt 必填
  if (mode === "t2v" && !prompt.trim()) {
    return NextResponse.json({ error: "文生视频时 prompt 不能为空" }, { status: 400 });
  }

  // 校验 i2v 时 imageUrl 必填且以 http 开头
  if (mode === "i2v") {
    if (!imageUrl?.trim()) {
      return NextResponse.json({ error: "图生视频时图片 URL 不能为空" }, { status: 400 });
    }
    if (!imageUrl.startsWith("http")) {
      return NextResponse.json(
        { error: "图片 URL 必须是公网 http(s) 地址" },
        { status: 400 }
      );
    }
  }

  // 校验 aspectRatio（不在枚举则默认 2:3）
  const finalAspect: VideoAspect =
    VIDEO_ASPECTS.includes(aspectRatio as VideoAspect)
      ? (aspectRatio as VideoAspect)
      : "2:3";

  // 校验 resolution（不在枚举则默认 480p）
  const finalResolution: VideoResolution =
    VIDEO_RESOLUTIONS.includes(resolution as VideoResolution)
      ? (resolution as VideoResolution)
      : "480p";

  // duration clamp 到 [6, 30]
  const rawDuration = typeof duration === "number" ? duration : DURATION_DEFAULT;
  const finalDuration = Math.min(DURATION_MAX, Math.max(DURATION_MIN, rawDuration));

  // 按 mode 选模型
  const modelDef = getVideoModelByMode(mode);

  // 生成 runId 和文件名 slug
  const runId = randomUUID();
  const name = mode === "t2v"
    ? videoNameFromPrompt(prompt)
    : videoNameFromPrompt(prompt || `image-to-video-${Date.now()}`);

  // 保存 run 记录（初始 pending）
  await saveVideoRun({
    runId,
    mode,
    model: modelDef.id,
    prompt: prompt.trim(),
    imageUrl: imageUrl?.trim(),
    aspectRatio: finalAspect,
    resolution: finalResolution,
    duration: finalDuration,
    name,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  // Fire-and-forget：立即返回 runId，后台执行生成
  void runVideoWorker(runId).catch(console.error);

  return NextResponse.json({ runId });
}
