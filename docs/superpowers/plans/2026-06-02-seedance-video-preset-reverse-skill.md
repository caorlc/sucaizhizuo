# Seedance Video Preset Reverse Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a project-local `seedance-video-preset-reverse` skill that lets internal users provide a reference video URL and receive a Chinese structured Seedance 2.0 effect-replication prompt template.

**Architecture:** This is a skill-only first release, not an app feature. The skill lives under `.codex/skills/seedance-video-preset-reverse/`, contains a concise `SKILL.md` with the URL-first workflow, and includes `agents/openai.yaml` for discoverability. The implementation does not touch KIE, Next.js pages, providers, or runtime app code.

**Tech Stack:** Codex project-local skills, Markdown skill instructions, YAML metadata, shell validation with `rg` and `git`.

---

## File Structure

- Create `.codex/skills/seedance-video-preset-reverse/SKILL.md`
  - Required skill file.
  - Defines trigger rules, URL-first workflow, minimum-question fallback, output format, Seedance prompt constraints, and validation checklist.
- Create `.codex/skills/seedance-video-preset-reverse/agents/openai.yaml`
  - Human-facing skill metadata for the Codex UI.
  - Mirrors the skill's purpose and default prompt.
- No changes to `app/`, `lib/`, KIE provider code, or package dependencies.

## Task 1: Create The Skill Body

**Files:**
- Create: `.codex/skills/seedance-video-preset-reverse/SKILL.md`

- [ ] **Step 1: Verify the skill does not exist yet**

Run:

```bash
test ! -e .codex/skills/seedance-video-preset-reverse/SKILL.md
```

Expected: command exits `0`. If it exits nonzero, inspect the existing file and update rather than overwriting user work.

- [ ] **Step 2: Create the skill directory**

Run:

```bash
mkdir -p .codex/skills/seedance-video-preset-reverse
```

Expected: directory exists.

- [ ] **Step 3: Create `SKILL.md` with the full workflow**

Write `.codex/skills/seedance-video-preset-reverse/SKILL.md` exactly with this content:

```markdown
---
name: seedance-video-preset-reverse
description: "当内部人员提供参考视频 URL，并要求逆向、拆解、复刻、做成 Seedance 2.0 视频特效模板、viral preset、Higgsfield 类模板、或根据视频 URL 生成 Seedance 提示词时使用。默认只要求用户给视频 URL；能分析就直接输出中文结构化模板和最终 Seedance 提示词，不能分析时只做最小化追问。不接入 KIE，不真实生成视频。"
---

# Seedance 2.0 视频效果逆向

## 目标

把内部人员给出的参考视频 URL 逆向成可复用的 Seedance 2.0 视频效果模板。默认输出给中国运营人员阅读，所以分析说明、备注和沟通用中文。最终 Seedance 提示词可以中文、英文或中英混合，优先选择更容易稳定复刻效果的表达。

第一版只做提示词逆向和模板输出：

- 不接入 KIE。
- 不真实生成视频。
- 不做网页页面。
- 不要求用户上传目标图。
- 默认预留 `@图片1` 作为未来用户上传的目标主体图。
- 默认使用 `@视频1` 表示当前参考视频。

## 触发场景

当用户说以下类似需求时，使用本 skill：

- “用 Seedance 逆向这个视频 URL”
- “这个视频做成 Seedance 模板”
- “参考这个视频生成 Seedance 2.0 提示词”
- “把这个 viral preset 复刻成提示词”
- “像 Higgsfield 这个效果一样，帮我写 Seedance prompt”
- “我给你视频 URL，你输出结构化提示词”

## 工作流

1. 识别用户消息里的参考视频 URL。
2. 判断 URL 是否能直接访问、预览、抓取页面标题/描述，或通过当前工具读取。
3. 如果能获得足够视频信息，直接输出模板，不要求用户补充。
4. 如果无法判断视频内容，只问一个最小问题：

   ```text
   这个 URL 我无法直接判断视频内容。请用一句话描述核心画面/特效，或发 1-3 张关键帧截图，我就能继续逆向成 Seedance 模板。
   ```

5. 如果用户明确不想补充，基于 URL、页面可见信息和常见视频模板规律输出低置信度版本，并在“不确定项”中说明风险。

## 分析维度

逆向视频时按这些维度拆解：

- 主体：参考视频里的主体是谁/是什么，未来如何被 `@图片1` 替换。
- 场景：背景、空间、环境、光线和氛围。
- 动作：主体动作、姿态变化、运动方向和速度。
- 运镜：推拉、环绕、跟拍、摇镜、俯仰、主观视角、低角度、希区柯克变焦等。
- 节奏：每个阶段的速度、卡点、停顿、高潮和收尾。
- 转场：遮挡转场、粒子转场、闪白、变焦、空间穿梭、物体变形等。
- 特效：粒子、发光、液体、火焰、像素、科幻 UI、空间扭曲、材质变化等。
- 音频：BGM、音效、节拍、环境声或是否可忽略。
- 风格：写实、电影感、广告感、赛博、梦幻、复古、手办、黏土、像素等。

## Seedance 规则

最终提示词必须遵守：

- 明确说明每个素材引用的用途。
- 默认写明：`@图片1 作为目标主体图`。
- 默认写明：`@视频1 作为参考视频，用于复刻运镜、动作节奏、转场、视觉特效和音效节奏`。
- 提示词要覆盖主体、场景、动作、运镜、分时段、转场/特效、音频/音效和风格。
- 8 秒以上或节奏复杂的视频必须写分镜时间轴。
- 重点复刻参考视频的动态机制，而不是只描述画面风格。
- 如果模板依赖写实真人脸部，必须在使用备注里提示可能被平台拦截或一致性不稳定。

## 输出格式

输出使用下面结构。不要输出 JSON 作为主结果。

```text
模板名称：
<给这个视频特效起一个简短中文名>

