import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const DOWNLOAD_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function toSlug(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`下载失败 (${res.status})`);
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      throw new Error("图片超过 50MB 限制");
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      throw new Error("图片超过 50MB 限制");
    }
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

interface RequestBody {
  model: string;
  startIndex: number;
  urls: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const { model, startIndex, urls } = body;

  if (!model || typeof model !== "string" || model.trim() === "") {
    return NextResponse.json({ error: "模型名不能为空" }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "请提供至少一个 URL" }, { status: 400 });
  }
  const invalidUrls = urls.filter((u) => !isValidHttpUrl(u));
  if (invalidUrls.length > 0) {
    return NextResponse.json(
      { error: `以下 URL 格式无效：${invalidUrls.slice(0, 3).join("、")}` },
      { status: 400 }
    );
  }

  const slug = toSlug(model.trim());
  const runId = String(Date.now());
  const runDir = path.join(process.cwd(), "runs", "showcase", runId);
  await fs.mkdir(runDir, { recursive: true });

  const baseIndex = typeof startIndex === "number" && Number.isFinite(startIndex)
    ? Math.floor(startIndex)
    : 1;

  const results = await Promise.all(
    urls.map(async (url, i) => {
      const index = baseIndex + i;
      const filename = `${slug}-${index}.webp`;
      const filePath = path.join(runDir, filename);

      try {
        const rawBuffer = await downloadImage(url);
        const webpBuffer = await sharp(rawBuffer)
          .resize(800, 1200, { fit: "cover", position: "attention" })
          .webp({ quality: 90 })
          .toBuffer();

        await fs.writeFile(filePath, webpBuffer);

        return {
          index,
          filename,
          sourceUrl: url,
          success: true as const,
          previewUrl: `/api/showcase/file?runId=${runId}&filename=${encodeURIComponent(filename)}`,
          sizeBytes: webpBuffer.byteLength,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "处理失败";
        return {
          index,
          sourceUrl: url,
          success: false as const,
          error: message,
        };
      }
    })
  );

  return NextResponse.json({ runId, items: results });
}
