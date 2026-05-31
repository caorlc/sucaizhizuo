import "./loadEnv"; // 必须第一行：填充 process.env 后再导入读 env 的 lib
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { searchUnsplashPhoto, type UnsplashOrientation } from "../lib/unsplash";

// photo-enhancer 配图：本地降质（最忠实），同一张照片 before(模糊)/after(高清) 对比。
// - cover：两张独立 800×800（-1 模糊输入、-2 高清输出，同一张）。
// - showcase / use-case：竖图 800×1200，上半模糊 / 下半高清（同一张）。
// - features：横图 1200×800，左半模糊 / 右半高清（同一张）。
// 无文字标签，仅一道细分割线。模糊全部本地生成，不调用模型/KIE。

type Kind = "cover" | "vertical" | "horizontal";
type Strength = "heavy" | "strong";

interface Item {
  index: number; // 主编号；cover 为模糊(-1)，clearIndex 为高清(-2)
  clearIndex?: number; // 仅 cover：高清那张的编号
  kind: Kind;
  keyword: string;
  note: string; // 中文语义摘要（汇报用）
}

const SLUG = "photo-enhancer";

const PLAN: Item[] = [
  { index: 1, clearIndex: 2, kind: "cover", keyword: "beautiful asian woman portrait", note: "cover 主视觉：美女正脸特写（-1模糊/-2高清同一张）" },
  // showcase 竖图（不同主体）
  { index: 3, kind: "vertical", keyword: "golden retriever puppy", note: "showcase：金毛幼犬，毛发细节" },
  { index: 4, kind: "vertical", keyword: "autumn mountain lake reflection", note: "showcase：秋日山湖倒影，自然纹理" },
  { index: 5, kind: "vertical", keyword: "gourmet fine dining plating", note: "showcase：精致摆盘美食" },
  { index: 6, kind: "vertical", keyword: "handsome east asian man portrait", note: "showcase：东亚帅哥肖像" },
  // features 横图（对应 3 个卖点）
  { index: 7, kind: "horizontal", keyword: "colorful macaw parrot closeup", note: "feature① 超解像エンジン：鹦鹉羽毛细部復元" },
  { index: 8, kind: "horizontal", keyword: "tropical beach sunset", note: "feature② 無料で試せる：随手旅拍" },
  { index: 9, kind: "horizontal", keyword: "orange tabby cat closeup", note: "feature③ 誰でも簡単：橘猫亲和" },
  // use case 竖图（对应 3 个场景）
  { index: 10, kind: "vertical", keyword: "luxury wristwatch product photography", note: "usecase① ビジネス資料：腕表产品图" },
  { index: 11, kind: "vertical", keyword: "vintage retro film portrait woman", note: "usecase② 古い写真：复古胶片人像" },
  { index: 12, kind: "vertical", keyword: "young east asian woman selfie lifestyle", note: "usecase③ SNS投稿：女生自拍生活照" },
];

const ORIENTATION: Record<Kind, UnsplashOrientation> = {
  cover: "squarish", // 800×800
  vertical: "landscape", // 上下两半各 800×600（横向取材）
  horizontal: "portrait", // 左右两半各 600×800（纵向取材）
};

const DEGRADE: Record<Strength, { downscale: number; blur: number; jpegQ: number; noiseSigma: number }> = {
  heavy: { downscale: 9, blur: 11, jpegQ: 22, noiseSigma: 14 }, // cover 输入：很模糊
  strong: { downscale: 6, blur: 7, jpegQ: 30, noiseSigma: 11 }, // 对比面板：明显低画质但可辨认
};

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败：${url} HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// 把源图 cover-crop 到精确面板尺寸（高清侧），保持主体居中、不变形
async function cropPanel(src: Buffer, w: number, h: number): Promise<Buffer> {
  // .rotate() 无参数 = 按 EXIF 自动转正，避免源图侧躺
  return sharp(src).rotate().resize(w, h, { fit: "cover", position: "centre" }).png().toBuffer();
}

// 对「同一面板」做本地降质 → 模糊侧（与高清侧像素同框，before/after 完美对齐）
async function degrade(panel: Buffer, w: number, h: number, s: Strength): Promise<Buffer> {
  const p = DEGRADE[s];
  const smallW = Math.max(8, Math.round(w / p.downscale));
  const smallH = Math.max(8, Math.round(h / p.downscale));
  let buf = await sharp(panel)
    .resize(smallW, smallH, { fit: "fill" }) // 降采样丢细节
    .resize(w, h, { fit: "fill", kernel: "cubic" }) // 升回原尺寸，糊
    .blur(p.blur)
    .jpeg({ quality: p.jpegQ }) // 压缩 artifacts
    .toBuffer();
  try {
    const noise = await sharp({ create: { width: w, height: h, channels: 3, noise: { type: "gaussian", mean: 128, sigma: p.noiseSigma } } }).png().toBuffer();
    buf = await sharp(buf).composite([{ input: noise, blend: "overlay" }]).jpeg({ quality: p.jpegQ }).toBuffer();
  } catch {
    // noise 不支持就跳过，blur+降采样+压缩已够
  }
  return buf;
}

