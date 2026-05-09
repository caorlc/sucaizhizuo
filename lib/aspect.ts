// 输出比例配置：横图 / 正方形 / 竖图
// 整条链路（Unsplash 取图 → KIE 生成 → sharp 后处理 → 前端缩略图）共用同一份配置

export type Aspect = "landscape" | "square" | "portrait";

export interface AspectConfig {
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  unsplashOrientation: "landscape" | "squarish" | "portrait";
  kieImageSize: "16:9" | "1:1" | "9:16";
  cssRatio: string;
}

export const ASPECT_CONFIG: Record<Aspect, AspectConfig> = {
  landscape: {
    label: "横图 1200×800",
    shortLabel: "横图",
    width: 1200,
    height: 800,
    unsplashOrientation: "landscape",
    kieImageSize: "16:9",
    cssRatio: "3/2",
  },
  square: {
    label: "正方形 1024×1024",
    shortLabel: "正方形",
    width: 1024,
    height: 1024,
    unsplashOrientation: "squarish",
    kieImageSize: "1:1",
    cssRatio: "1/1",
  },
  portrait: {
    label: "竖图 800×1200",
    shortLabel: "竖图",
    width: 800,
    height: 1200,
    unsplashOrientation: "portrait",
    kieImageSize: "9:16",
    cssRatio: "2/3",
  },
};

export const DEFAULT_ASPECT: Aspect = "square";

export function isAspect(v: unknown): v is Aspect {
  return v === "landscape" || v === "square" || v === "portrait";
}

export function getAspectConfig(aspect: Aspect | undefined): AspectConfig {
  return ASPECT_CONFIG[aspect ?? DEFAULT_ASPECT] ?? ASPECT_CONFIG[DEFAULT_ASPECT];
}
