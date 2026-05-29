# 「对比图」Tab — 设计文档

- 日期：2026-05-29
- 目标落地页：aigazou.net `/features/ai-action-figure-generator`
- 状态：待用户 review

## 1. 背景与目标

现有「素材制作」工具的「生成」页流程是：Unsplash 关键词随机取图 → KIE `nano-banana-edit` 风格化 → sharp 裁到目标比例 → 输出单张 WEBP。它**做不了**这次手办落地页需要的两类配图：

1. **Features 对比横图**：左原图、右 AI 结果的 before/after 合成图（现有只输出单图，没有合成能力）。
2. **Showcase 竖图**：1 个 prompt 一次出 N 张「处理后」结果图（现有是「1 个 prompt 出 1 张」，要凑数量得用 `---` 重复写，很笨）。

同时还缺三件小事：
- 一个**单独的自由 prompt 框**（现有是批量 `---` 格式 + 首行当文件名）。
- **取源图后人工确认主体**（Unsplash 随机，有些手办 prompt 只对人 / 只对动物成立，要先确认主体类型对）。
- **自定义 slug 命名**（文件按用户指定前缀命名）。

**方案**：新增独立 Tab「对比图」（路由 `/compare`），最大化复用现有 `lib`（kie / unsplash / postprocess / storage / worker）和 run/worker/preview 体系，新增量做到「mode 字段 + 一个合成函数 + 一个取源图接口」。现有「生成 / 历史 / Showcase 裁图」三页逻辑**零改动**。

## 2. 范围与关键决策

| # | 决策 | 取值 | 备注 |
|---|---|---|---|
| 1 | 源图来源 | 沿用 Unsplash，**不做上传** | KIE 需公网可访问 URL，上传需额外托管，本期不做 |
| 2 | 对比图形态 | 合成单张横图 + Before/After 标签，**无箭头** | 用户明确去掉箭头 |
| 3 | 输出比例 | 对比横图 **1200×800**、Showcase 竖图 **800×1200**，沿用现有尺寸不变 | 不引入新比例；面板内部切法只是排版细节 |
| 4 | 批量策略 | 1 prompt → N 张，N 进 N 出（每张 1 个不同源图） | showcase 主体尽量不雷同：源图去重 + 用户自己挑 |
| 5 | UI 位置 | 新建独立 Tab「对比图」 | 不动现有三页 |
| 6 | 文件命名 | 用户填 slug，文件 `{slug}-1.webp … {slug}-N.webp` | 仿 Showcase 裁图页的 slug 思路 |
| 7 **【假设·待确认】** | Tab 范围 | 一个 Tab 含 `对比横图` + `Showcase 竖图` 两个模式 | 两个交付物都要，新便利对两者都有用 |
| 8 **【假设·待确认】** | 源图确认交互 | 缩略图网格多选确认，带「跳过预览」开关 | 下拉看不到图，不适合；网格是 web 原生做法 |

## 3. 用户流程

```
进「对比图」Tab
  └─ 填表单：slug、模型、模式(对比横图/Showcase竖图)、数量、主体主题、prompt
       │
       ├─【默认】点「取源图」
       │     └─ 后端按主题拉一批候选（约 2×数量 张）→ 缩略图网格
       │           └─ 用户点选 N 张（确认主体 + 挑多样性，可单张换图）
       │                 └─ 点「用这 N 张生成」
       │
       └─【开关：跳过预览】直接「随机生成 N 张」（后端自动取 N 张不同图）
             │
             ▼
       跳到预览页 /compare/[runId]（后台并发跑）
         └─ 实时进度条 + 单条「重生」+ 单张「下载」/「全部下载」
```

## 4. 输入表单字段（`/compare` 页）

