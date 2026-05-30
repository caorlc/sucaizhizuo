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

// before/after 对比合成：1200×800「同一张图左右切分」——左半原图、右半结果，
// 中间一道白色虚线分隔，左右各一枚圆角 Before/After 药丸标签，外角做圆角（透明）。
export async function composeComparison(originalBuf: Buffer, resultBuf: Buffer): Promise<Buffer> {
  const W = 1200;
  const H = 800;
  const HALF = W / 2; // 600
  const RADIUS = 28;

  // 两张都铺满 1200×800（cover），再各取一半拼成「同一张图的左右对比」
  const leftFull = await sharp(originalBuf).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  const rightFull = await sharp(resultBuf).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  const leftHalf = await sharp(leftFull).extract({ left: 0, top: 0, width: HALF, height: H }).toBuffer();
  const rightHalf = await sharp(rightFull).extract({ left: HALF, top: 0, width: HALF, height: H }).toBuffer();

  // 叠加层：中间虚线 + Before/After 圆角药丸标签
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <line x1="${HALF}" y1="0" x2="${HALF}" y2="${H}" stroke="#ffffff" stroke-width="2" stroke-dasharray="9 9" stroke-opacity="0.85"/>
       <g font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600">
         <rect x="28" y="26" width="132" height="48" rx="13" ry="13" fill="#000000" fill-opacity="0.55"/>
         <text x="94" y="59" fill="#ffffff" text-anchor="middle">Before</text>
         <rect x="${HALF + 28}" y="26" width="112" height="48" rx="13" ry="13" fill="#000000" fill-opacity="0.55"/>
         <text x="${HALF + 84}" y="59" fill="#ffffff" text-anchor="middle">After</text>
       </g>
     </svg>`
  );

  const flat = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: leftHalf, left: 0, top: 0 },
      { input: rightHalf, left: HALF, top: 0 },
      { input: overlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  // 圆角：用圆角矩形蒙版 dest-in，外角变透明，贴落地页时与背景自然融合
  const roundMask = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="${RADIUS}" ry="${RADIUS}" fill="#ffffff"/></svg>`
  );

  return sharp(flat)
    .composite([{ input: roundMask, blend: "dest-in" }])
    .webp({ quality: 90 })
    .toBuffer();
}
