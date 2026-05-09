import { NextResponse } from "next/server";
import { listHistory } from "@/lib/storage";

export async function GET(): Promise<NextResponse> {
  try {
    const items = await listHistory();
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
