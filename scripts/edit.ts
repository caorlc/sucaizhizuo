import "./loadEnv"; // 必须第一行：在导入读 env 的 lib 之前填充 process.env
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { parseArgs } from "./lib/args";
import { runEdit, type RunDeps, type SourceRef } from "./lib/run";
import { getModel } from "../lib/models";
import { getProvider } from "../lib/providers";
import { searchUnsplashPhotos } from "../lib/unsplash";
import { composeComparison } from "../lib/postprocess";

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败：${url} HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function toWebp(buf: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buf).resize(width, height, { fit: "cover", position: "centre" }).webp({ quality: 90 }).toBuffer();
}

const deps: RunDeps = {
  getModel,
  getProvider,
  async fetchSources(keyword, orientation, count): Promise<SourceRef[]> {
    const photos = await searchUnsplashPhotos(keyword, orientation, count);
    return photos.map((p) => ({ imageUrl: p.imageUrl, attribution: p }));
  },
  download,
  toWebp,
  compose: composeComparison,
  async writeFile(filePath, buf) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buf);
  },
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const results = await runEdit(opts, deps);
  console.log(JSON.stringify({ slug: opts.slug, mode: opts.mode, model: opts.model, out: opts.out, results }, null, 2));
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
