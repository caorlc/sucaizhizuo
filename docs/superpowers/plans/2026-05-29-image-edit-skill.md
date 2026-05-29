# image-edit Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dialogue-driven, semantic-aware `image-edit` skill that reads a target page URL, generates landing-page assets (square hero / vertical showcase / before-after feature comparisons / vertical use-cases) via a pluggable model registry (default KIE `nano-banana-edit`), and outputs exact-size webp files.

**Architecture:** A TypeScript generation core in `lib/` (model registry + provider adapters + before/after compositor + Unsplash multi-fetch) is driven by a thin CLI `scripts/edit.ts`. The skill `.claude/skills/image-edit/SKILL.md` orchestrates the CLI: it extracts page semantics, plans assets, and calls the CLI once per asset. The existing Next.js web app and the `.codex` skill are left untouched.

**Tech Stack:** TypeScript, Node (ESM), `sharp` (image processing, already a dep), KIE.AI + Unsplash HTTP APIs (existing `lib/kie.ts`/`lib/unsplash.ts`), `tsx` (run TS scripts), `vitest` (tests).

---

## File Structure

**New (generation core + CLI):**
- `lib/models.ts` — model registry: `ModelDef`, `MODELS`, `getModel`, business-size → provider-size mapping. One responsibility: know which models exist and how to map sizes.
- `lib/providers/types.ts` — `GenInput`, `GenProvider` interfaces (shared, avoids import cycle).
- `lib/providers/kie.ts` — KIE adapter wrapping existing `createTask`/`pollTaskResult`.
- `lib/providers/index.ts` — `getProvider(provider)` registry lookup.
- `scripts/lib/args.ts` — pure CLI arg parsing → `EditOptions`.
- `scripts/lib/run.ts` — `runEdit(opts, deps)` orchestration (deps injected → unit-testable).
- `scripts/loadEnv.ts` — side-effect module: load `.env.local` into `process.env` (imported first).
- `scripts/edit.ts` — thin CLI entry: parse argv, wire real deps, run, print JSON.
- `vitest.config.ts` — test config.

**Modified:**
- `lib/unsplash.ts` — add `pickDistinct` (pure) + `searchUnsplashPhotos` (list, deduped).
- `lib/postprocess.ts` — add `composeComparison(originalBuf, resultBuf)` → 1200×800 webp buffer.
- `package.json` — add `vitest` + `tsx` devDeps; `"test"` + `"edit"` scripts.

**New (skill docs):**
- `.claude/skills/image-edit/SKILL.md` — interaction flow, semantic→asset mapping, scope presets, naming, validation.
- `.claude/skills/image-edit/references/prompt-patterns.md` — composition + action-figure prompt patterns.

**Untouched:** `app/**`, `lib/kie.ts`, `lib/storage.ts`, `lib/worker.ts`, `.codex/skills/feature-page-image-assets/**`.

---

## Task 1: Test infra + dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/smoke.test.ts` (temporary sanity test, deleted at end of task)

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest@^2.1.0 tsx@^4.19.0
```
Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Add npm scripts**

Edit `package.json` `"scripts"` block to add (keep existing dev/build/start/lint):
```json
    "test": "vitest run",
    "edit": "tsx scripts/edit.ts"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create a temporary sanity test `lib/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests, verify green**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Delete the sanity test and commit**

```bash
rm lib/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + tsx for image-edit skill tooling"
```

---

## Task 2: Model registry (`lib/models.ts`)

**Files:**
- Create: `lib/models.ts`
- Test: `lib/models.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/models.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getModel, MODELS, DEFAULT_MODEL } from "./models";

