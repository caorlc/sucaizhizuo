import { NextRequest, NextResponse } from "next/server";
import { getVideoRun } from "@/lib/videoStorage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  const { runId } = await params;

  try {
    const record = await getVideoRun(runId);
    return NextResponse.json(record, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "找不到视频任务" },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
