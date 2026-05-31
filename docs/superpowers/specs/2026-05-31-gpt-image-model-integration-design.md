# 接入 GPT Image 图生图模型（gpt-image-2-image-to-image）

日期：2026-05-31
状态：设计已认可，待写实现计划

## 目标

在 image-edit skill 和配套网页应用中，接入第三个 KIE 图片模型
`gpt-image-2-image-to-image`（OpenAI GPT Image，图生图），让它和现有
`google/nano-banana-edit`、`bytedance/seedream-v4-edit` 一样可选可用。

文档：https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image

## 背景与现状

现有两个模型都经 KIE 统一 jobs API 调用：
- 建任务：`POST /api/v1/jobs/createTask`
- 轮询：`GET /api/v1/jobs/recordInfo?taskId=...`，成功后 `JSON.parse(data.resultJson).resultUrls[0]`

`lib/kie.ts` 的 `createTask` 把请求体写死成 nano-banana / seedream 的形状：

```jsonc
{ "model": "<id>", "input": {
    "prompt": "...", "image_urls": ["<url>"],
    "output_format": "png", "image_size": "<resolved>" } }
```

两个调用点在调用前已用 `model.sizeParam(...)` 把业务比例解析成 provider 原生尺寸串：
- `scripts/lib/run.ts:66`（skill）
- `lib/worker.ts:49`（网页 worker）

## 关键差异：GPT Image 的请求体不同

| 字段 | 老模型（nano/seedream） | GPT Image |
| --- | --- | --- |
| 输入图键名 | `image_urls`（数组） | `input_urls`（数组，≤16 张） |
| 尺寸键名 | `image_size` | `aspect_ratio` |
| 尺寸取值 | `1:1`/`9:16`/`16:9`（KIE_SIZE）或 seedream 词表 | `auto`/`1:1`/`16:9`/`9:16`/… |
| 额外字段 | `output_format: "png"` | `resolution: "1K"`（无 output_format） |
| 4K 限制 | 无 | 1:1 不能选 4K（本次硬编码 1K，不触发） |

**有利点**：GPT 的 `aspect_ratio` 枚举里就含 `1:1`/`9:16`/`16:9`，与 `KIE_SIZE`
产出的值完全一致。所以 GPT 的 `sizeParam` 可直接复用 `KIE_SIZE`，无需新尺寸表；
真正的差异只在「请求体的键名 + 额外的 resolution」。

`createTask` 与 `pollTaskResult` 共用同一套 KIE jobs API，轮询解析逻辑预期通用、不改。

## 决策记录

1. **分辨率**：GPT Image 的 `resolution` 硬编码 `"1K"`。最终产物都会被 sharp 裁切成
   ≤1200px 的 webp，1K 足够；同时规避「1:1 禁 4K」的限制。（用户确认）
2. **架构（方式 A）**：把「KIE input 请求体」的拼装下放到模型注册表，每个模型自己
   声明它的 `input` 对象；`createTask` 回归通用「发任务/取结果」职责。契合现有
   「扩展模型只需加一条 MODELS」的可插拔设计，且两个调用点签名零改动。
3. **单一数据源（最佳实践）**：网页下拉框改为从 `lib/models.ts` 的 MODELS 派生，
   消除 `app/page.tsx` 里那份独立的硬编码模型清单，根治网页/skill 清单漂移。

## 设计

### 1. `lib/models.ts`（核心）

给 `ModelDef` 增加 `buildInput` 字段，抽出两个请求体工厂，新增 GPT 模型行：

```ts
export interface BuildInputArgs { prompt: string; imageUrls: string[]; size: string }

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  kind: "edit" | "t2i";
  sizeParam: (size: BizSize) => string;
  buildInput: (p: BuildInputArgs) => Record<string, unknown>; // 新增
}

// 老模型共用（nano-banana / seedream）
const kieEditInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt, image_urls: p.imageUrls, output_format: "png", image_size: p.size,
});

// GPT 图生图专用
const gptImageInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt, input_urls: p.imageUrls, aspect_ratio: p.size, resolution: "1K",
});
```