function vDivider(w: number, H: number, y: number): Buffer {
  return Buffer.from(`<svg width="${w}" height="${H}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/></svg>`);
}
function hDivider(W: number, h: number, x: number): Buffer {
  return Buffer.from(`<svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg"><line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/></svg>`);
}

// 竖图 800×1200：上=模糊 下=高清
async function stitchVertical(blurTop: Buffer, clearBottom: Buffer): Promise<Buffer> {
  const W = 800, halfH = 600, H = 1200;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: blurTop, top: 0, left: 0 },
      { input: clearBottom, top: halfH, left: 0 },
      { input: vDivider(W, H, halfH), top: 0, left: 0 },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

// 横图 1200×800：左=模糊 右=高清
async function stitchHorizontal(blurLeft: Buffer, clearRight: Buffer): Promise<Buffer> {
  const W = 1200, halfW = 600, H = 800;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: blurLeft, top: 0, left: 0 },
      { input: clearRight, top: 0, left: halfW },
      { input: hDivider(W, H, halfW), top: 0, left: 0 },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

async function toWebpExact(buf: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buf).resize(w, h, { fit: "cover", position: "centre" }).webp({ quality: 90 }).toBuffer();
}

async function processItem(item: Item, outDir: string) {
  const orientation = ORIENTATION[item.kind];
  const photo = await searchUnsplashPhoto(item.keyword, orientation);
  const src = await download(photo.imageUrl);
  const results: { file: string; index: number }[] = [];

  if (item.kind === "cover") {
    const clear = await cropPanel(src, 800, 800);
    const blur = await degrade(clear, 800, 800, "heavy");
    const blurFile = path.join(outDir, `${SLUG}-${item.index}.webp`); // -1 模糊
    const clearFile = path.join(outDir, `${SLUG}-${item.clearIndex}.webp`); // -2 高清
    await fs.writeFile(blurFile, await toWebpExact(blur, 800, 800));
    await fs.writeFile(clearFile, await toWebpExact(clear, 800, 800));
    results.push({ file: blurFile, index: item.index }, { file: clearFile, index: item.clearIndex! });
  } else if (item.kind === "vertical") {
    const clearPanel = await cropPanel(src, 800, 600);
    const blurPanel = await degrade(clearPanel, 800, 600, "strong");
    const file = path.join(outDir, `${SLUG}-${item.index}.webp`);
    await fs.writeFile(file, await stitchVertical(blurPanel, clearPanel));
    results.push({ file, index: item.index });
  } else {
    const clearPanel = await cropPanel(src, 600, 800);
    const blurPanel = await degrade(clearPanel, 600, 800, "strong");
    const file = path.join(outDir, `${SLUG}-${item.index}.webp`);
    await fs.writeFile(file, await stitchHorizontal(blurPanel, clearPanel));
    results.push({ file, index: item.index });
  }

  return { index: item.index, keyword: item.keyword, note: item.note, sourceUrl: photo.imageUrl, files: results.map((r) => r.file) };
}

async function main() {
  const argv = process.argv.slice(2);
  const outArg = argv.find((a, i) => argv[i - 1] === "--out");
  const onlyArg = argv.find((a, i) => argv[i - 1] === "--only");
  const outDir = outArg ?? `output/image-edit/${SLUG}`;
  await fs.mkdir(outDir, { recursive: true });

  const only = onlyArg ? new Set(onlyArg.split(",").map((n) => parseInt(n, 10))) : null;
  const items = only ? PLAN.filter((it) => only.has(it.index)) : PLAN;

  const out: unknown[] = [];
  for (const item of items) {
    try {
      out.push({ ok: true, ...(await processItem(item, outDir)) });
    } catch (err) {
      out.push({ ok: false, index: item.index, keyword: item.keyword, error: err instanceof Error ? err.message : String(err) });
    }
  }
  console.log(JSON.stringify({ slug: SLUG, out: outDir, results: out }, null, 2));
  if (out.some((r) => !(r as { ok: boolean }).ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
