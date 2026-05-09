# 素材制作 — 落地页配图批量生成工具

通过 kie.ai 图像生成模型，为 aigazou.net 各落地页自动批量生成 1200×800 WEBP 配图。支持一次输入多个 Prompt，每个 Prompt 独立生成 1 张候选，可单独「重生」或「全部采用」。

---

## 启动步骤

**第一步：安装依赖**

```bash
npm install
```

**第二步：复制配置文件**

```bash
cp .env.example .env.local
```

**第三步：填写 API Key**

用文本编辑器打开 `.env.local`，填入以下两个 Key：

- `KIE_API_KEY`：在 https://kie.ai/api-key 获取
- `UNSPLASH_ACCESS_KEY`：在 https://unsplash.com/oauth/applications 创建应用后获取「Access Key」（不是 Secret Key）

**第四步：启动开发服务**

```bash
npm run dev
```

**第五步：打开浏览器**

访问 http://localhost:3000

---

## 怎么使用

### 基本流程

1. **填写落地页名称**：对应 aigazou.net 的路径，如 `photo-to-sketch`（会自动记忆历史输入）
2. **选择模型**：默认 `google/nano-banana-edit`
3. **填写源图主题**：所有 Prompt 共用此关键词从 Unsplash 随机取源图（每张独立随机选一张不同的图）
4. **填写批量 Prompt**：支持 1~10 个，用 `---` 单独一行分隔
5. **点击「批量生成 N 张候选」**：立即跳转预览页，后台并发生成所有候选
6. **在预览页操作**：
   - 每张候选可单独「选这张」（定稿）或「重生这条」（替换该条候选，重新生成）
   - 点「全部采用」把所有成功的候选一次性定稿
7. **在历史页查看**：所有定稿图片按落地页分组展示，支持下载

### 多个 Prompt 怎么写

用 `---` 单独一行分隔每个 Prompt：

```
Clean Line Drawing
Convert this photo into a minimalist black line drawing.
Clean continuous black outlines on pure white background.

---

Pencil Sketch
Soft pencil sketch with cross-hatching and gentle shading.

---

Watercolor
Transform into watercolor painting with soft pastel colors.
```

**规则说明：**

- **每段第一行作为文件名**：自动 slugify（转小写、空格变连字符），如 `Clean Line Drawing` → `clean-line-drawing.webp`
- 如果多段第一行 slug 相同，自动加 `-2`、`-3` 后缀区分
- 空段（只有空白行）自动忽略

### 给某条单独换源图主题（keyword 覆盖）

在某段内加一行 `keyword: 主题词`，该行会覆盖全局源图主题，且不会出现在发给 KIE.AI 的 Prompt 里：

```
Portrait Sketch
Convert to pencil sketch style.
keyword: portrait face

---

Landscape Painting
Oil painting style with warm sunset colors.
keyword: mountain sunset
```

全局源图主题填 `portrait`，但第二条会用 `mountain sunset` 搜索 Unsplash，独立取图。

### 「重生这条」的作用

预览页每张候选卡片上有「重生这条」按钮：
- 点击后该候选重新从 Unsplash 取一张新的源图，重新调用 KIE.AI 生成
- 其他候选不受影响
- 生成中实时刷新状态（每 2 秒轮询一次）
- 失败的候选显示「重试」按钮，效果相同

---

## 输出文件位置

```
output/
└── {落地页名}/
    ├── {文件名}.webp       ← 定稿图片（1200×800 WEBP）
    ├── {文件名}.json       ← 元信息（prompt、模型、keyword、Unsplash 归属、时间）
    └── _candidates/        ← 候选图暂存（7 天后自动清理）
        └── {文件名}.webp   ← 每条 prompt 对应 1 张候选
```

---

## 常见问题

**Q：API Key 在哪里获取？**
- kie.ai Key：登录 https://kie.ai → 右上角账户 → API Keys
- Unsplash Key：登录 https://unsplash.com → Your Apps → New Application → 复制 Access Key

**Q：生成失败怎么办？**
- 预览页会显示具体错误信息（如「UNSPLASH_ACCESS_KEY 未配置」、「Unsplash 没有找到关键词相关的图片」）
- 点「重试」按钮重新生成该条候选

**Q：Unsplash 配额超限？**
- 免费账户每小时限制 50 次请求
- 错误提示为「Unsplash API 配额超限（429）」
- 等待 1 小时后再试，或申请生产环境 Key（unlimited）

**Q：全局 keyword 搜不到图片？**
- Unsplash 搜索需要有意义的英文词，如 `portrait`、`landscape`、`food`、`architecture`
- 过于抽象的词（如 `test`）可能搜不到结果，会报「Unsplash 没有找到关键词「xxx」相关的图片」

**Q：图片存在哪里，能备份吗？**
- 所有图片存在项目目录的 `output/` 文件夹
- 直接复制 `output/` 目录即可备份