MODELS：
- `google/nano-banana-edit` 与 `bytedance/seedream-v4-edit` 各补 `buildInput: kieEditInput`。
- 新增：
  ```ts
  { id: "gpt-image-2-image-to-image", label: "GPT Image (image-to-image)",
    provider: "kie", kind: "edit",
    sizeParam: (s) => KIE_SIZE[s], buildInput: gptImageInput }
  ```

### 2. `lib/kie.ts` —— `createTask` 改为通用

`import { getModel } from "./models";`（单向依赖，models.ts 不反向 import kie.ts，无环）。
把写死的 body 换成：

```ts
const input = getModel(params.model).buildInput({
  prompt: params.prompt,
  imageUrls: [params.imageUrl],
  size: params.imageSize ?? "auto",
});
// fetch body: JSON.stringify({ model: params.model, input })
```

签名 `{ model, prompt, imageUrl, imageSize? }` 保持不变 → `kieProvider`、`run.ts`、
`worker.ts` 调用点零改动。`pollTaskResult` 不动。

### 3. `app/page.tsx` —— 下拉框派生自单一数据源

删除本文件内硬编码的 `MODELS` 数组，改为 `import { MODELS } from "@/lib/models"`
并派生下拉选项（`lib/models.ts` 是纯 TS、无 server-only 依赖，client 组件可安全 import）：

```ts
const MODEL_OPTIONS = MODELS.map((m, i) => ({
  value: m.id,
  label: i === 0 ? `${m.id}（默认）` : m.id,
}));
```

`useState(MODEL_OPTIONS[0].value)` 与 `<option>` 渲染相应改用 `MODEL_OPTIONS`。
默认仍是 nano-banana（MODELS 第一项）。

### 4. `.claude/skills/image-edit/SKILL.md`

「可用模型」段：把「列出下面两项」改为「三项」，新增一行：

```
- `gpt-image-2-image-to-image` —— OpenAI GPT Image 图生图，指令遵循强、风格化稳，支持多图输入
```

frontmatter 描述里「nano-banana-edit / seedream 等模型」含「等」，可不改。

### 5. 测试

- `lib/models.test.ts`：
  - 「恰好两个模型」断言 → 三个（加入 `gpt-image-2-image-to-image`）。
  - 新增：GPT 的 `sizeParam` 映射（800x800→`1:1`、800x1200→`9:16`、1200x800→`16:9`）；
    `buildInput` 产出含 `input_urls`/`aspect_ratio`/`resolution:"1K"`，且**不含** `image_size`。
  - 补一条：`kieEditInput` 产出含 `image_urls`/`image_size`/`output_format`，不含 `input_urls`。
- `lib/providers/kie.test.ts`：现有用例 mock 了 `../kie`，透传 `imageSize`，不受影响；
  可补一条 GPT 的 provider 用例。
- 新增 `lib/kie.test.ts`：mock 全局 `fetch`，断言三个模型经 `createTask` 拼出的
  body 形状正确（锁住请求体差异，本次最有价值的回归）。

### 6. 验证

- `npx vitest run` 全绿。
- 用 GPT 模型跑一次真实 `scripts/edit.ts`（single 模式，`--model gpt-image-2-image-to-image`），
  确认拿到结果 URL、产物是精确尺寸 `.webp`（`sips -g pixelWidth -g pixelHeight`）。
- 这一步同时验证两个假设：模型 id 字符串正确；GPT 走同一套 recordInfo/resultJson 轮询。

## 假设与风险

- **模型 id 字符串**：取自官方文档（`gpt-image-2-image-to-image`，无厂商前缀，区别于
  `google/`、`bytedance/`）。若错，真实调用会报错——第 6 步会立刻暴露。
- **轮询通用性**：假设 GPT 同样返回 `recordInfo` + `resultJson.resultUrls`。第 6 步验证。

## 范围之外（YAGNI）

- 不暴露 `resolution`（1K/2K/4K）选择器，不暴露 GPT 更丰富的 `aspect_ratio`
  （3:2/4:3/21:9 等）；仍沿用现有三种比例（横/方/竖）。
- 不利用 GPT「≤16 张输入图」能力；仍只传单张输入图。
- 不改 `.codex` 的 feature-page-image-assets（gpt-image）——与本 skill 独立、互不调用。
- 不统一 `ModelDef.label`（"Nano Banana Edit"）与下拉展示标签（用 id）；两者用途不同。
