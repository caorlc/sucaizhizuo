# Seedream V4 Edit 接入 `image-edit` skill — 设计文档

- 日期：2026-05-31
- 状态：待用户 review
- 关联：扩展 [`2026-05-29-image-edit-skill-design.md`](./2026-05-29-image-edit-skill-design.md)（沿用其模型注册表 + provider 适配层）
- 接口文档：https://docs.kie.ai/market/seedream/seedream-v4-edit

## 1. 背景与目标

在 `image-edit` skill 中接入 KIE 的 **Seedream 4.0 编辑模型**（`bytedance/seedream-v4-edit`），作为可选编辑模型与现有 `google/nano-banana-edit` 平级；同时**移除不再需要的 `black-forest-labs/flux-kontext-pro` 与 `flux-kontext-max`**。接入后注册表仅保留 `nano-banana-edit` 与 `seedream-v4-edit` 两个模型。

顺带落实一条工作流变更（用户明确要求）：**不再有静默默认模型——用户未指定模型时必须询问**。

此外（用户在 review 时确认），解耦的网页工具 `app/page.tsx` 的模型下拉同步为「nano-banana + seedream」，并把其后台 `lib/worker.ts` 的 `image_size` 改为经模型注册表 `getModel().sizeParam()` 解析——否则网页选 Seedream 时会把 `16:9` 等非法值发给只认 `square_hd / portrait_16_9 / landscape_16_9` 的 Seedream。

## 2. 关键决策

| # | 决策 | 取值 |
|---|---|---|
| 1 | 接入方式 | **路线 1**：注册表加一条 `MODELS` + `createTask` 放宽 `imageSize` 为 `string`（沿用原设计 §7/§13 既定扩展点） |
| 2 | 尺寸映射 | 与 nano-banana 的 `1:1 / 9:16 / 16:9` **对齐**（见 §4），跨模型同一资产取景/裁切一致 |
| 3 | 默认模型 | **取消兜底默认**：删除 `DEFAULT_MODEL`；CLI `--model` 必填，缺失直接报错；skill 未指定模型时用 `AskUserQuestion` 让用户选 |
| 4 | 额外参数 | 不接 `image_resolution` / `max_images` / `seed` / `nsfw_checker` / 多图输入（YAGNI，见 §6） |
| 5 | 最终输出 | 一律 800×800 / 800×1200 / 1200×800 `.webp`，与现有模型完全相同（由 `scripts/lib/run.ts` 的 sharp `cover` 裁切决定，与模型无关） |
| 6 | 模型清理 | **移除 `flux-kontext-pro` / `flux-kontext-max`**；注册表最终仅 `nano-banana-edit` + `seedream-v4-edit` |
| 7 | 网页工具 | 下拉删 flux、加 `seedream-v4-edit`；`worker.ts` 经 `getModel().sizeParam()` 映射 `image_size`（修正 Seedream 词表）；`aspect.ts` 加 `ASPECT_TO_BIZSIZE` |

## 3. 代码改动

**`lib/models.ts`**
- 新增 `SEEDREAM_SIZE: Record<BizSize, string>`：`800x800 → square_hd`、`800x1200 → portrait_16_9`、`1200x800 → landscape_16_9`。
- `MODELS` 增一条：`{ id: "bytedance/seedream-v4-edit", label: "Seedream V4 Edit", provider: "kie", kind: "edit", sizeParam: (s) => SEEDREAM_SIZE[s] }`。
- **删除 `DEFAULT_MODEL`** 导出（不再兜底）。`google/nano-banana-edit` 的 label 去掉「（默认）」字样。
- **移除** `black-forest-labs/flux-kontext-pro` 与 `flux-kontext-max` 两条 `MODELS`；最终注册表仅 `nano-banana-edit` + `seedream-v4-edit`。

**`scripts/lib/args.ts`**
- `--model` 改为**必填**：缺失抛 `缺少 --model（请指定模型，不再使用默认）`。
- 移除对 `DEFAULT_MODEL` 的 import 与 `?? DEFAULT_MODEL` 兜底。

**`lib/kie.ts`**
- `createTask` 参数 `imageSize?: KieImageSize` → `imageSize?: string`（透传 Seedream 的 image_size 词表）。
- 其余不动：`output_format: "png"` 保留（Seedream schema 无 `additionalProperties: false`，会忽略该字段；最终 webp 由本地 sharp 决定，不依赖上游格式）；`pollTaskResult` 复用同一 `/api/v1/jobs/recordInfo`（Seedream 走相同 `resultJson → resultUrls` 结构）。
- `KieImageSize` 类型若变为无引用则一并清理。

**`lib/providers/kie.ts`**
- 去掉 `input.size as KieImageSize` 强转 → 直接 `imageSize: input.size`；清理无用 import。