适用素材：
@图片1：用户未来上传的目标主体图，用来替换参考视频中的主体。
@视频1：当前参考视频，用来复刻运镜、动作节奏、转场、视觉特效和音效节奏。

效果概述：
<用中文概括核心效果，说明它靠什么机制形成视觉冲击>

分镜时间轴：
0-3秒：<开场画面、主体状态、运镜、动作>
3-6秒：<中段运动、转场、特效发展>
6-10秒：<高潮效果、卡点、收尾或定格>

最终 Seedance 提示词：
<完整可复制提示词。可以中文、英文或中英混合，但必须明确 @图片1 和 @视频1 的用途，并描述运镜、动作节奏、转场、特效和风格。>

使用备注：
<推荐时长、画幅、素材风险、不确定项。若 URL 无法完全分析，要标注“低置信度”。>
```

## 输出质量检查

发给用户前检查：

- 是否包含“模板名称、适用素材、效果概述、分镜时间轴、最终 Seedance 提示词、使用备注”六段。
- 是否明确写出 `@图片1` 的用途。
- 是否明确写出 `@视频1` 的用途。
- 是否包含运镜描述。
- 是否包含动作节奏描述。
- 是否包含转场或特效描述。
- 是否不是 JSON 主输出。
- 如果视频内容不确定，是否在使用备注里标注不确定项。
```

Expected: file exists and contains the frontmatter `name: seedance-video-preset-reverse`.

- [ ] **Step 4: Validate the skill body**

Run:

```bash
rg -n "name: seedance-video-preset-reverse|不接入 KIE|输出格式|输出质量检查|@图片1|@视频1" .codex/skills/seedance-video-preset-reverse/SKILL.md
```

Expected: matches for all required phrases.

- [ ] **Step 5: Commit the skill body**

Run:

```bash
git add .codex/skills/seedance-video-preset-reverse/SKILL.md
git commit -m "feat: add seedance video preset reverse skill"
```

Expected: commit succeeds with only `SKILL.md` staged for this task.

## Task 2: Add Skill UI Metadata

**Files:**
- Create: `.codex/skills/seedance-video-preset-reverse/agents/openai.yaml`

