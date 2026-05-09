import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// runId 必须全数字（Date.now() 生成），filename 只允许 [a-z0-9-]+\.webp
const SAFE_RUN_ID = /^\d+$/;
const SAFE_FILENAME = /^[a-z0-9-]+\.webp$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId") ?? "";
  const filename = searchParams.get("filename") ?? "";

  if (!SAFE_RUN_ID.test(runId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!SAFE_FILENAME.test(filename)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const filePath = path.join(
    process.cwd(),
    "runs",
    "showcase",
    runId,
    filename
  );

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
