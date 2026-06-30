// POST /api/video/import：接收视频链接，用 yt-dlp 下载并转 webm，fire-and-forget
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fetchVideoTitle } from "@/lib/ytdlp";
import { saveVideoRun, videoNameFromPrompt } from "@/lib/videoStorage";
import { runImportWorker } from "@/lib/videoImportWorker";

interface ImportVideoBody {
  url: string;
  maxHeight?: number; // 可选清晰度上限（如 720、1080）
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ImportVideoBody;
  try {
    body = (await request.json()) as ImportVideoBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { url, maxHeight } = body;

  // 校验 url 必填且必须 http(s) 开头
  if (!url || typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url 不能为空" }, { status: 400 });
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return NextResponse.json(
      { error: "url 必须以 http:// 或 https:// 开头" },
      { status: 400 }
    );
  }

  // 校验 maxHeight（若传入必须是正整数）
  if (
    maxHeight !== undefined &&
    (typeof maxHeight !== "number" || !Number.isInteger(maxHeight) || maxHeight <= 0)
  ) {
    return NextResponse.json(
      { error: "maxHeight 必须是正整数（如 720、1080）" },
      { status: 400 }
    );
  }

  // 尝试获取视频标题（失败不阻塞，返回 null）
  // fetchVideoTitle 内部有 30s 超时保护，耗时可接受
  const title = await fetchVideoTitle(url.trim());

  // 用标题生成文件名 slug（失败时回退到时间戳）
  const name = videoNameFromPrompt(title ?? `video-${Date.now()}`);

  // 生成唯一 runId
  const runId = randomUUID();

  // 保存 run 记录（初始 pending）
  await saveVideoRun({
    runId,
    mode: "import",
    model: "yt-dlp",
    prompt: "",                        // import 模式 prompt 为空，标题存 sourceTitle
    name,
    status: "pending",
    createdAt: new Date().toISOString(),
    sourceUrl: url.trim(),
    sourceTitle: title ?? undefined,
    maxHeight,                         // 存入 record，worker 从 record 读取
  });

  // Fire-and-forget：立即返回 runId，后台执行下载 + 转码
  void runImportWorker(runId).catch(console.error);

  return NextResponse.json({ runId });
}
