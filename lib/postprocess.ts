// 图片后处理：sharp cover-crop + resize + WEBP 输出
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

export interface ProcessSize {
  width: number;
  height: number;
}

export async function processImage(
  sourceBuffer: Buffer,
  outputPath: string,
  size: ProcessSize
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await sharp(sourceBuffer)
    .resize(size.width, size.height, {
      fit: "cover", // cover-crop 保持目标比例，裁掉多余部分
      position: "centre",
    })
    .webp({ quality: 90 })
    .toFile(outputPath);
}

export async function downloadAndProcess(
  imageUrl: string,
  outputPath: string,
  size: ProcessSize
): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`下载图片失败：${imageUrl}，HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await processImage(buffer, outputPath, size);
}

// before/after 对比合成：1200×800 白底，左原图右结果，顶部 Before/After 标签，无箭头
export async function composeComparison(originalBuf: Buffer, resultBuf: Buffer): Promise<Buffer> {
  const W = 1200;
  const H = 800;
  const PANEL_W = 556;
  const PANEL_H = 692;
  const LEFT_X = 32;
  const RIGHT_X = 612;
  const PANEL_Y = 76;

  const left = await sharp(originalBuf).resize(PANEL_W, PANEL_H, { fit: "cover", position: "centre" }).toBuffer();
  const right = await sharp(resultBuf).resize(PANEL_W, PANEL_H, { fit: "cover", position: "centre" }).toBuffer();

  const labels = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <text x="${LEFT_X + 4}" y="56" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#475569">Before</text>
       <text x="${RIGHT_X + 4}" y="56" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#475569">After</text>
     </svg>`
  );

  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: left, top: PANEL_Y, left: LEFT_X },
      { input: right, top: PANEL_Y, left: RIGHT_X },
      { input: labels, top: 0, left: 0 },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}
