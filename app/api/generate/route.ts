import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parsePromptsText, saveRun, slugify, type RunRecord } from "@/lib/storage";
import { cleanupOldCandidates } from "@/lib/cleanup";
import { runBackgroundWorker } from "@/lib/worker";
import { isAspect, DEFAULT_ASPECT, type Aspect } from "@/lib/aspect";

interface GenerateBody {
  landing: string;
  model: string;
  globalKeyword: string;
  promptsText: string;
  aspect?: Aspect;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 懒清理旧候选文件
  void cleanupOldCandidates().catch(console.error);

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { landing, model, globalKeyword, promptsText, aspect } = body;
  const finalAspect: Aspect = isAspect(aspect) ? aspect : DEFAULT_ASPECT;

  if (!landing?.trim()) {
    return NextResponse.json({ error: "落地页名称不能为空" }, { status: 400 });
  }
  if (!model?.trim()) {
    return NextResponse.json({ error: "请选择模型" }, { status: 400 });
  }
  if (!globalKeyword?.trim()) {
    return NextResponse.json({ error: "全局源图主题不能为空" }, { status: 400 });
  }
  if (!promptsText?.trim()) {
    return NextResponse.json({ error: "请填写至少一个 Prompt" }, { status: 400 });
  }

  const parsed = parsePromptsText(promptsText);
  if (parsed.length === 0) {
    return NextResponse.json({ error: "未解析到任何 prompt" }, { status: 400 });
  }

  const landingSlug = slugify(landing.trim());
  const runId = randomUUID();

  const run: RunRecord = {
    runId,
    landing: landingSlug,
    model: model.trim(),
    globalKeyword: globalKeyword.trim(),
    aspect: finalAspect,
    candidates: parsed.map((p, i) => ({
      index: i,
      name: p.name,
      prompt: p.prompt,
      ...(p.keywordOverride ? { keywordOverride: p.keywordOverride } : {}),
      status: "pending" as const,
    })),
    createdAt: new Date().toISOString(),
  };

  await saveRun(run);

  // Fire-and-forget：立即返回 runId，后台并发跑所有 candidate
  void runBackgroundWorker(runId).catch(console.error);

  return NextResponse.json({ runId });
}
