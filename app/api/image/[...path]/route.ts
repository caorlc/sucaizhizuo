import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// 服务 output/ 和 inputs/ 目录下的图片（这两个目录不在 public/ 里）

const ALLOWED_ROOTS = ["output", "inputs"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path: segments } = await params;

  if (!segments || segments.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 安全校验：只允许访问 output/ 和 inputs/ 目录
  const root = segments[0];
  if (!ALLOWED_ROOTS.includes(root)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 防止路径遍历攻击
  const relativePath = segments.join("/");
  if (relativePath.includes("..")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const filePath = path.join(process.cwd(), relativePath);

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
