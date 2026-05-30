import path from "path";
import type { EditOptions, Orientation } from "./args";
import type { BizSize, ModelDef, Provider } from "../../lib/models";
import type { GenProvider } from "../../lib/providers/types";

export interface SourceRef {
  imageUrl: string;
  attribution?: unknown;
}

export interface RunDeps {
  getModel: (id: string) => ModelDef;
  getProvider: (p: Provider) => GenProvider;
  fetchSources: (keyword: string, orientation: Orientation, count: number) => Promise<SourceRef[]>;
  download: (url: string) => Promise<Buffer>;
  toWebp: (buf: Buffer, width: number, height: number) => Promise<Buffer>;
  compose: (original: Buffer, result: Buffer) => Promise<Buffer>;
  writeFile: (filePath: string, buf: Buffer) => Promise<void>;
}

export interface RunResultItem {
  file: string;
  index: number;
  ok: boolean;
  error?: string;
  sourceUrl?: string;
}

const SIZE_WH: Record<BizSize, { width: number; height: number }> = {
  "800x800": { width: 800, height: 800 },
  "800x1200": { width: 800, height: 1200 },
  "1200x800": { width: 1200, height: 800 },
};

export async function runEdit(opts: EditOptions, deps: RunDeps): Promise<RunResultItem[]> {
  const model = deps.getModel(opts.model);
  const provider = deps.getProvider(model.provider);

  // compare 生成走竖图 9:16（主体填满 600×800 半幅更好看），最终左右拼成 1200×800；其余按 opts.size
  const genSize: BizSize = opts.mode === "compare" ? "800x1200" : opts.size;
  const finalWH = SIZE_WH[opts.mode === "compare" ? "1200x800" : opts.size];

  const count = opts.mode === "single" ? 1 : opts.count;

  let sources: SourceRef[];
  if (/^https?:\/\//.test(opts.source)) {
    sources = Array.from({ length: count }, () => ({ imageUrl: opts.source }));
  } else {
    sources = await deps.fetchSources(opts.source, opts.orientation, count);
  }

  const results: RunResultItem[] = [];
  await Promise.all(
    sources.slice(0, count).map(async (src, i) => {
      const index = opts.start + i;
      const file = path.join(opts.out, `${opts.slug}-${index}.webp`);
      try {
        if (opts.noAi) {
          const buf = await deps.download(src.imageUrl);
          await deps.writeFile(file, await deps.toWebp(buf, finalWH.width, finalWH.height));
        } else {
          const { imageUrl: resultUrl } = await provider.generate({
            model: opts.model,
            prompt: opts.prompt,
            imageUrls: [src.imageUrl],
            size: model.sizeParam(genSize),
          });
          if (opts.mode === "compare") {
            const [orig, res] = await Promise.all([deps.download(src.imageUrl), deps.download(resultUrl)]);
            await deps.writeFile(file, await deps.compose(orig, res));
          } else {
            const res = await deps.download(resultUrl);
            await deps.writeFile(file, await deps.toWebp(res, finalWH.width, finalWH.height));
          }
        }
        results.push({ file, index, ok: true, sourceUrl: src.imageUrl });
      } catch (err) {
        results.push({ file, index, ok: false, error: err instanceof Error ? err.message : String(err), sourceUrl: src.imageUrl });
      }
    })
  );

  results.sort((a, b) => a.index - b.index);
  return results;
}
