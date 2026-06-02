# Seedance 2.0 Video Preset Builder Design

## Context

The current project is a Next.js and TypeScript tool for bulk image prompt generation. It already has KIE API credentials, task polling, local run storage, preview pages, and history pages for image generation. The new feature should extend the product direction toward video effect templates: given a reference video URL, produce a reusable Seedance 2.0 preset that an operator can configure in another backend, and later allow end users to upload one target image to apply that preset.

The approved first version is a template generator, not a full video generation workflow. The user-facing output should be natural-language Chinese, not a JSON blob. JSON-like structures may exist internally for storage, validation, and future API compatibility, but the visible deliverable is a Chinese preset write-up and final Seedance prompt.

## Goals

Build a Seedance 2.0 video preset builder that:

- Accepts a reference video URL.
- Produces a structured Chinese analysis of the video effect.
- Produces a reusable Chinese Seedance 2.0 prompt template based on the Seedance guide.
- Produces a final Chinese prompt after the operator chooses or uploads a target image slot.
- Presents the result in a format suitable for copying into another project's backend configuration.
- Prepares the codebase for KIE `bytedance/seedance-2` integration without making live video generation required in the first release.

## Non-Goals

The first release will not:

- Require real video generation to complete the preset-building flow.
- Require a database; local JSON/file storage is enough.
- Implement payment, premium gating, or user accounts.
- Automatically download videos from platforms that block direct file access.
- Show JSON as the primary output format.
- Guarantee that every public social/video URL can be inspected unless the URL exposes a direct or embeddable video resource.

## Product Flow

1. The operator opens the video preset builder.
2. The operator enters a reference video URL and optional template name/category/tags.
3. The system records the reference URL and asks the model to produce a Chinese reverse prompt analysis.
4. The output page shows:
   - Reference video preview when embeddable.
   - Chinese effect summary.
   - Chinese shot-by-shot timeline.
   - Chinese Seedance prompt template.
   - Chinese backend configuration notes.
   - Copy buttons for each natural-language block.
5. The operator may provide a target image slot description such as `@图片1 为用户上传的目标主体图`.
6. The system renders a final Chinese prompt that can be copied into another project's preset backend.

## User-Facing Output Format

The visible output should be divided into Chinese sections, not JSON.

Example shape:

```text
模板名称：未来感眼镜穿梭模板

适用素材：
用户上传 1 张主体图片，作为 @图片1。参考视频作为 @视频1，用于复刻运镜、节奏、转场和主要视觉特效。

效果概述：
将参考视频中的主体替换为 @图片1 的人物或产品。整体保留原视频的快速推进、环绕镜头、空间穿梭和发光粒子转场，画面节奏紧凑，适合短视频爆款特效。

分镜时间轴：
0-3秒：镜头从主体中近景慢慢推近，主体抬头或转身，画面边缘出现轻微发光能量纹理。
3-6秒：参考 @视频1 的环绕镜头和运动节奏，主体周围出现空间扭曲与粒子拖影。
6-10秒：镜头进入主观视角或高速穿梭视角，完成主要特效爆发，最后定格在主体高光画面。

Seedance 2.0 提示词：
@图片1 作为目标主体图，@视频1 作为参考视频。将 @视频1 的运镜、动作节奏、转场方式和主要视觉特效复刻到 @图片1 的主体上...

后台配置备注：
推荐模式：多模态参考视频生成。生成时长：10秒。画幅：9:16。开启音频：按模板需要选择。
```

The output may include internal metadata in hidden state or local files, but the operator-facing result remains copyable Chinese prose.

## Seedance Prompt Rules

The prompt renderer must follow the Seedance 2.0 writing guide:

- Every referenced asset must have an explicit purpose, such as `@图片1 作为目标主体图` or `@视频1 作为运镜、动作、特效和节奏参考`.
- The prompt should cover subject, scene, action, camera movement, timeline, transition/effect, audio, and style.
- Presets longer than 8-10 seconds should include a timeline.
- Viral effect templates should emphasize reference video camera motion, rhythm, transitions, and effect replication.
- If a target image is provided, the final prompt must clearly say whether it is a subject image, first frame, style reference, product appearance reference, or background reference.
- Avoid relying on unsupported real-person face guarantees. If the template expects realistic human face consistency, warn the operator that Seedance may reject or degrade that use case.

## KIE Seedance 2.0 Integration Decision

