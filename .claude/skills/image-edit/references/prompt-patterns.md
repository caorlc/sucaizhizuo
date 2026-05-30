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

## 人物源图关键词（帅哥/美女 · 单人优先 · 东亚优先）

主体是人时，给 `--source` 用这些英文关键词（一律带 `portrait`，导向单人正脸高颜值）：

- 美女单人：`beautiful east asian woman portrait` / `pretty korean woman portrait` / `elegant japanese woman portrait` → 兜底 `beautiful woman portrait`
- 帅哥单人：`handsome east asian man portrait` / `attractive korean man portrait` → 兜底 `handsome man portrait`
- 双人（次选）：`attractive east asian couple portrait` → 兜底 `beautiful couple portrait`

showcase 4 张要主体不雷同：用不同关键词错开（美女 / 帅哥 / 不同风格各取一两张）。不要群像、人群、背影、模糊或颜值不足的图；命中了就重取。

## 手办化（action figure）专用提示

- 强调相似度（accurate likeness）、玩具材质（vinyl/resin/plush 视主题）、吸塑盒/底座等收藏品语汇。
- 主体清晰、背景干净，避免桌面道具堆叠与密集分镜。
- 动物主题用 `puppy`/`dog`/`cat` 等源图关键词；人物主题用 `portrait`/`person`。
