# `image-edit` skill — 设计文档

- 日期：2026-05-29
- 状态：待用户 review
- **取代**：`2026-05-29-comparison-tab-design.md`（网页 Tab 方案，已废弃）

## 1. 背景与目标

为 aigazou.net 功能页（首例 `/features/ai-action-figure-generator`）批量生成可上线配图。用户**习惯用 AI 对话**驱动，不想点网页表单；要求出图**贴合页面语义**、模型**可插拔**（不止 nano-banana）、features 要 **before/after 对比**。

现有两条路都不够：
- **网页工具**（现项目）：手动表单、只 Unsplash 随机取图、单图输出、无对比合成。
- **`.codex/skills/feature-page-image-assets`**：语义规划好，但生成委托 Codex 内置 `imagegen`（= gpt-image，**锁死模型**），且只出单图、无 before/after。

**目标**：做**一个**对话驱动、语义感知的新 skill `image-edit`，自给自足完成「读 URL → 贴合语义出图 → webp 落盘」。

## 2. 核心理念

> **一个新 skill `image-edit`，语义感知 + 模型可插拔 + 对话驱动。** 读你给的 URL 理解页面语义，结合你的 prompt 和所选模型出图，每次运行先问「这次出哪些图」。

- **只造 `image-edit` 一个新 skill。**
- **旧 `feature-page-image-assets` 解耦、原地不动**（独立的 gpt-image 工具，本流程用不到；是否删除日后再定）。两者是「互不相干的独立 skill」，**不存在一个调另一个**。
- **最终产物一律 `.webp`。**

## 3. 关键决策

| # | 决策 | 取值 |
|---|---|---|
| 1 | skill 结构 | 只新建 `image-edit`；旧 skill 不碰、不接线 |
| 2 | 语义来源 | 读用户给的目标页 URL，出图贴合其区块语义 |
| 3 | 模型 | 可插拔注册表，默认 `google/nano-banana-edit` |
| 4 | 生成方式 | 脚本 `scripts/edit.ts`(tsx) 打 API，复用 `lib/kie`/`lib/postprocess`/`lib/unsplash` |
| 5 | 源图 | 真实主体照片（Unsplash 语义关键词 / 本地 / URL）；竞品 URL **只学构图、不复用其图** |
| 6 | features 形态 | before/after 合成横图，**无箭头**，Before/After 标签 |
| 7 | 尺寸 | square 800×800、竖图 800×1200、横图 1200×800 |
| 8 | 命名 | URL slug 前缀 + 连字符编号 `<slug>-N.webp` |
| 9 | 输出格式 | **webp** |
| 10 | skill 放置 | `.claude/skills/image-edit/`；脚本/lib 在项目根，可镜像供 `.codex` |

## 4. 交互流程（对话驱动）

`image-edit` 被调用时：

```
1. 拿到 目标页 URL（必需，用于语义 + slug）、base prompt、模型（默认 nano-banana）
   └─ 可选：竞品参考页（只抽象学构图，不复用其图）
2. 提取页面语义：调用现有 extract_page_copy.py <url>
   → 功能主题、各区块文案、use-case 列表、slug
3. 问「输出范围」（见 §6 预设，可多选；数量/尺寸/起始编号可当场覆盖）
4. 规划资产计划：每张 = {尺寸, 模式, 源图关键词(语义派生), prompt(base + 区块语义), 文件名}
   → 念给用户确认
5. 逐张调 scripts/edit.ts 生成（features 走 compare 合成）
6. 校验尺寸 + 抽检重复度 → 中文汇报路径与 prompt 摘要
```

已知信息不重复问；用户一句说清就直接干。

## 5. 语义如何决定出图（“贴合语义”落点）

`base prompt` 提供**转换风格**（如「把主体做成吸塑盒收藏手办」），**URL 语义**决定**每张图画什么**：

- **功能主题** → 整体主体域与风格基调（如手办化的对象是宠物 / 人 / 物）。
- **hero 方图** → 该功能的「典型输入照片」范例，贴合主题。
- **showcase（4 竖图）** → 主题下不同主体的成片，主体彼此错开、不雷同。
- **features（3 对比横图）** → 每张对应一个功能卖点；左真实照片(before)、右 AI 手办(after)，主体/场景贴合该卖点。
- **use cases（3 竖图）** → 每张对应页面里一个真实 use-case 文案，场景与源图关键词由该 use-case 语义派生。

即：**每个资产的 prompt = base 风格 + 该区块语义意图；源图关键词也从语义派生**（用户可逐张覆盖）。

## 6. 输出范围预设（skill 内置，用户只选不背）

| 范围 | 数量 | 尺寸 | 模式 | 默认编号 |
|---|---:|---|---|---|
| `hero 原图 input` | 1 | 800×800 | single（真实照片，可不走 AI 仅裁切） | `-1` |
| `showcase` | 4 | 800×1200 竖 | result（AI 结果，主体不雷同） | `-2…-5` |
| `features` | 3 | 1200×800 横 | **compare**（before/after 合成） | `-6…-8` |
| `use cases` | 3 | 800×1200 竖 | result（场景化） | `-9…-11` |
| `全套落地页` | 11 | 上面全部 | 混合 | `-1…-11` |
| `单张/一次性编辑` | 自定义 | 自定义 | single/compare | 用户给名 |

