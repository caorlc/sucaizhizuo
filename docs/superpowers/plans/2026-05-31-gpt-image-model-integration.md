# GPT Image 模型接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 image-edit skill 与配套网页中接入第三个 KIE 图片模型 `gpt-image-2-image-to-image`（GPT Image 图生图）。

**Architecture:** 把「KIE input 请求体」的拼装下放到模型注册表（每个模型用一个 `buildInput` 函数声明自己的 `input` 对象），`createTask` 改为通用「发任务/取结果」。网页下拉框改为从 `lib/models.ts` 派生，消除重复清单。`createTask`/`pollTaskResult` 共用现有 KIE jobs API，轮询逻辑不动。

**Tech Stack:** TypeScript, Next.js 14, Vitest, KIE.AI jobs API, sharp。

参考 spec：`docs/superpowers/specs/2026-05-31-gpt-image-model-integration-design.md`

---

## File Structure

- `lib/models.ts`（改）— 模型注册表：新增 `BuildInputArgs` 类型、`ModelDef.buildInput` 字段、两个请求体工厂、GPT 模型行。
- `lib/models.test.ts`（改）— 注册表测试：模型数量、GPT 的 `sizeParam` 与 `buildInput` 形状。
- `lib/kie.ts`（改）— `createTask` 改为经 `getModel(...).buildInput(...)` 拼 body。
- `lib/kie.test.ts`（新）— mock `fetch`，锁定各模型经 `createTask` 拼出的请求体。
- `app/page.tsx`（改）— 下拉框 MODELS 改为从 `lib/models.ts` 派生。
- `.claude/skills/image-edit/SKILL.md`（改）— 「可用模型」两项 → 三项。

调用点 `scripts/lib/run.ts`、`lib/worker.ts`、`lib/providers/kie.ts` 因 `createTask` 签名不变而**无需改动**。

---

### Task 1: 模型注册表加 `buildInput` 与 GPT 模型

**Files:**
- Modify: `lib/models.ts`
- Test: `lib/models.test.ts`

- [ ] **Step 1: 更新测试 — 数量改三个，新增 GPT 的 sizeParam 与 buildInput 断言**

把 `lib/models.test.ts` 中「contains exactly nano-banana-edit and seedream-v4-edit」这条测试替换为下面这条，并在 `describe` 块内追加两条新测试：

```ts
  it("contains nano-banana-edit, seedream-v4-edit and gpt-image-2-image-to-image", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "google/nano-banana-edit",
      "bytedance/seedream-v4-edit",
      "gpt-image-2-image-to-image",
    ]);
  });

  it("registers gpt-image-2-image-to-image as a KIE edit model with aspect_ratio sizes", () => {
    const m = getModel("gpt-image-2-image-to-image");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
    expect(m.sizeParam("800x800")).toBe("1:1");
    expect(m.sizeParam("800x1200")).toBe("9:16");
    expect(m.sizeParam("1200x800")).toBe("16:9");
  });

  it("builds the GPT image input body (input_urls + aspect_ratio + resolution, no image_size)", () => {
    const input = getModel("gpt-image-2-image-to-image").buildInput({
      prompt: "p",
      imageUrls: ["https://src/x.jpg"],
      size: "16:9",
    });
    expect(input).toEqual({
      prompt: "p",
      input_urls: ["https://src/x.jpg"],
      aspect_ratio: "16:9",
      resolution: "1K",
    });
    expect(input.image_size).toBeUndefined();
  });

  it("builds the legacy edit input body for nano-banana (image_urls + image_size + output_format)", () => {
    const input = getModel("google/nano-banana-edit").buildInput({
      prompt: "p",
      imageUrls: ["https://src/y.jpg"],
      size: "9:16",
    });
    expect(input).toEqual({
      prompt: "p",
      image_urls: ["https://src/y.jpg"],
      output_format: "png",
      image_size: "9:16",
    });
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run lib/models.test.ts`
Expected: FAIL —「contains ...」断言长度不符 / `buildInput is not a function` / `getModel("gpt-...")` 抛「未知模型」。

- [ ] **Step 3: 实现 — 改写 `lib/models.ts`**

把 `lib/models.ts` 整个文件替换为：