**`lib/aspect.ts`**
- 新增 `ASPECT_TO_BIZSIZE: Record<Aspect, BizSize>`：`landscape → 1200x800`、`square → 800x800`、`portrait → 800x1200`（原 `kieImageSize` 字段保留，仅不再被 worker 使用）。

**`lib/worker.ts`**
- 新增纯函数 `resolveImageSize(modelId: string, aspect: Aspect): string`，返回 `getModel(modelId).sizeParam(ASPECT_TO_BIZSIZE[aspect])`。
- `createTask({ ..., imageSize: aspectCfg.kieImageSize })` → `imageSize: resolveImageSize(run.model, run.aspect)`。

**`app/page.tsx`**
- 顶部 `MODELS` 常量：删 flux 两项、加 `{ value: "bytedance/seedream-v4-edit", label: "bytedance/seedream-v4-edit" }`；`MODELS[0]` 仍为 nano-banana（`useState(MODELS[0].value)` 默认选中不变）。

**其他清理**
- 全仓搜索 `flux` / `kontext`（README、注释、其它文档等）并清理残留引用。

## 4. 尺寸映射（与 nano-banana 对齐）

| 业务尺寸 | 比例 | nano-banana (`image_size`) | Seedream (`image_size`) |
|---|---|---|---|
| 800×800 | 1:1 | `1:1` | `square_hd` |
| 800×1200 | 竖 9:16 | `9:16` | `portrait_16_9` |
| 1200×800 | 横 16:9 | `16:9` | `landscape_16_9` |

最终 `.webp` 尺寸由 `run.ts` 的 sharp `fit: "cover"` 裁切固定，与模型/生成比例无关——故四个模型最终产物尺寸完全一致。

## 5. SKILL.md 改动

- **「可用模型」**：移除 flux-kontext 两项，列 2 个模型并各加一句简介，供选择时参考：
  - `google/nano-banana-edit` —— 通用、稳、快
  - `bytedance/seedream-v4-edit` —— Seedream 4.0，多主体一致性 / 复杂编辑强（本次新增）
- **「收集输入」+「何时提问」**：明确——**用户未指定模型时，必须用 `AskUserQuestion` 列出上述模型让用户选，不再静默用默认**。
- frontmatter `description` 与「概述」里「默认 `google/nano-banana-edit`」措辞 → 「模型可插拔（经 KIE）；未指定则询问」。

## 6. 非目标（YAGNI，对应用户选的「仅作可选模型」）

- 不暴露 `image_resolution`（沿用 Seedream 默认 1K；所有产物 ≤1200px，与现有模型 ~1K 产物一致）。
- 不支持多图输入 / `max_images` / `seed` / `nsfw_checker`。
- 不加新 CLI flag（除已有 `--model`），不动 `run.ts` / `postprocess.ts` / `unsplash.ts`。
- 网页工具仅改「模型下拉 + worker 尺寸映射」，不做 UI/流程重构；`app/api/**`、history / preview / showcase 等不动。

## 7. 测试

- `lib/models.test.ts`：① 移除 `DEFAULT_MODEL` 相关用例，改为直接断言 `getModel("google/nano-banana-edit")` 的 provider/kind；② **删除「exposes flux kontext」用例**，改为断言注册表恰为 `nano-banana-edit` + `seedream-v4-edit`（不含 flux）；③ 新增用例：Seedream 已注册（`provider=kie`、`kind=edit`），尺寸映射 `square_hd / portrait_16_9 / landscape_16_9`。
- `scripts/lib/args.test.ts`：① 原「sensible defaults」用例补上 `--model`；② 新增「缺 `--model` 抛错」用例（`/model/`）。
- `lib/worker.test.ts`（新建）：`resolveImageSize` 对 nano（`1:1 / 9:16 / 16:9`）与 seedream（`square_hd / portrait_16_9 / landscape_16_9`）跨三种 aspect 的映射均正确。
- `lib/providers/kie.test.ts`：补一条断言——传入 Seedream 词表（如 `square_hd`）时原样透传给 `createTask`。
- 全量 `npm test`（vitest）通过。

## 8. 风险与缓解

- **取消默认是行为变更**：CLI 现要求 `--model`，省略会报错——但 SKILL.md 流程本就逐张携带 `--model`，报错信息清晰；已知受影响仅 2 个测试，随本次一并改。
- **`output_format` 字段**：Seedream 文档未列该字段，但其 schema 不禁额外字段 → 预期「被忽略」；即便上游格式有别，最终 webp 由本地 sharp 决定，不受影响。
- **image_size 词表差异**：收敛在 `ModelDef.sizeParam`（原设计 §13 既定扩展点），不外溢到主流程。
- **历史 flux run 重生**：旧 run 的 `model` 可能是已删除的 flux，`/api/regenerate` 经 `getModel` 会抛错——但被 `generateCandidate` 的 try/catch 捕获、该候选标记 `failed`（含中文报错），不崩溃，属可接受降级。
