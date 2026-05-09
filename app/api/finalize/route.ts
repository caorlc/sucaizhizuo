import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getRun, saveOutputMeta } from "@/lib/storage";

const OUTPUT_DIR = path.join(process.cwd(), "output");

type FinalizeBody =
  | { runId: string; index: number; all?: never }
  | { runId: string; all: true; index?: never };

async function finalizeOne(
  runId: string,
  index: number
): Promise<{ name: string }> {
  const run = await getRun(runId);
  const candidate = run.candidates[index];

  if (!candidate) {
    throw new Error(`找不到候选 index=${index}`);
  }
  if (candidate.status !== "success" || !candidate.candidatePath) {
    throw new Error(`候选 ${index} 尚未生成成功，无法定稿`);
  }

  const srcPath = path.join(OUTPUT_DIR, candidate.candidatePath);
  const finalPath = path.join(OUTPUT_DIR, run.landing, `${candidate.name}.webp`);

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.copyFile(srcPath, finalPath);

  await saveOutputMeta(run.landing, candidate.name, {
    landing: run.landing,
    name: candidate.name,
    prompt: candidate.prompt,
    model: run.model,
    keyword: candidate.keywordUsed ?? run.globalKeyword,
    aspect: run.aspect,
    source: candidate.source!,
    createdAt: new Date().toISOString(),
  });

  return { name: candidate.name };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: FinalizeBody;
  try {
    body = (await request.json()) as FinalizeBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { runId } = body;
  if (!runId) {
    return NextResponse.json({ error: "runId 不能为空" }, { status: 400 });
  }

  try {
    if (body.all === true) {
      // 批量定稿：所有 success 状态的 candidate
      const run = await getRun(runId);
      const successCandidates = run.candidates.filter(
        (c) => c.status === "success"
      );
      if (successCandidates.length === 0) {
        return NextResponse.json(
          { error: "没有可以定稿的成功候选" },
          { status: 400 }
        );
      }
      await Promise.all(
        successCandidates.map((c) => finalizeOne(runId, c.index))
      );
      return NextResponse.json({ ok: true, finalized: successCandidates.length });
    } else {
      // 单条定稿
      if (typeof body.index !== "number") {
        return NextResponse.json(
          { error: "index 必须是数字" },
          { status: 400 }
        );
      }
      await finalizeOne(runId, body.index);
      return NextResponse.json({ ok: true, finalized: 1 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