- [ ] **Step 1: Create the agents metadata directory**

Run:

```bash
mkdir -p .codex/skills/seedance-video-preset-reverse/agents
```

Expected: directory exists.

- [ ] **Step 2: Create `openai.yaml`**

Write `.codex/skills/seedance-video-preset-reverse/agents/openai.yaml` exactly with this content:

```yaml
interface:
  display_name: "Seedance Video Preset Reverse"
  short_description: "Reverse a video URL into a Seedance 2.0 effect prompt template."
  default_prompt: "用 Seedance 2.0 逆向这个视频 URL，输出中文结构化模板和最终可复制提示词。"
```

Expected: file exists.

- [ ] **Step 3: Validate metadata keys**

Run:

```bash
rg -n "display_name|short_description|default_prompt" .codex/skills/seedance-video-preset-reverse/agents/openai.yaml
```

Expected: one match for each key.

- [ ] **Step 4: Commit metadata**

Run:

```bash
git add .codex/skills/seedance-video-preset-reverse/agents/openai.yaml
git commit -m "docs: add seedance reverse skill metadata"
```

Expected: commit succeeds with only `openai.yaml` staged for this task.

## Task 3: Validate Skill Trigger And Output Contract

**Files:**
- Read: `.codex/skills/seedance-video-preset-reverse/SKILL.md`
- Read: `.codex/skills/seedance-video-preset-reverse/agents/openai.yaml`

- [ ] **Step 1: Run static contract checks**

Run:

```bash
test -f .codex/skills/seedance-video-preset-reverse/SKILL.md
test -f .codex/skills/seedance-video-preset-reverse/agents/openai.yaml
rg -n "视频 URL|Seedance 2.0|结构化提示词|viral preset|Higgsfield" .codex/skills/seedance-video-preset-reverse/SKILL.md
rg -n "模板名称|适用素材|效果概述|分镜时间轴|最终 Seedance 提示词|使用备注" .codex/skills/seedance-video-preset-reverse/SKILL.md
rg -n "@图片1.*目标主体图|@视频1.*参考视频|不接入 KIE|不真实生成视频|不要输出 JSON" .codex/skills/seedance-video-preset-reverse/SKILL.md
```

Expected: every command exits `0`.

- [ ] **Step 2: Manually smoke-test the expected output shape**

Use this sample request in a fresh model turn after the skill is available:

```text
用 Seedance 逆向这个视频：https://example.com/demo-video.mp4
```

Expected behavior:

- If the URL cannot be analyzed, the response asks only one minimal question for a one-sentence description or 1-3 keyframe screenshots.
- If a description is provided, the response contains exactly these user-visible sections:
  - `模板名称`
  - `适用素材`
  - `效果概述`
  - `分镜时间轴`
  - `最终 Seedance 提示词`
  - `使用备注`
- The final prompt names both `@图片1` and `@视频1` and describes camera movement, motion rhythm, transitions, effects, and style.

- [ ] **Step 3: Verify git status**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated files remain, such as `.agents/` if it was already untracked before this work.

## Self-Review Checklist

- Spec coverage:
  - Internal skill-first entry: Task 1 creates `.codex/skills/seedance-video-preset-reverse/SKILL.md`.
  - URL-first lazy workflow: Task 1 workflow and URL analysis strategy cover direct URL use and minimal fallback questions.
  - Chinese internal communication: Task 1 output format requires Chinese structured text.
  - Final prompt can be mixed-language: Task 1 states Chinese, English, or mixed final prompt is allowed.
  - No KIE first release: Task 1 and Task 3 validate `不接入 KIE` and `不真实生成视频`.
  - No web app first release: Task 1 includes `不做网页页面`.
  - Output contract sections: Task 1 defines and Task 3 validates the six required sections.
- Placeholder scan:
  - No placeholder-style instructions or vague "add tests" instructions.
- Type consistency:
  - The skill name is consistently `seedance-video-preset-reverse`.
  - The default asset references are consistently `@图片1` and `@视频1`.
