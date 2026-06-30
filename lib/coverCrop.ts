// 封面裁切纯函数库：全部不依赖 DOM，可在 vitest (node 环境) 直接测试

/** 导出封面尺寸常量（800×800 正方形 WebP） */
export const COVER_SIZE = 800;

/**
 * 显示坐标系下的正方形裁切框（单位：CSS px）。
 * x/y 为左上角坐标，size 为边长（宽=高=size）。
 */
export interface CropBox {
  x: number;
  y: number;
  size: number;
}

/**
 * 源像素坐标系下的正方形裁切区域（单位：视频原始像素）。
 * sx/sy 为左上角坐标，sSize 为边长。
 */
export interface SourceRect {
  sx: number;
  sy: number;
  sSize: number;
}

/**
 * 计算在 displayW×displayH 显示区内居中的最大正方形裁切框。
 * - 横图（宽>高）：size = displayH，x 居中，y = 0
 * - 竖图（高>宽）：size = displayW，x = 0，y 居中
 * - 正方形：size = displayW（= displayH），x = 0，y = 0
 */
export function defaultCenteredSquare(
  displayW: number,
  displayH: number
): CropBox {
  const size = Math.min(displayW, displayH);
  const x = Math.round((displayW - size) / 2);
  const y = Math.round((displayH - size) / 2);
  return { x, y, size };
}

/**
 * 把裁切框约束在 [0, displayW] × [0, displayH] 范围内。
 * 规则：
 *   1. size 不超过 min(displayW, displayH)，且 size >= 1
 *   2. x/y clamp 到 [0, display-size]（保证框不超出右/下边界）
 */
export function clampBox(
  box: CropBox,
  displayW: number,
  displayH: number
): CropBox {
  // 最大允许 size = 两边中较小值，最小 = 1
  const maxSize = Math.max(1, Math.min(displayW, displayH));
  const size = Math.max(1, Math.min(box.size, maxSize));

  // x 不超出右边界
  const x = Math.max(0, Math.min(box.x, displayW - size));
  // y 不超出下边界
  const y = Math.max(0, Math.min(box.y, displayH - size));

  return { x, y, size };
}

/**
 * 把显示坐标系中的裁切框映射到源像素坐标系。
 *
 * 假设视频以等比方式铺满显示区（即 scaleX = scaleY = sourceW / displayW）。
 * 实现步骤：
 *   1. scale = sourceW / displayW
 *   2. sx = round(box.x * scale)，sy = round(box.y * scale)，sSize = round(box.size * scale)
 *   3. clamp：确保 sx+sSize <= sourceW、sy+sSize <= sourceH、sx >= 0、sy >= 0
 */
export function mapCropToSource(
  box: CropBox,
  displayW: number,
  displayH: number,
  sourceW: number,
  sourceH: number
): SourceRect {
  // 等比缩放因子（以宽为基准，因为视频 object-fit:contain 对齐宽度）
  const scale = sourceW / displayW;

  let sx = Math.round(box.x * scale);
  let sy = Math.round(box.y * scale);
  let sSize = Math.round(box.size * scale);

  // clamp sSize 不超过两边中较小值
  const maxSSize = Math.min(sourceW, sourceH);
  sSize = Math.max(1, Math.min(sSize, maxSSize));

  // clamp sx/sy 使裁切框不超出源图边界
  sx = Math.max(0, Math.min(sx, sourceW - sSize));
  sy = Math.max(0, Math.min(sy, sourceH - sSize));

  // 防御：sy + sSize 超出 sourceH 时缩小 sSize
  if (sy + sSize > sourceH) {
    sSize = sourceH - sy;
  }
  if (sx + sSize > sourceW) {
    sSize = sourceW - sx;
  }

  return { sx, sy, sSize };
}
