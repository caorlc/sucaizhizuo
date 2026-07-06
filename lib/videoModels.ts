// 视频模型注册表：文生视频 / 图生视频，模仿 lib/models.ts 风格
// 扩展模型只需在 MODELS 数组中加一条记录

export type VideoModelId =
  | "grok-imagine/text-to-video"
  | "grok-imagine/image-to-video";

// 视频宽高比枚举
export type VideoAspect = "2:3" | "3:2" | "1:1" | "16:9" | "9:16";

// 视频分辨率枚举
export type VideoResolution = "480p" | "720p";

// 视频模式：文生视频 / 图生视频
export type VideoMode = "t2v" | "i2v";

// buildInput 所需参数
export interface VideoBuildArgs {
  prompt: string;
  imageUrls?: string[]; // 仅 i2v 使用
  aspectRatio: VideoAspect;
  resolution: VideoResolution;
  duration: number; // 秒，范围 6-30
}

// 视频模型定义（与 ModelDef 接口风格一致）
export interface VideoModelDef {
  id: VideoModelId;
  label: string;
  kind: VideoMode;
  buildInput: (a: VideoBuildArgs) => Record<string, unknown>;
}

// 可用的宽高比列表（给前端用）
export const VIDEO_ASPECTS: VideoAspect[] = ["2:3", "3:2", "1:1", "16:9", "9:16"];

// 可用的分辨率列表（给前端用）
export const VIDEO_RESOLUTIONS: VideoResolution[] = ["480p", "720p"];

// 文生视频 input 构造：prompt + aspect_ratio + resolution + duration + mode 固定 normal
const t2vBuildInput = (a: VideoBuildArgs): Record<string, unknown> => ({
  prompt: a.prompt,
  aspect_ratio: a.aspectRatio,
  resolution: a.resolution,
  duration: a.duration,
  mode: "normal", // 固定传 normal，不暴露 spicy
});

// 图生视频 input 构造：image_urls + prompt + aspect_ratio + resolution + duration + mode 固定 normal
const i2vBuildInput = (a: VideoBuildArgs): Record<string, unknown> => ({
  image_urls: a.imageUrls ?? [],
  prompt: a.prompt,
  aspect_ratio: a.aspectRatio,
  resolution: a.resolution,
  duration: a.duration,
  mode: "normal", // 固定传 normal，不暴露 spicy
});

// 视频模型注册表
export const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: "grok-imagine/text-to-video",
    label: "Grok 文生视频",
    kind: "t2v",
    buildInput: t2vBuildInput,
  },
  {
    id: "grok-imagine/image-to-video",
    label: "Grok 图生视频",
    kind: "i2v",
    buildInput: i2vBuildInput,
  },
];

// 按 id 查找模型，找不到抛中文错误
export function getVideoModel(id: string): VideoModelDef {
  const m = VIDEO_MODELS.find((x) => x.id === id);
  if (!m) {
    throw new Error(
      `未知视频模型：${id}，可用：${VIDEO_MODELS.map((x) => x.id).join(", ")}`
    );
  }
  return m;
}

// 按 mode（t2v / i2v）查找对应的模型定义
export function getVideoModelByMode(mode: VideoMode): VideoModelDef {
  const m = VIDEO_MODELS.find((x) => x.kind === mode);
  if (!m) {
    throw new Error(`找不到 mode=${mode} 对应的视频模型`);
  }
  return m;
}