Yes, the project should account for KIE Seedance 2.0. The existing KIE code only supports image-oriented task creation through image model definitions. KIE's current Seedance 2.0 docs list the model as `bytedance/seedance-2` on `/api/v1/jobs/createTask`, with inputs including `prompt`, `first_frame_url`, `last_frame_url`, `reference_image_urls`, `reference_video_urls`, `reference_audio_urls`, `generate_audio`, `resolution`, `aspect_ratio`, `duration`, and `web_search`.

However, live KIE video generation is not required for first-release preset building. The design should split this into two layers:

1. Preset builder layer:
   - Generates Chinese preset copy and final Seedance prompt.
   - Stores KIE-compatible generation recommendations such as duration, aspect ratio, audio toggle, and generation mode.
   - Does not call KIE.

2. Optional generation layer:
   - Adds `bytedance/seedance-2` as a video model/provider.
   - Uploads or accepts public URLs for target images and reference videos.
   - Creates KIE video tasks and polls results.
   - Can be enabled later as a "test generate" or full user-facing generation flow.

This keeps the first version useful for backend configuration while preventing the prompt reverse-engineering tool from being blocked by video upload, task polling, cost, or result storage complexity.

## KIE Mode Constraints

KIE's Seedance 2.0 documentation says the following scenarios are mutually exclusive:

- Image-to-video with first frame.
- Image-to-video with first and last frame.
- Multimodal reference-to-video with reference images, videos, or audio.

The preset builder must therefore store a recommended generation mode in operator-facing terms:

- `首帧图生视频`：use when the uploaded image must be the exact first frame.
- `首尾帧图生视频`：use when exact beginning and ending images matter.
- `多模态参考视频生成`：use when the reference video's motion, effects, audio, or rhythm matters more than exact first/last frame identity.
- `纯文本视频生成`：use only for templates that do not require uploaded user assets.

For the Higgsfield-style use case where the user uploads one target image and applies a viral reference effect, the recommended default is `多模态参考视频生成`, with `@图片1` as the target subject and `@视频1` as the effect/camera/rhythm reference. If a template must force the uploaded image to be the first frame, the recommendation should switch to `首帧图生视频` and avoid reference video inputs in the same KIE request.

## Information Architecture

The first release should add:

- `/video-presets`: a grid of existing video preset templates.
- `/video-presets/new`: a builder form for entering a reference video URL and generating Chinese preset copy.
- `/video-presets/[id]`: detail page with reference preview, Chinese analysis, template prompt, target image slot instructions, and final prompt.

These pages can reuse the current app's plain operational UI style. The preset grid should feel closer to a working template library than a marketing landing page: compact cards, visible preview area, title, category, tags, and quick actions.

## Data Storage

Use local file storage for the first release, following the project's existing `runs/` and `output/` pattern.

Suggested stored fields:

- `id`
- `title`
- `sourceVideoUrl`
- `previewVideoUrl`
- `category`
- `tags`
- `recommendedMode`
- `duration`
- `aspectRatio`
- `generateAudio`
- `assetInstructions`
- `effectSummary`
- `timeline`
- `promptTemplate`
- `backendNotes`
- `createdAt`
- `updatedAt`

These fields are implementation details. The UI should render them as Chinese natural-language sections.

## Error Handling

The builder should handle:

- Empty or invalid video URL.
- Video URL that cannot be embedded or previewed.
- Missing template title, by deriving a conservative title from the generated effect summary.
- Generated analysis missing required Seedance sections, by showing validation warnings and asking the operator to regenerate or edit.
- Prompt missing explicit `@图片1` or `@视频1` usage, by blocking copy of the final prompt until the issue is fixed.

## Testing

Focused tests should cover:

- Preset validation requires a source video URL, prompt template, and explicit asset references.
- Prompt rendering replaces or inserts the target image slot in Chinese without producing JSON output.
- Mode validation rejects incompatible KIE recommendations, such as first-frame and multimodal references in the same generated request.
- Storage can save, read, update, and list presets.
- UI smoke tests or component tests verify the builder and detail page show Chinese sections and copyable prompt text.

## Open Implementation Notes

Prompt reverse-engineering needs an analysis model. The first implementation can use a text-only prompt over operator-supplied video descriptions or URLs if direct video inspection is unavailable. A later version can add actual video frame sampling or multimodal video analysis if the runtime supports it.

If KIE generation is added in the same implementation cycle, it should be a separate provider extension and route, not mixed into the preset analysis module. Video generation returns video URLs rather than image URLs, so the current image-only provider and post-processing flow must be generalized instead of reused blindly.
