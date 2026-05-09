import { NextRequest, NextResponse } from "next/server";
import { getRun, updateCandidate } from "@/lib/storage";
import { generateCandidate } from "@/lib/worker";

interface RegenerateBody {
  runId: string;
  index: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RegenerateBody;
  try {
    body = (await request.json()) as RegenerateBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { runId, index } = body;

  if (!runId) {
    return NextResponse.json({ error: "runId 不能为空" }, { status: 400 });
  }
  if (typeof index !== "number") {
    return NextResponse.json({ error: "index 必须是数字" }, { status: 400 });
  }

  try {
    const run = await getRun(runId);

    if (index < 0 || index >= run.candidates.length) {
      return NextResponse.json(
        { error: `index ${index} 超出范围（共 ${run.candidates.length} 条）` },
        { status: 400 }
      );
    }

    // 重置该 candidate 状态
    await updateCandidate(runId, index, {
      status: "pending",
      error: undefined,
      completedAt: undefined,
      candidatePath: undefined,
      source: undefined,
      keywordUsed: undefined,
    });

    // Fire-and-forget 重新生成
    void generateCandidate(runId, index).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
