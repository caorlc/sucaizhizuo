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
   | cover 原图 input | 1 | 800×800 | single `--no-ai`（原图裁切） | `-1` |
   | cover 处理后 output | 1 | 800×800 | single（AI 处理后） | `-2` |
   | showcase | 4 | 800×1200 | result | `-3…-6` |
   | features | 3 | 1200×800 | compare（左原图/右处理后） | `-7…-9` |
   | use cases | 3 | 800×1200 | result | `-10…-12` |
   | 全套落地页 | 12 | 上面全部 | 混合 | `-1…-12` |
   | 单张/一次性 | 自定义 | 自定义 | single/result/compare | 用户给名 |

   **cover 两张必须同一主体**：先生成 output（`--mode single --size 800x800`），从它的 JSON 里记下 `sourceUrl`，再用 `--mode single --no-ai --size 800x800 --source <那个 sourceUrl>` 生成 input —— 这样「原图」和「处理后」是同一张照片（否则两次按关键词取图会是两只不同的狗）。所有产物一律 `.webp`。

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

## 源图选择偏好（主体是人物时）

- **只要单一主体**：优先**单人**，其次**双人**；不要群像 / 人群 / 合照 / 背影 / 只有局部。
- **颜值优先**：找**帅哥 / 美女**；优先**东亚**面孔，取不到再用**欧美**，总之一定要好看。
- Unsplash 关键词一律带 `portrait`（偏单人、正脸构图）；竖图用 portrait 朝向。模板见 `references/prompt-patterns.md`。
- 取图后扫一眼结果 `sourceUrl`：若是群像 / 背影 / 模糊 / 颜值不够，就重取（`result` 再跑一次会换图，或换更具体关键词）。
- 主体是宠物 / 物品时不受此条约束，按语义取对应主体即可。

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

项目根存在 `.env.local` 或 `.env`（loadEnv 两者都读，`.env.local` 优先），含 `KIE_API_KEY` 与 `UNSPLASH_ACCESS_KEY`（见 README）。缺失时 CLI 会给出中文报错。