```ts
// 模型注册表：业务尺寸 → 各 provider 的尺寸参数；扩展模型只需加一条 MODELS。
export type Provider = "kie"; // 后续: | "openai" | "replicate"
export type BizSize = "800x800" | "800x1200" | "1200x800";

// KIE createTask 的 input 对象由各模型自己拼（键名/额外字段因模型而异）
export interface BuildInputArgs {
  prompt: string;
  imageUrls: string[];
  size: string; // 已解析的 provider 原生尺寸串，如 "9:16" / "square_hd"
}

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  kind: "edit" | "t2i"; // edit 需输入图；t2i 纯文生图
  sizeParam: (size: BizSize) => string;
  buildInput: (p: BuildInputArgs) => Record<string, unknown>;
}

const KIE_SIZE: Record<BizSize, string> = {
  "800x800": "1:1",
  "800x1200": "9:16",
  "1200x800": "16:9",
};

// Seedream V4 用自己的 image_size 词表；比例与 KIE_SIZE 对齐（1:1 / 9:16 / 16:9）
const SEEDREAM_SIZE: Record<BizSize, string> = {
  "800x800": "square_hd",
  "800x1200": "portrait_16_9",
  "1200x800": "landscape_16_9",
};

// nano-banana / seedream 共用：image_urls + image_size + output_format
const kieEditInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt,
  image_urls: p.imageUrls,
  output_format: "png",
  image_size: p.size,
});

// GPT Image 图生图：input_urls + aspect_ratio + 固定 1K 分辨率（1:1 禁 4K，故不触发）
const gptImageInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt,
  input_urls: p.imageUrls,
  aspect_ratio: p.size,
  resolution: "1K",
});

export const MODELS: ModelDef[] = [
  { id: "google/nano-banana-edit", label: "Nano Banana Edit", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s], buildInput: kieEditInput },
  { id: "bytedance/seedream-v4-edit", label: "Seedream V4 Edit", provider: "kie", kind: "edit", sizeParam: (s) => SEEDREAM_SIZE[s], buildInput: kieEditInput },
  { id: "gpt-image-2-image-to-image", label: "GPT Image (image-to-image)", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s], buildInput: gptImageInput },
];

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`未知模型：${id}，可用：${MODELS.map((x) => x.id).join(", ")}`);
  return m;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run lib/models.test.ts`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 提交**

```bash
git add lib/models.ts lib/models.test.ts
git commit -m "feat(models): add buildInput per model + gpt-image-2-image-to-image"
```

---

### Task 2: `createTask` 经注册表拼请求体

**Files:**
- Modify: `lib/kie.ts`
- Test: `lib/kie.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — 新建 `lib/kie.test.ts`**

创建 `lib/kie.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// kie.ts 在模块加载时读取 KIE_API_KEY，必须在 import 前用 vi.hoisted 设好
vi.hoisted(() => {
  process.env.KIE_API_KEY = "test-key";
});

import { createTask } from "./kie";

function mockFetchOk() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 200, msg: "success", data: { taskId: "t-1" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createTask request body per model", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("builds legacy edit body for nano-banana (image_urls + image_size)", async () => {
    const fetchMock = mockFetchOk();
    const taskId = await createTask({
      model: "google/nano-banana-edit",
      prompt: "make a figure",
      imageUrl: "https://src/a.jpg",
      imageSize: "9:16",
    });
    expect(taskId).toBe("t-1");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("google/nano-banana-edit");
    expect(body.input).toEqual({
      prompt: "make a figure",
      image_urls: ["https://src/a.jpg"],
      output_format: "png",
      image_size: "9:16",
    });
  });

  it("builds GPT image body (input_urls + aspect_ratio + resolution, no image_size)", async () => {
    const fetchMock = mockFetchOk();
    await createTask({
      model: "gpt-image-2-image-to-image",
      prompt: "edit it",
      imageUrl: "https://src/b.jpg",
      imageSize: "16:9",
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-image-2-image-to-image");
    expect(body.input).toEqual({
      prompt: "edit it",
      input_urls: ["https://src/b.jpg"],
      aspect_ratio: "16:9",
      resolution: "1K",
    });
    expect(body.input.image_size).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run lib/kie.test.ts`
Expected: FAIL —当前 `createTask` 拼的 body 对所有模型都是 `image_urls`/`image_size`/`output_format`，GPT 用例的 `toEqual` 不匹配。

- [ ] **Step 3: 实现 — 改 `lib/kie.ts`**

在 `lib/kie.ts` 顶部（紧跟首行注释之后）加入 import：

```ts
import { getModel } from "./models";
```

把 `createTask` 函数替换为：

```ts
export async function createTask(params: {
  model: string;
  prompt: string;
  imageUrl: string;
  imageSize?: string;
}): Promise<string> {
  const input = getModel(params.model).buildInput({
    prompt: params.prompt,
    imageUrls: [params.imageUrl],
    size: params.imageSize ?? "auto",
  });

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: params.model,
      input,
    }),
  });

  if (res.status === 429) {
    throw new Error("KIE.AI 接口限流（429），请稍候再试");
  }
  if (!res.ok) {
    throw new Error(`KIE.AI createTask 失败：HTTP ${res.status}`);
  }

  const json = (await res.json()) as KieCreateTaskResponse;
  if (json.code !== 200) {
    throw new Error(`KIE.AI createTask 错误：${json.msg}`);
  }

  return json.data.taskId;
}
```

（`pollTaskResult`、类型定义、`getHeaders`、常量均不动。）

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run lib/kie.test.ts lib/models.test.ts lib/providers/kie.test.ts`
Expected: PASS（新 kie 用例绿；models 与 provider 既有用例仍绿——provider 测试 mock 了 `../kie`，不受影响）。

- [ ] **Step 5: 提交**

```bash
git add lib/kie.ts lib/kie.test.ts
git commit -m "feat(kie): build createTask body via model registry buildInput"
```

