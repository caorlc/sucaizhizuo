// provider 通用接口（单独成文件，避免 index ↔ kie 循环依赖）
export interface GenInput {
  model: string;
  prompt: string;
  imageUrls?: string[];
  size: string; // provider 原生尺寸参数，如 KIE "9:16"
}

export interface GenProvider {
  generate(input: GenInput): Promise<{ imageUrl: string }>;
}
