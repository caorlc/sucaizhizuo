// 模型注册表：业务尺寸 → 各 provider 的尺寸参数；扩展模型只需加一条 MODELS。
export type Provider = "kie"; // 后续: | "openai" | "replicate"
export type BizSize = "800x800" | "800x1200" | "1200x800";

export interface ModelDef {
  id: string;
  label: string;
  provider: Provider;
  kind: "edit" | "t2i"; // edit 需输入图；t2i 纯文生图
  sizeParam: (size: BizSize) => string;
}

const KIE_SIZE: Record<BizSize, string> = {
  "800x800": "1:1",
  "800x1200": "9:16",
  "1200x800": "16:9",
};

export const MODELS: ModelDef[] = [
  { id: "google/nano-banana-edit", label: "Nano Banana Edit（默认）", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
  { id: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
  { id: "black-forest-labs/flux-kontext-max", label: "Flux Kontext Max", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
];

export const DEFAULT_MODEL = "google/nano-banana-edit";

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`未知模型：${id}，可用：${MODELS.map((x) => x.id).join(", ")}`);
  return m;
}
