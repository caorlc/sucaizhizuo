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