describe("models registry", () => {
  it("has nano-banana-edit as the default KIE edit model", () => {
    const m = getModel(DEFAULT_MODEL);
    expect(m.id).toBe("google/nano-banana-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
  });

  it("maps business sizes to KIE image_size params", () => {
    const m = getModel(DEFAULT_MODEL);
    expect(m.sizeParam("800x800")).toBe("1:1");
    expect(m.sizeParam("800x1200")).toBe("9:16");
    expect(m.sizeParam("1200x800")).toBe("16:9");
  });

  it("exposes the flux kontext models too", () => {
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-pro");
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-max");
  });

  it("throws a Chinese error on unknown model", () => {
    expect(() => getModel("nope")).toThrow(/未知模型/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/models.test.ts`
Expected: FAIL — cannot find module `./models`.

- [ ] **Step 3: Write the implementation**

`lib/models.ts`:
```ts
// 模型注册表：业务尺寸 → 各 provider 的尺寸参数；扩展模型只需加一条 MODELS。
export type Provider = "kie"; // 后续: | "openai" | "replicate"
export type BizSize = "800x800" | "800x1200" | "1200x800";

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  kind: "edit" | "t2i"; // edit 需输入图；t2i 纯文生图
  sizeParam: (size: BizSize) => string;
}

const KIE_SIZE: Record<BizSize, string> = {
  "800x800": "1:1",
  "800x1200": "9:16",
  "1200x800": "16:9",
};

export const MODELS: ModelDef[] = [
  { id: "google/nano-banana-edit", label: "Nano Banana Edit（默认）", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
  { id: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
  { id: "black-forest-labs/flux-kontext-max", label: "Flux Kontext Max", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
];

export const DEFAULT_MODEL = "google/nano-banana-edit";

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`未知模型：${id}，可用：${MODELS.map((x) => x.id).join(", ")}`);
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/models.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/models.ts lib/models.test.ts
git commit -m "feat: add pluggable model registry for image-edit"
```

---

## Task 3: Provider adapter layer (`lib/providers/`)

**Files:**
- Create: `lib/providers/types.ts`
- Create: `lib/providers/kie.ts`
- Create: `lib/providers/index.ts`
- Test: `lib/providers/kie.test.ts`

- [ ] **Step 1: Create the shared interfaces `lib/providers/types.ts`**

```ts
// provider 通用接口（单独成文件，避免 index ↔ kie 循环依赖）
export interface GenInput {
  model: string;
  prompt: string;
  imageUrls?: string[];
  size: string; // provider 原生尺寸参数，如 KIE "9:16"
}

export interface GenProvider {
  generate(input: GenInput): Promise<{ imageUrl: string }>;
}
```

- [ ] **Step 2: Write the failing test `lib/providers/kie.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../kie", () => ({
  createTask: vi.fn(async () => "task-123"),
  pollTaskResult: vi.fn(async () => "https://result/img.png"),
}));

import { createTask, pollTaskResult } from "../kie";
import { kieProvider } from "./kie";

describe("kie provider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a task with mapped params then returns the polled url", async () => {
    const out = await kieProvider.generate({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrls: ["https://src/a.jpg"],
      size: "9:16",
    });
    expect(createTask).toHaveBeenCalledWith({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrl: "https://src/a.jpg",
      imageSize: "9:16",
    });
    expect(pollTaskResult).toHaveBeenCalledWith("task-123");
    expect(out.imageUrl).toBe("https://result/img.png");
  });

  it("throws when no input image is provided (edit model needs one)", async () => {
    await expect(
      kieProvider.generate({ model: "m", prompt: "p", size: "1:1" })
    ).rejects.toThrow(/需要至少一张输入图/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/providers/kie.test.ts`
Expected: FAIL — cannot find module `./kie` (the provider).

- [ ] **Step 4: Implement `lib/providers/kie.ts`**

```ts
import { createTask, pollTaskResult, type KieImageSize } from "../kie";
import type { GenProvider, GenInput } from "./types";

export const kieProvider: GenProvider = {
  async generate(input: GenInput): Promise<{ imageUrl: string }> {
    const imageUrl = input.imageUrls?.[0];
    if (!imageUrl) throw new Error("KIE edit 模型需要至少一张输入图（imageUrls）");
    const taskId = await createTask({
      model: input.model,
      prompt: input.prompt,
      imageUrl,
      imageSize: input.size as KieImageSize,
    });
    const resultUrl = await pollTaskResult(taskId);
    return { imageUrl: resultUrl };
  },
};
```

- [ ] **Step 5: Implement `lib/providers/index.ts`**

```ts
import type { Provider } from "../models";
import type { GenProvider } from "./types";
import { kieProvider } from "./kie";

export type { GenProvider, GenInput } from "./types";

const REGISTRY: Record<Provider, GenProvider> = {
  kie: kieProvider,
};

export function getProvider(provider: Provider): GenProvider {
  const p = REGISTRY[provider];
  if (!p) throw new Error(`未知 provider：${provider}`);
  return p;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/providers/kie.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add lib/providers/
git commit -m "feat: add provider adapter layer with KIE adapter"
```

---

## Task 4: Unsplash multi-fetch + dedup (`lib/unsplash.ts`)

**Files:**
- Modify: `lib/unsplash.ts` (append; do not change existing exports)
- Test: `lib/unsplash.test.ts`

- [ ] **Step 1: Write the failing test `lib/unsplash.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pickDistinct } from "./unsplash";

const photo = (id: string) =>
  ({ id, urls: { regular: `r-${id}`, small: `s-${id}` }, user: { name: "", links: { html: "" } }, links: { html: "" } });

describe("pickDistinct", () => {
  it("dedupes by id and caps at n", () => {
    const out = pickDistinct([photo("a"), photo("a"), photo("b"), photo("c")] as any, 2);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
  });

  it("returns all distinct when fewer than n", () => {
    const out = pickDistinct([photo("a"), photo("b")] as any, 5);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/unsplash.test.ts`
Expected: FAIL — `pickDistinct` is not exported.

- [ ] **Step 3: Append implementation to `lib/unsplash.ts`** (after the existing `extractKeywordFromPrompt` function)

```ts
// 按 id 去重并随机洗牌，最多取 n 张
export function pickDistinct(photos: UnsplashPhoto[], n: number): UnsplashPhoto[] {
  const seen = new Set<string>();
  const distinct: UnsplashPhoto[] = [];
  for (const p of photos) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      distinct.push(p);
    }
  }
  for (let i = distinct.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distinct[i], distinct[j]] = [distinct[j], distinct[i]];
  }
  return distinct.slice(0, n);
}

// 搜索一批图片，去重后返回 count 张归属信息（用于 showcase 主体多样性）
export async function searchUnsplashPhotos(
  keyword: string,
  orientation: UnsplashOrientation,
  count: number,
  perPage = 30
): Promise<UnsplashAttribution[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY ?? "";
  if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY 未配置，请在 .env.local 中设置");

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", keyword);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url.toString(), { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (res.status === 429) throw new Error("Unsplash API 配额超限（429），请稍后再试");
  if (!res.ok) throw new Error(`Unsplash 搜索失败：HTTP ${res.status}`);

  const data = (await res.json()) as UnsplashSearchResponse;
  const distinct = pickDistinct(data.results ?? [], count);
  if (distinct.length === 0) throw new Error(`Unsplash 没有找到关键词「${keyword}」相关的图片`);

  return distinct.map((photo) => ({
    photographerName: photo.user.name,
    photographerUrl: photo.user.links.html,
    photoUrl: photo.links.html,
    imageUrl: photo.urls.regular,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/unsplash.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/unsplash.ts lib/unsplash.test.ts
git commit -m "feat: add Unsplash multi-fetch with id dedup"
```

---

## Task 5: Before/after compositor (`lib/postprocess.ts`)

**Files:**
- Modify: `lib/postprocess.ts` (append `composeComparison`)
- Test: `lib/postprocess.test.ts`

- [ ] **Step 1: Write the failing test `lib/postprocess.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { composeComparison } from "./postprocess";

async function solid(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer();
}

describe("composeComparison", () => {
  it("produces a 1200x800 webp from two source buffers", async () => {
    const before = await solid(400, 600);
    const after = await solid(400, 600);
    const out = await composeComparison(before, after);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/postprocess.test.ts`
Expected: FAIL — `composeComparison` is not exported.

- [ ] **Step 3: Append implementation to `lib/postprocess.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/postprocess.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/postprocess.ts lib/postprocess.test.ts
git commit -m "feat: add before/after comparison compositor"
```

---

## Task 6: CLI argument parsing (`scripts/lib/args.ts`)

**Files:**
- Create: `scripts/lib/args.ts`
- Test: `scripts/lib/args.test.ts`

- [ ] **Step 1: Write the failing test `scripts/lib/args.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  it("parses a result run with sensible defaults", () => {
    const o = parseArgs(["--prompt", "make figure", "--source", "puppy", "--slug", "afg", "--mode", "result", "--count", "4", "--size", "800x1200"]);
    expect(o).toMatchObject({
      model: "google/nano-banana-edit",
      mode: "result",
      count: 4,
      size: "800x1200",
      start: 1,
      orientation: "portrait",
      out: "output/image-edit/afg",
      noAi: false,
    });
  });

  it("defaults compare size to 1200x800 and orientation to portrait", () => {
    const o = parseArgs(["--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "compare"]);
    expect(o.size).toBe("1200x800");
    expect(o.orientation).toBe("portrait");
  });

  it("requires slug and source", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x"])).toThrow(/slug/);
    expect(() => parseArgs(["--prompt", "p", "--slug", "afg"])).toThrow(/source/);
  });

  it("requires prompt unless --no-ai", () => {
    expect(() => parseArgs(["--source", "x", "--slug", "afg"])).toThrow(/prompt/);
    const o = parseArgs(["--source", "dog", "--slug", "afg", "--mode", "single", "--size", "800x800", "--no-ai"]);
    expect(o.noAi).toBe(true);
  });

  it("rejects invalid mode and size", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--mode", "weird"])).toThrow(/mode/);
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--size", "100x100"])).toThrow(/size/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/args.test.ts`
Expected: FAIL — cannot find module `./args`.

- [ ] **Step 3: Implement `scripts/lib/args.ts`**

```ts
import { DEFAULT_MODEL, type BizSize } from "../../lib/models";

export type Mode = "single" | "result" | "compare";
export type Orientation = "portrait" | "landscape" | "squarish";

export interface EditOptions {
  model: string;
  prompt: string;
  source: string; // keyword | http(s) url
  mode: Mode;
  size: BizSize;
  count: number;
  slug: string;
  start: number;
  out: string;
  orientation: Orientation;
  noAi: boolean;
}

const SIZES: BizSize[] = ["800x800", "800x1200", "1200x800"];
const MODES: Mode[] = ["single", "result", "compare"];

function defaultOrientation(mode: Mode, size: BizSize): Orientation {
  if (mode === "compare") return "portrait";
  if (size === "800x800") return "squarish";
  if (size === "1200x800") return "landscape";
  return "portrait";
}

export function parseArgs(argv: string[]): EditOptions {
  const m: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      m[key] = next;
      i++;
    } else {
      flags.add(key);
    }
  }

  const mode = (m.mode ?? "result") as Mode;
  if (!MODES.includes(mode)) throw new Error(`--mode 只能是 ${MODES.join("|")}`);

  const size = (m.size ?? (mode === "compare" ? "1200x800" : "800x1200")) as BizSize;
  if (!SIZES.includes(size)) throw new Error(`--size 只能是 ${SIZES.join("|")}`);

  const noAi = flags.has("no-ai");
  if (!m.prompt && !noAi) throw new Error("缺少 --prompt（或加 --no-ai 仅裁切）");
  if (!m.slug) throw new Error("缺少 --slug");
  if (!m.source) throw new Error("缺少 --source");

  return {
    model: m.model ?? DEFAULT_MODEL,
    prompt: m.prompt ?? "",
    source: m.source,
    mode,
    size,
    count: m.count ? Math.max(1, parseInt(m.count, 10)) : 1,
    slug: m.slug,
    start: m.start ? parseInt(m.start, 10) : 1,
    out: m.out ?? `output/image-edit/${m.slug}`,
    orientation: (m.orientation as Orientation) ?? defaultOrientation(mode, size),
    noAi,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/args.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/args.ts scripts/lib/args.test.ts
git commit -m "feat: add image-edit CLI argument parsing"
```

---

## Task 7: Orchestration (`scripts/lib/run.ts`)

**Files:**
- Create: `scripts/lib/run.ts`
- Test: `scripts/lib/run.test.ts`

- [ ] **Step 1: Write the failing test `scripts/lib/run.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { runEdit, type RunDeps } from "./run";
import { parseArgs } from "./args";

function fakeDeps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    getModel: () => ({ id: "m", label: "m", provider: "kie", kind: "edit", sizeParam: () => "9:16" }),
    getProvider: () => ({ generate: vi.fn(async () => ({ imageUrl: "https://res/x.png" })) }),
    fetchSources: vi.fn(async (_k, _o, n) => Array.from({ length: n }, (_v, i) => ({ imageUrl: `https://src/${i}.jpg` }))),
    download: vi.fn(async () => Buffer.from("img")),
    toWebp: vi.fn(async () => Buffer.from("webp")),
    compose: vi.fn(async () => Buffer.from("composed")),
    writeFile: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runEdit", () => {
  it("result mode: writes N files named slug-<start..>", async () => {
    const writeFile = vi.fn(async () => {});
    const opts = parseArgs(["--prompt", "p", "--source", "puppy", "--slug", "afg", "--mode", "result", "--count", "3", "--start", "2", "--size", "800x1200", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ writeFile }));
    expect(res.map((r) => r.index)).toEqual([2, 3, 4]);
    expect(res.every((r) => r.ok)).toBe(true);
    const names = writeFile.mock.calls.map((c) => c[0]);
    expect(names).toContain("out/afg-2.webp");
    expect(names).toContain("out/afg-4.webp");
  });

  it("compare mode: composes instead of plain webp", async () => {
    const compose = vi.fn(async () => Buffer.from("c"));
    const opts = parseArgs(["--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "compare", "--count", "1", "--out", "out"]);
    await runEdit(opts, fakeDeps({ compose }));
    expect(compose).toHaveBeenCalledOnce();
  });

  it("no-ai single: skips provider.generate, crops the source", async () => {
    const generate = vi.fn();
    const opts = parseArgs(["--source", "dog", "--slug", "afg", "--mode", "single", "--size", "800x800", "--no-ai", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ getProvider: () => ({ generate }) }));
    expect(generate).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
  });

  it("records a failed item instead of throwing when generate rejects", async () => {
    const opts = parseArgs(["--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "result", "--count", "1", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ getProvider: () => ({ generate: vi.fn(async () => { throw new Error("boom"); }) }) }));
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toBe("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/run.test.ts`
Expected: FAIL — cannot find module `./run`.

- [ ] **Step 3: Implement `scripts/lib/run.ts`**

```ts
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

  // compare 生成走竖图 9:16，最终合成 1200×800；其余按 opts.size
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/run.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/run.ts scripts/lib/run.test.ts
git commit -m "feat: add image-edit orchestration (runEdit) with injected deps"
```

---

## Task 8: Env loader + CLI entry (`scripts/loadEnv.ts`, `scripts/edit.ts`)

**Files:**
- Create: `scripts/loadEnv.ts`
- Create: `scripts/edit.ts`

No unit test (pure wiring + I/O); verified end-to-end in Task 9.

- [ ] **Step 1: Create `scripts/loadEnv.ts`** (side-effect: must be imported before any module that reads env at load time)

```ts
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
```

- [ ] **Step 2: Create `scripts/edit.ts`**

```ts
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
```

- [ ] **Step 3: Type-check + lint the new files**

Run: `npx tsc --noEmit`
Expected: no errors. (If `--env-file`/import-order doubts arise, they are validated at runtime in Task 9.)

- [ ] **Step 4: Verify the CLI shows a clear error with no args (no network)**

Run: `npx tsx scripts/edit.ts`
Expected: prints `缺少 --prompt（或加 --no-ai 仅裁切）` (or the first failing validation) and exits non-zero. No network call made.

- [ ] **Step 5: Commit**

```bash
git add scripts/loadEnv.ts scripts/edit.ts
git commit -m "feat: add image-edit CLI entry + env loader"
```

---

## Task 9: End-to-end smoke verification (real APIs)

**Files:** none (verification only)

> Requires `.env.local` at project root with valid `KIE_API_KEY` and `UNSPLASH_ACCESS_KEY` (same keys the web app uses; create from the README instructions if absent). This task spends real KIE credits — keep counts at 1.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass (models, kie provider, unsplash, postprocess, args, run).

- [ ] **Step 2: Smoke a single showcase vertical**

Run:
```bash
npx tsx scripts/edit.ts --model "google/nano-banana-edit" \
  --prompt "Turn the subject into a cute collectible blister-pack action figure, studio lighting, clean background" \
  --source "puppy" --mode result --count 1 --size 800x1200 \
  --slug smoke-test --start 1 --out output/image-edit/smoke-test
```
Expected: JSON with `results[0].ok === true`; file `output/image-edit/smoke-test/smoke-test-1.webp` created.

- [ ] **Step 3: Verify the showcase output dimensions**

Run:
```bash
npx tsx -e "import('sharp').then(s=>s.default('output/image-edit/smoke-test/smoke-test-1.webp').metadata().then(m=>console.log(m.format,m.width,m.height)))"
```
Expected: `webp 800 1200`.

- [ ] **Step 4: Smoke a single before/after comparison**

Run:
```bash
npx tsx scripts/edit.ts --model "google/nano-banana-edit" \
  --prompt "Turn the pet into a collectible blister-pack action figure, studio lighting" \
  --source "puppy" --mode compare --count 1 \
  --slug smoke-test --start 6 --out output/image-edit/smoke-test
```
Expected: JSON `ok`; file `smoke-test-6.webp` created.

- [ ] **Step 5: Verify the comparison output dimensions**

Run:
```bash
npx tsx -e "import('sharp').then(s=>s.default('output/image-edit/smoke-test/smoke-test-6.webp').metadata().then(m=>console.log(m.format,m.width,m.height)))"
```
Expected: `webp 1200 800`.

- [ ] **Step 6: Open both files and eyeball them**

Run: `open output/image-edit/smoke-test/smoke-test-1.webp output/image-edit/smoke-test/smoke-test-6.webp`
Expected: vertical = an action-figure result; horizontal = left real photo, right figure, with Before/After labels, no arrow.

- [ ] **Step 7: Clean up smoke output (do not commit generated images)**

Run: `rm -rf output/image-edit/smoke-test`
Expected: removed. (Generated images are not committed; only code + skill docs are.)

---

## Task 10: Skill document (`.claude/skills/image-edit/SKILL.md`)

**Files:**
- Create: `.claude/skills/image-edit/SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

````markdown
---
name: image-edit
description: "用对话方式、按页面语义为功能页/落地页生成可上线配图：读取用户给的目标页 URL 理解语义，结合用户的 prompt 和所选模型出图，支持 before/after 对比合成，输出精确尺寸 webp。当用户提供页面 URL 并要求生成配图、feature images、use-case images、showcase 图、对比图、before/after、手办/风格化配图、或要求用 nano-banana-edit 等模型按 prompt 改图时，必须使用本 skill。模型可插拔（默认 google/nano-banana-edit，经 KIE）。面向用户的沟通用中文；图像 prompt 可用英文。本 skill 与 .codex 的 feature-page-image-assets（gpt-image）相互独立、互不调用。"
---

# image-edit

## 概述

对话驱动、语义感知的出图 skill。给定**目标页 URL + 用户 prompt + 模型**，读页面语义决定每张图画什么，用所选模型（默认 KIE `google/nano-banana-edit`）出图，features 自动合成 before/after，最终一律输出精确尺寸 `.webp`。

生成由 `scripts/edit.ts` 完成；本 skill 负责语义提取、范围确认、prompt 规划、命名、调用脚本与校验。

## 输出语言

面向用户的范围确认、资产计划、进度、路径、校验、汇报用**中文**。图像 prompt 可用英文（出图更稳）；汇报时给中文摘要，不贴长英文 prompt 除非用户要求。文件名、slug、URL、命令保持原样。

## 工作流

1. **收集输入**
   - 必需：目标页 URL（用于语义 + slug）。可缺省时问用户。
   - 必需：base prompt（转换风格，如「把主体做成吸塑盒收藏手办」）。
   - 模型：默认 `google/nano-banana-edit`；用户可换（见「可用模型」）。
   - 可选：竞品参考页 URL（**只抽象学构图，不复用其图片/人物/logo/文案**）。

2. **提取页面语义**
   - 运行 `python3 .codex/skills/feature-page-image-assets/scripts/extract_page_copy.py "<url>"` 拿干净文案与候选区块。
   - 动态渲染抓不到时，改用浏览器或请用户粘贴文案。
   - 从 URL 末段取 slug（本地化 URL 去掉 locale 段，保留功能 slug）。

3. **问输出范围**（用户只选不背；可多选；数量/尺寸/起始编号可当场覆盖）

   | 范围 | 数量 | 尺寸 | 模式 | 默认编号 |
   | --- | ---: | --- | --- | --- |
   | hero 原图 input | 1 | 800×800 | single（真实照片，可加 `--no-ai` 仅裁切） | `-1` |
   | showcase | 4 | 800×1200 | result | `-2…-5` |
   | features | 3 | 1200×800 | compare（before/after） | `-6…-8` |
   | use cases | 3 | 800×1200 | result | `-9…-11` |
   | 全套落地页 | 11 | 上面全部 | 混合 | `-1…-11` |
   | 单张/一次性 | 自定义 | 自定义 | single/result/compare | 用户给名 |

4. **规划资产（贴合语义）**
   - base prompt 提供**风格**；URL 语义决定**每张画什么**。
   - 每个资产单独一条 prompt：`<base 风格> + <该区块语义意图>`；源图关键词从该区块语义派生（如某 use-case 讲「宠物礼物」→ 关键词 `puppy`/`dog`）。
   - showcase 主体彼此错开、不雷同；features 每张对应一个功能卖点（before=真实照片，after=AI 结果）；use-case 每张对应页面里一个真实场景。
   - 同批先排「布局差异矩阵」，避免换皮重复（详见 `references/prompt-patterns.md`）。
   - 不出可读文字、logo、水印、假 UI、网页截图；不把竞品图当参考素材。
   - 把计划（每张：尺寸/模式/源图关键词/中文 prompt 摘要/文件名）念给用户确认后再生成。

5. **生成**：逐张调用 CLI（features 用 `--mode compare`）：
   ```bash
   npx tsx scripts/edit.ts --model "<model>" --prompt "<english prompt>" \
     --source "<keyword|http-url>" --mode <single|result|compare> \
     --size <800x800|800x1200|1200x800> --count <n> \
     --slug <slug> --start <n> --out output/image-edit/<slug>
   ```
   - 一个共享主体批量时一条命令 `--count n` 取不同源图；不同区块/不同 prompt 分多条命令。
   - CLI 打印 JSON（每张 file/ok/error/sourceUrl）；读它判断成败。

6. **校验**
   - 确认每个文件存在、是 `.webp`、尺寸精确（用 sharp 或 `sips -g pixelWidth -g pixelHeight <file>`）。
   - 抽检整体重复度；多张像同一模板换皮就改 prompt 重生那几张。
   - 失败项重跑（换关键词或重试）。
   - 用中文汇报保存路径、每张 prompt 摘要、限制。

## 可用模型

- `google/nano-banana-edit`（默认）
- `black-forest-labs/flux-kontext-pro`
- `black-forest-labs/flux-kontext-max`

加模型：编辑 `lib/models.ts`；加非 KIE 厂商：在 `lib/providers/` 加适配器（实现 `GenProvider`）并注册。

## 命名规则

- slug 前缀 + 连字符编号：`<slug>-6.webp`（不用下划线）。
- 编号按页面区块顺序稳定，沿用上表默认；用户指定起始编号则用用户的。

## 何时提问

URL 与文案明确时做合理假设直接干。仅在以下情况简短提问：URL 抓不到且无文案/截图；区块数量与默认不符导致资产数不明；用户需要特定目录/命名/视觉风格而页面无法判断。

## 常用命令

提取文案：
```bash
python3 .codex/skills/feature-page-image-assets/scripts/extract_page_copy.py "<url>"
```
校验尺寸（macOS 无 ImageMagick 时）：
```bash
sips -g pixelWidth -g pixelHeight output/image-edit/<slug>/<slug>-2.webp
```

## 前置条件

项目根存在 `.env.local`，含 `KIE_API_KEY` 与 `UNSPLASH_ACCESS_KEY`（见 README）。缺失时 CLI 会给出中文报错。
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/image-edit/SKILL.md
git commit -m "docs: add image-edit SKILL.md"
```

---

## Task 11: Prompt patterns reference (`.claude/skills/image-edit/references/prompt-patterns.md`)

**Files:**
- Create: `.claude/skills/image-edit/references/prompt-patterns.md`

- [ ] **Step 1: Write `prompt-patterns.md`**

````markdown
# Prompt 模式（image-edit）

把这些当起点，生成前用页面真实语义替换主题细节。面向用户用中文，图像 prompt 用英文。

## 通用约束（多数 prompt 都加）

- 明确最终尺寸方向：`<width>x<height>`。
- 大品牌功能页构图：一个主视觉、充足留白、高级光影、安静背景；主体占 60–75%；最多 3 个视觉模块。
- 不出可读文字、logo、水印、假 UI、网页截图。
- 竞品页只抽象学构图，不复用其图片/人物/品牌色/文案。
- before/after 的 before = 真实照片，after = AI 结果；本 skill 的 compare 模式会自动左右合成，**prompt 里不要画对比框/Before-After 字样**（合成器会加标签）。

## 同批布局差异规则

一次出多张时先分配不同布局 archetype，避免「居中大圆角结果卡 + 小副卡 + 浅影棚」连续换皮：相邻图至少改 3 个维度（主体类型、主体比例、背景/光线、镜头距离、构图方向）。语义优先，每张仍要表达对应区块利益点。出图后抽检重复度，像换皮就重写。

## hero 原图 input（800×800，single）

表现「典型输入照片」：一张干净、真实、可爱的主体照片（贴合页面主题，如宠物/人物），自然光、简单背景。可 `--no-ai` 直接用真实照片裁切。

```text
Clean realistic reference photo of a single cute subject (matching the page theme), centered, soft natural light, simple uncluttered background, square 800x800.
```

## showcase（800×1200，result）

主题下不同主体的成片，竖构图，主体彼此错开。

```text
Premium vertical showcase of the AI-generated result as one oversized hero subject, studio-quality lighting, restrained soft glow, generous negative space, clean background, 800x1200, no text no logo.
```

## features 对比（1200×800，compare）

每张对应一个功能卖点。只写「after 结果该长什么样」，合成器负责左右拼与标签。

```text
High-quality result of the subject transformed into a collectible blister-pack action figure, accurate likeness, premium toy materials, soft studio lighting, clean background, portrait framing.
```

## use cases（800×1200，result）

每张对应页面里一个真实 use-case 场景，一个强场景/最终交付物，不堆多例子。

```text
Single strong real-world use-case scene expressing <该 use-case 语义>, one dominant result subject, cinematic but clean lighting, generous whitespace, 800x1200, no platform logos no readable text.
```

## 手办化（action figure）专用提示

- 强调相似度（accurate likeness）、玩具材质（vinyl/resin/plush 视主题）、吸塑盒/底座等收藏品语汇。
- 主体清晰、背景干净，避免桌面道具堆叠与密集分镜。
- 动物主题用 `puppy`/`dog`/`cat` 等源图关键词；人物主题用 `portrait`/`person`。
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/image-edit/references/prompt-patterns.md
git commit -m "docs: add image-edit prompt patterns reference"
```

---

## Final verification

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm no generated images staged**

Run: `git status`
Expected: only code + skill docs committed; `output/image-edit/smoke-test` absent.
