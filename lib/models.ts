// 模型注册表：业务尺寸 → 各 provider 的尺寸参数；扩展模型只需加一条 MODELS。
export type Provider = "kie"; // 后续: | "openai" | "replicate"
export type BizSize = "800x800" | "800x1200" | "1200x800";

// KIE createTask 的 input 对象由各模型自己拼（键名/额外字段因模型而异）
export interface BuildInputArgs {
  prompt: string;
  imageUrls: string[];
  size: string; // 已解析的 provider 原生尺寸串，如 "9:16" / "square_hd"
}

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  kind: "edit" | "t2i"; // edit 需输入图；t2i 纯文生图
  sizeParam: (size: BizSize) => string;
  buildInput: (p: BuildInputArgs) => Record<string, unknown>;
}

const KIE_SIZE: Record<BizSize, string> = {
  "800x800": "1:1",
  "800x1200": "9:16",
  "1200x800": "16:9",
};

// Seedream V4 用自己的 image_size 词表；比例与 KIE_SIZE 对齐（1:1 / 9:16 / 16:9）
const SEEDREAM_SIZE: Record<BizSize, string> = {
  "800x800": "square_hd",
  "800x1200": "portrait_16_9",
  "1200x800": "landscape_16_9",
};

// nano-banana / seedream 共用：image_urls + image_size + output_format
const kieEditInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt,
  image_urls: p.imageUrls,
  output_format: "png",
  image_size: p.size,
});

// GPT Image 图生图：input_urls + aspect_ratio + 固定 1K 分辨率（1:1 禁 4K，故不触发）
const gptImageInput = (p: BuildInputArgs): Record<string, unknown> => ({
  prompt: p.prompt,
  input_urls: p.imageUrls,
  aspect_ratio: p.size,
  resolution: "1K",
});

export const MODELS: ModelDef[] = [
  { id: "google/nano-banana-edit", label: "Nano Banana Edit", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s], buildInput: kieEditInput },
  { id: "bytedance/seedream-v4-edit", label: "Seedream V4 Edit", provider: "kie", kind: "edit", sizeParam: (s) => SEEDREAM_SIZE[s], buildInput: kieEditInput },
  { id: "gpt-image-2-image-to-image", label: "GPT Image (image-to-image)", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s], buildInput: gptImageInput },
];

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`未知模型：${id}，可用：${MODELS.map((x) => x.id).join(", ")}`);
  return m;
}