| 字段 | 类型 | 必填 | 默认 / 说明 |
|---|---|---|---|
| slug 文件名前缀 | text | 是 | slugify 后用于命名，如 `action-figure` → `action-figure-1.webp` |
| 模型 | select | 是 | 复用现有 `MODELS`，默认 `google/nano-banana-edit` |
| 模式 | 二选一按钮 | 是 | `对比横图`（1200×800）/ `Showcase竖图`（800×1200），默认对比横图 |
| 数量 | number | 是 | 默认随模式：对比 3 / showcase 4；上限 10 |
| 主体主题 | text + 快捷标签 | 是 | 复用现有 `KEYWORD_PRESETS`，支持逗号分隔多个 → Unsplash 搜索词 |
| 提示词 | textarea | 是 | 单个自由 prompt，带手办示例占位符 |
| 跳过源图预览 | checkbox | 否 | 默认不勾（走取源图确认流程） |

## 5. 后端设计

### 5.1 数据结构改动（`lib/storage.ts`，全部向后兼容）

`RunRecord` 新增：
```ts
mode?: "style" | "compare";   // 缺省 = "style"（现有行为）
```
- `"style"`：现有行为，aspect 决定一切。**Showcase 竖图 = mode:"style" + aspect:"portrait"**，无需新模式。
- `"compare"`：强制 portrait 取图 + KIE `9:16`，出图后走合成，最终输出 1200×800。

`CandidateRecord` 新增：
```ts
presetSourceUrl?: string;   // 用户在取源图步骤确认的源图 URL；有则跳过 Unsplash 搜索
```

`landing` 字段复用为 slug：新 Tab 的 run 把 `landing = slugify(slug输入)`，`candidate.name = {slug}-{i+1}`。产物落在 `output/{slug}/_candidates/{slug}-{i+1}.webp`（与现有 worker 输出路径一致，7 天后由 cleanup 清理；不 finalize，故不进 history，天然隔离）。

### 5.2 新增接口

**`POST /api/compare/sources`** —— 取源图候选
- 入参：`{ keywords: string, orientation: "portrait"|"landscape"|"squarish", count: number }`
- 出参：`{ photos: { id, thumbUrl, fullUrl, attribution }[] }`（约 2×count 张，去重）
- 复用新加的 `searchUnsplashPhotos()`（见 5.4）

**`POST /api/compare`** —— 创建生成任务
- 入参：`{ slug, model, mode: "compare"|"showcase", count, keywords, prompt, sources?: {imageUrl, attribution}[] }`
  - `sources` 来自取源图确认步骤（长度 = count）；缺省（跳过预览）时由 worker 自取
- 行为：构建 `RunRecord`（`mode` 映射：`"showcase"` → `mode:"style",aspect:"portrait"`；`"compare"` → `mode:"compare"`），N 个 candidate（同一 prompt，`name={slug}-{i+1}`，有 sources 则写入 `source` + `presetSourceUrl`）→ `saveRun` → fire `runBackgroundWorker` → 返回 `{ runId }`
- 前端拿到 runId 后 `router.push('/compare/' + runId)`

**`GET /api/runs/[runId]`** —— 【新增，补现有缺口】
- 返回 `getRun(runId)` 的 JSON，`cache: no-store`
- 现状：`PreviewClient` 已在轮询此路由但路由不存在（404 被静默吞），导致现有预览页实时进度失效。补上后**现有页 + 新 Tab 的轮询同时修复**。

### 5.3 worker 改动（`lib/worker.ts generateCandidate`，分支增量）

```
1. keyword = candidate.keywordOverride ?? pickRandomKeyword(run.globalKeyword)
2. orientation/imageSize：
     mode==="compare" → portrait / "9:16"
     否则 → 按 aspect（现有逻辑）
3. sourceUrl = candidate.presetSourceUrl
              ?? (await searchUnsplashPhoto(keyword, orientation)).imageUrl
4. taskId = createTask({ model, prompt, imageUrl: sourceUrl, imageSize })
5. resultUrl = pollTaskResult(taskId)
6. 输出：
     mode==="compare":
       下载 sourceBuf + resultBuf → composeComparison(sourceBuf, resultBuf)
       → 写 1200×800 webp 到 _candidates/{name}.webp
     否则（style/showcase）：
       downloadAndProcess(resultUrl, ..., {aspect 尺寸})  // 现有逻辑
7. updateCandidate success
```

### 5.4 lib 改动