数量/尺寸/编号均可当场覆盖。编号规则与现有 skill 对齐，便于替换占位图。

## 7. 模型注册表（扩展性核心）

新增 `lib/models.ts`：
```ts
export type Provider = "kie";            // 后续: | "openai" | "replicate"
export interface ModelDef {
  id: string;            // "google/nano-banana-edit"
  label: string;
  provider: Provider;
  kind: "edit" | "t2i";  // edit 需输入图；t2i 纯文生图
  sizeParam: (size: string) => string; // 业务尺寸 → 该模型 image_size 参数
}
export const MODELS: ModelDef[] = [ /* nano-banana-edit(默认) + flux-kontext-pro/max */ ];
export function getModel(id: string): ModelDef;
```
Provider 适配层 `lib/providers/`：
```ts
export interface GenProvider {
  generate(o: { model: string; prompt: string; imageUrls?: string[]; size: string }): Promise<{ imageUrl: string }>;
}
// kie.ts 包装现有 createTask+pollTaskResult；index.ts: getProvider(provider)
```
加模型 = 加一条 `MODELS`；加厂商 = 写一个 `GenProvider` + 注册。主流程不变。

## 8. 生成脚本 `scripts/edit.ts`（tsx，被 skill 调用）

纯 CLI，无 Next 依赖，显式加载 `.env.local`。
```
--model <id> --prompt <text> --source <keyword|path|url>
--mode single|result|compare --size 800x800|800x1200|1200x800
--count <n> --slug <slug> --start <n> --out <dir> --orientation portrait|landscape|squarish
```
行为：解析 model→provider；source 为关键词则 `searchUnsplashPhotos` 取 count 张去重 → `provider.generate` → `compare` 走 `composeComparison`(1200×800) / 否则 `downloadAndProcess` cover 到目标尺寸 → 写 **webp** → 输出 JSON（file/size/model/prompt/source 归属）供 skill 校验。

示例：
```bash
npx tsx scripts/edit.ts --model "google/nano-banana-edit" \
  --prompt "Turn the pet into a collectible blister-pack action figure ..." \
  --source "puppy" --mode result --count 4 --size 800x1200 \
  --slug ai-action-figure-generator --start 2
```

## 9. before/after 合成 `composeComparison`（加到 `lib/postprocess.ts`）

画布 1200×800 白底，**无箭头**；外边距 32、标签行 ~44、面板间距 24 → 面板 556×692（左 x=32 / 右 x=612, y=76）；原图与结果各 `fit:"cover"` 缩入；SVG overlay 左上「Before」右上「After」（深灰小字）；webp q90。

## 10. 源图策略

- 默认 Unsplash 真实主体照片，关键词**从区块语义派生**；用户可逐张覆盖或给本地路径 / URL。
- `result`/`compare` 批量去重，保证 showcase 主体不雷同。
- 竞品参考页只抽象学构图（留白 / 主视觉占比 / 对比方式），写进 prompt 约束，**不复用竞品图片、人物、logo、文案**。
- `compare` 的 before = 真实照片，after = AI 手办。

## 11. 目录结构 / 文件清单

**新增**
- `.claude/skills/image-edit/SKILL.md` —— 交互流程、语义→资产映射、范围预设、命名、prompt、校验（中文沟通）
- `.claude/skills/image-edit/references/prompt-patterns.md` —— 借现有同名文件的构图/手办/use-case 模式
- `scripts/edit.ts` —— 生成 CLI
- `lib/models.ts`、`lib/providers/{kie,index}.ts` —— 模型注册表 + 适配层

**改动**
- `lib/postprocess.ts` —— 加 `composeComparison`
- `lib/unsplash.ts` —— 加 `searchUnsplashPhotos`（列表 + 去重）
- `package.json` —— 加 `tsx` devDependency（+ 可选 `"edit"` script）

**复用不改**
- `.codex/skills/feature-page-image-assets/scripts/extract_page_copy.py` —— 按路径调用做语义提取
- `lib/kie.ts` —— 被 provider 包装

**零改动**：`app/**`（网页工具保留为后备）、`.codex/skills/feature-page-image-assets/SKILL.md`（解耦，不动）

## 12. 非目标（YAGNI）

- 不做网页新 Tab。
- 不更新 / 不接线旧 `feature-page-image-assets`。
- 不复用竞品图做素材。
- 不做对比图箭头 / 复杂模板。
- 本期只接 KIE，但注册表 + 适配层为其他厂商留好扩展位。

## 13. 风险与缓解

- **tsx 跑 lib 的环境变量**：脚本显式加载 `.env.local`，缺 Key 给清晰中文报错。
- **KIE 出图慢（每张 30s–2min）**：脚本内并发 + 单张 5 分钟超时（复用 `pollTaskResult`）；skill 报进度。
- **Unsplash 配额（免费 50/h）**：去重 + 必要时提示换词 / 稍后重试。
- **页面动态渲染导致 extract 抓不到文案**：回退到浏览器 / 让用户粘贴文案（沿用现有 skill 策略）。
- **多模型尺寸差异**：收敛在 `ModelDef.sizeParam`。
- **跨宿主**：SKILL.md 放 `.claude/`；主力 Codex 时镜像到 `.codex/skills/image-edit/`，脚本/lib 共用。
