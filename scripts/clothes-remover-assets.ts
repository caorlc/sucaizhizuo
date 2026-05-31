import "./loadEnv"; // 必须第一行：填充 process.env 后再导入读 env 的 lib
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { searchUnsplashPhoto, type UnsplashOrientation } from "../lib/unsplash";
import { getModel } from "../lib/models";
import { getProvider } from "../lib/providers";
import type { BizSize } from "../lib/models";

// ai-clothes-remover 配图：同一张人物照，before(原图正常穿着)/after(Seedream 脱去外层)。
// - cover：两张独立 800×800（-1 原图、-2 Seedream，同一人）。
// - showcase / use-case：竖图 800×1200，上半=原图(正常穿着) / 下半=Seedream(清爽穿着)，同一人。
// - features：横图 1200×800，左半=原图 / 右半=Seedream，同一人。
// after 一律「脱去外层」：外套/西装/大衣/开衫 → 干净的衬衫或 T 恤，全程着装、不裸露。
// 无文字标签，仅一道细分割线。after 全部由 Seedream V4 (KIE) 生成。

const SLUG = "ai-clothes-remover";
const MODEL = "bytedance/seedream-v4-edit";

// 统一「换更清爽衣服」编辑指令：保持人物一致，只脱去外层
const BASE_AFTER = [
  "Photorealistic clothing edit.",
  "Keep the SAME person completely unchanged: identical face, hairstyle, skin tone, body shape, pose, expression, camera angle, lighting and background.",
  "Only change the outfit — remove the outer layer (jacket / coat / blazer / suit jacket / cardigan / overshirt) so the person now wears just a clean, well-fitted shirt or short-sleeve t-shirt underneath.",
  "Fully clothed, tasteful, natural fabric folds, realistic, high detail, consistent studio-grade lighting, no text, no logo, no watermark.",
].join(" ");

type Kind = "cover" | "vertical" | "horizontal";

interface Item {
  index: number; // 主编号；cover 为原图(-1)，afterIndex 为 Seedream(-2)
  afterIndex?: number; // 仅 cover：Seedream 那张的编号
  kind: Kind;
  keyword: string; // Unsplash 关键词（偏带外套，便于「脱外层」对比可见）
  extra?: string; // 追加到 BASE_AFTER 的语义微调
  note: string; // 中文语义摘要（汇报用）
}

const PLAN: Item[] = [
  // cover：男性，正常穿着 → 脱去外层（同一张）
  { index: 1, afterIndex: 2, kind: "cover", keyword: "man blazer portrait", note: "cover 主视觉：男性西装/外套 → 衬衫（-1原图/-2Seedream 同一人）" },
  // showcase 竖图（4 个不同主体，男女错开）
  { index: 3, kind: "vertical", keyword: "man coat portrait", note: "showcase：帅哥·西装外套 → 衬衫" },
  { index: 4, kind: "vertical", keyword: "woman coat portrait", note: "showcase：美女·大衣 → 上衣" },
  { index: 5, kind: "vertical", keyword: "businessman portrait", note: "showcase：商务男士·西装 → 衬衫" },
  { index: 6, kind: "vertical", keyword: "woman trench coat", note: "showcase：美女·风衣 → 内搭" },
  // features 横图（对应 Advantage 三个卖点）
  { index: 7, kind: "horizontal", keyword: "woman blazer", extra: "Clean studio background, soft even light, emphasis on natural realistic skin and anatomy.", note: "feature① 自然真实：干净棚拍单人·外套 → 衬衫" },
  { index: 8, kind: "horizontal", keyword: "man street jacket", extra: "Subject in a dynamic pose against a busy urban background; keep the complex backdrop intact.", note: "feature② 复杂背景/动态姿势：街头动态·夹克 → T恤" },
  { index: 9, kind: "horizontal", keyword: "woman street style", extra: "Fashion-forward styling, expressive outfit, emphasis on stylish look.", note: "feature③ 风格探索：时尚穿搭·外套 → 上衣" },
  // use case 竖图（对应 3 个真实场景）
  { index: 10, kind: "vertical", keyword: "woman casual jacket portrait", extra: "Casual lifestyle vibe, social-media-ready feel.", note: "usecase① 社交写真焕新：生活感人像·外套 → 休闲上衣" },
  { index: 11, kind: "vertical", keyword: "man outfit coat", extra: "Layered streetwear styling.", note: "usecase② 穿搭风格切换：多层叠穿 → 单层清爽" },
  { index: 12, kind: "vertical", keyword: "woman denim jacket portrait", extra: "Travel / outdoor summer mood, light and refreshing.", note: "usecase③ 夏日/旅行：旅拍夹克 → 夏日清爽装" },
];