- **`lib/unsplash.ts`**：新增 `searchUnsplashPhotos(keyword, orientation, perPage=30): UnsplashAttribution[]`（返回列表，供取源图用）。现有单选 `searchUnsplashPhoto` 保留不动（可改为内部调用列表版再随机取一）。
- **`lib/postprocess.ts`**：新增 `composeComparison(originalBuf, resultBuf, opts?): Buffer`（见 5.5）。
- **`lib/storage.ts`**：新增构建 compare/showcase run 的 helper（单 prompt → N candidate）。

### 5.5 对比图合成器 `composeComparison`

- 画布 **1200×800**，白底。
- 布局（无箭头）：外边距 32，顶部标签行高 ~44，两面板间距 24。
  - 面板宽 = (1200 − 32×2 − 24) / 2 = **556**；面板高 = 800 − 76(顶) − 32(底) = **692**。
  - 左面板 x=32、右面板 x=612，y=76。
- 原图、AI 结果各用 sharp `fit:"cover"` 缩到 556×692，`composite` 贴到对应面板位置。
- SVG overlay 文本：左上「Before」、右上「After」（深灰，小字号），贴在各自面板上方标签行。
- 输出 webp quality 90。

## 6. 新增 / 改动文件清单

**新增**
- `app/compare/page.tsx` —— 对比图 Tab 表单 + 取源图网格多选
- `app/compare/[runId]/page.tsx` + `ComparePreviewClient.tsx` —— 轮询预览页（下载导向）
- `app/api/compare/route.ts` —— 创建任务
- `app/api/compare/sources/route.ts` —— 取源图候选
- `app/api/runs/[runId]/route.ts` —— 返回 run JSON（同时修复现有预览轮询）

**改动（增量、向后兼容）**
- `lib/storage.ts` —— `RunRecord.mode`、`CandidateRecord.presetSourceUrl`、build helper
- `lib/worker.ts` —— compare 分支 + presetSourceUrl 分支
- `lib/unsplash.ts` —— `searchUnsplashPhotos`
- `lib/postprocess.ts` —— `composeComparison`
- `app/layout.tsx` —— 顶栏加「对比图」入口

**零改动**：`app/page.tsx`、`app/showcase/*`、`app/history/*`、`app/api/generate|regenerate|finalize|history|showcase/*`、现有 `app/preview/*`（仅因新增 `/api/runs/[runId]` 而恢复正常轮询，代码本身不改）。

## 7. 预览页（`/compare/[runId]`）

独立的 `ComparePreviewClient`，复用 `PreviewClient` 的轮询模式（不复用其组件本体，避免动到现有页 → 零回归风险，代价是 ~40 行轮询代码重复）：
- 顶部进度条（`done/total`）。
- 每张卡片：图（compare 显示合成图、showcase 显示竖图）+ 「重生这条」（复用 `POST /api/regenerate`）+ 「下载」（指向 `/api/image/output/{candidatePath}`，`download={name}.webp`）。
- 顶部「全部下载」（逐张触发下载，仿 Showcase 裁图页）。
- **不复用** finalize / 全部采用 / history（新 Tab 不进 history）。

## 8. 非目标（YAGNI）

- 不做源图**上传**（只 Unsplash）。
- 不进 **history**、不做 finalize（生成即下载）。
- 不做对比图的箭头、复杂模板、多种排版。
- 不做「一图出多变体」（确认为 N 进 N 出）。
- 不做 showcase 与 compare 的「一次确认源图同时出两种图」联动（两个模式各跑各的）。

## 9. 风险与缓解

- **取源图多一次 Unsplash 调用 + 占配额**（免费 50/h）：候选数控制在 ~2×count；提供「跳过预览」开关。
- **KIE 出图慢（每张 30s–2min）**：复用 async worker + 轮询，避免同步超时。
- **改 `RunRecord` 影响旧数据**：新字段全 optional + 缺省走旧行为；旧 run JSON 不受影响。
- **修 `/api/runs/[runId]` 影响现有预览页**：是修复非破坏（之前一直 404 静默失败），属正向改进。