---

### Task 3: 网页下拉框改为单一数据源

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 加 import（在第 5 行 `@/lib/aspect` import 之后另起一行）**

```ts
import { MODELS as MODEL_DEFS } from "@/lib/models";
```

- [ ] **Step 2: 用派生数组替换硬编码的 MODELS（当前第 22-25 行）**

把：

```ts
const MODELS = [
  { value: "google/nano-banana-edit", label: "google/nano-banana-edit（默认）" },
  { value: "bytedance/seedream-v4-edit", label: "bytedance/seedream-v4-edit" },
];
```

替换为：

```ts
const MODELS = MODEL_DEFS.map((m, i) => ({
  value: m.id,
  label: i === 0 ? `${m.id}（默认）` : m.id,
}));
```

`MODELS[0].value`（useState 默认值）与 `MODELS.map(...)`（option 渲染）因结构仍是 `{ value, label }` 而无需改动。

- [ ] **Step 3: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误（退出码 0）。

- [ ] **Step 4: 提交**

```bash
git add app/page.tsx
git commit -m "refactor(web): derive model dropdown from lib/models registry"
```

---

### Task 4: 更新 SKILL.md「可用模型」

**Files:**
- Modify: `.claude/skills/image-edit/SKILL.md`

- [ ] **Step 1: 改「可用模型」段（当前第 79-82 行）**

把：

```
未指定模型时，用 `AskUserQuestion` 列出下面两项让用户选（附简介），不静默默认：

- `google/nano-banana-edit` —— 通用、稳、快
- `bytedance/seedream-v4-edit` —— Seedream 4.0，多主体一致性 / 复杂编辑强
```

替换为：

```
未指定模型时，用 `AskUserQuestion` 列出下面三项让用户选（附简介），不静默默认：

- `google/nano-banana-edit` —— 通用、稳、快
- `bytedance/seedream-v4-edit` —— Seedream 4.0，多主体一致性 / 复杂编辑强
- `gpt-image-2-image-to-image` —— OpenAI GPT Image 图生图，指令遵循强、风格化稳，支持多图输入
```

- [ ] **Step 2: 提交**

```bash
git add .claude/skills/image-edit/SKILL.md
git commit -m "docs(image-edit): list gpt-image-2-image-to-image as a third model"
```

---

### Task 5: 全量验证（含一次真实出图）

**Files:** 无（仅运行与核验）

- [ ] **Step 1: 跑全部单测**

Run: `npm test`
Expected: 所有测试文件 PASS。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 退出码 0，无类型错误。

- [ ] **Step 3: 真实出图冒烟（需 `.env.local` 含 `KIE_API_KEY` 与 `UNSPLASH_ACCESS_KEY`；会调用真实 API 并产生费用）**

Run:
```bash
npm run edit -- --model gpt-image-2-image-to-image \
  --prompt "Convert this photo into a minimalist black line drawing on white background." \
  --source portrait --mode single --size 800x800 --count 1 \
  --slug gpt-smoke --start 1 --out output/image-edit/_smoke
```
Expected: 打印的 JSON 里 `results[0].ok === true` 且有 `file`；无「未知模型」「createTask 失败」「生成超时」等报错。
> 若报模型 id 相关错误，说明文档里的 `gpt-image-2-image-to-image` 字符串需要更正（spec 已记此风险）——回到 Task 1 改 id 并重跑。

- [ ] **Step 4: 核验产物尺寸与格式**

Run: `sips -g pixelWidth -g pixelHeight output/image-edit/_smoke/gpt-smoke-1.webp`
Expected: `pixelWidth: 800` 且 `pixelHeight: 800`。

- [ ] **Step 5: 清理冒烟产物**

Run: `rm -rf output/image-edit/_smoke`
Expected: 目录被删除（冒烟图不入库、不提交）。

- [ ] **Step 6: 确认工作区干净**

Run: `git status`
Expected: 无未跟踪/未提交的代码改动（冒烟产物已清理；前 4 个 Task 均已各自提交）。

---

## Self-Review

**Spec coverage：**
- 模型注册表 + buildInput + GPT 行 → Task 1 ✔
- createTask 通用化（签名不变、调用点零改） → Task 2 ✔
- 网页下拉单一数据源 → Task 3 ✔
- SKILL.md 两项→三项 → Task 4 ✔
- 测试（models / kie / provider） → Task 1、2 ✔
- 验证（vitest + 真实出图 + sips 尺寸 + 两个假设） → Task 5 ✔
- resolution 固定 1K → Task 1 的 `gptImageInput` ✔

**Placeholder scan：** 无 TBD/TODO；每个代码步骤都给出完整代码与确切命令。

**Type consistency：** `BuildInputArgs`、`ModelDef.buildInput`、`getModel`、`MODELS`、`kieEditInput`/`gptImageInput` 在 Task 1 定义，Task 2 的 `createTask` 调用 `getModel(...).buildInput(...)` 与之一致；Task 3 的 `MODEL_DEFS`（即 `MODELS`）元素含 `.id`，与注册表一致。