// 源图取材朝向：竖图面板 800×600 用 landscape 取材；横图面板 600×800 用 portrait 取材；cover 用 squarish
const ORIENTATION: Record<Kind, UnsplashOrientation> = {
  cover: "squarish",
  vertical: "landscape",
  horizontal: "portrait",
};

// Seedream 输出比例与源图/面板对齐，裁切后 before/after 主体位置一致
const GEN_SIZE: Record<Kind, BizSize> = {
  cover: "800x800", // square_hd
  vertical: "1200x800", // landscape_16_9（对应横向取材）
  horizontal: "800x1200", // portrait_16_9（对应纵向取材）
};

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败：${url} HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// cover-crop 到精确面板尺寸，保持主体居中、不变形；.rotate() 按 EXIF 自动转正
async function cropPanel(src: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(src).rotate().resize(w, h, { fit: "cover", position: "centre" }).png().toBuffer();
}

function vDivider(w: number, H: number, y: number): Buffer {
  return Buffer.from(`<svg width="${w}" height="${H}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/></svg>`);
}
function hDivider(W: number, h: number, x: number): Buffer {
  return Buffer.from(`<svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg"><line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/></svg>`);
}

// 竖图 800×1200：上=原图(正常) 下=Seedream(清爽)
async function stitchVertical(topBefore: Buffer, bottomAfter: Buffer): Promise<Buffer> {
  const W = 800, halfH = 600, H = 1200;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: topBefore, top: 0, left: 0 },
      { input: bottomAfter, top: halfH, left: 0 },
      { input: vDivider(W, H, halfH), top: 0, left: 0 },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

// 横图 1200×800：左=原图(正常) 右=Seedream(清爽)
async function stitchHorizontal(leftBefore: Buffer, rightAfter: Buffer): Promise<Buffer> {
  const W = 1200, halfW = 600, H = 800;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: leftBefore, top: 0, left: 0 },
      { input: rightAfter, top: 0, left: halfW },
      { input: hDivider(W, H, halfW), top: 0, left: 0 },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

async function toWebpExact(buf: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buf).resize(w, h, { fit: "cover", position: "centre" }).webp({ quality: 90 }).toBuffer();
}

const model = getModel(MODEL);
const provider = getProvider(model.provider);

// 调 Seedream：传源图 + 「脱去外层」指令，输出与该 kind 对齐的比例
async function generateAfter(sourceUrl: string, kind: Kind, extra?: string): Promise<Buffer> {
  const prompt = extra ? `${BASE_AFTER} ${extra}` : BASE_AFTER;
  const { imageUrl } = await provider.generate({
    model: MODEL,
    prompt,
    imageUrls: [sourceUrl],
    size: model.sizeParam(GEN_SIZE[kind]),
  });
  return download(imageUrl);
}

async function processItem(item: Item, outDir: string) {
  const photo = await searchUnsplashPhoto(item.keyword, ORIENTATION[item.kind]);
  const src = await download(photo.imageUrl);
  const afterFull = await generateAfter(photo.imageUrl, item.kind, item.extra);
  const results: { file: string; index: number }[] = [];

  if (item.kind === "cover") {
    const before = await cropPanel(src, 800, 800);
    const after = await cropPanel(afterFull, 800, 800);
    const beforeFile = path.join(outDir, `${SLUG}-${item.index}.webp`); // -1 原图
    const afterFile = path.join(outDir, `${SLUG}-${item.afterIndex}.webp`); // -2 Seedream
    await fs.writeFile(beforeFile, await toWebpExact(before, 800, 800));
    await fs.writeFile(afterFile, await toWebpExact(after, 800, 800));
    results.push({ file: beforeFile, index: item.index }, { file: afterFile, index: item.afterIndex! });
  } else if (item.kind === "vertical") {
    const before = await cropPanel(src, 800, 600);
    const after = await cropPanel(afterFull, 800, 600);
    const file = path.join(outDir, `${SLUG}-${item.index}.webp`);
    await fs.writeFile(file, await stitchVertical(before, after));
    results.push({ file, index: item.index });
  } else {
    const before = await cropPanel(src, 600, 800);
    const after = await cropPanel(afterFull, 600, 800);
    const file = path.join(outDir, `${SLUG}-${item.index}.webp`);
    await fs.writeFile(file, await stitchHorizontal(before, after));
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
      console.error(`✓ -${item.index} ${item.note}`);
    } catch (err) {
      out.push({ ok: false, index: item.index, keyword: item.keyword, error: err instanceof Error ? err.message : String(err) });
      console.error(`✗ -${item.index} ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(JSON.stringify({ slug: SLUG, model: MODEL, out: outDir, results: out }, null, 2));
  if (out.some((r) => !(r as { ok: boolean }).ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
