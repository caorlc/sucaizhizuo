import { describe, it, expect } from "vitest";
import {
  defaultCenteredSquare,
  clampBox,
  mapCropToSource,
  COVER_SIZE,
} from "./coverCrop";

// ---- 常量 ----
describe("COVER_SIZE", () => {
  it("导出值为 800", () => {
    expect(COVER_SIZE).toBe(800);
  });
});

// ---- defaultCenteredSquare ----
describe("defaultCenteredSquare", () => {
  it("横图（宽>高）：size = displayH，x 居中，y = 0", () => {
    // 1280×720 横图
    const box = defaultCenteredSquare(1280, 720);
    expect(box.size).toBe(720);
    expect(box.y).toBe(0);
    // x 应为 (1280 - 720) / 2 = 280
    expect(box.x).toBe(280);
  });

  it("竖图（高>宽）：size = displayW，x = 0，y 居中", () => {
    // 400×800 竖图
    const box = defaultCenteredSquare(400, 800);
    expect(box.size).toBe(400);
    expect(box.x).toBe(0);
    // y 应为 (800 - 400) / 2 = 200
    expect(box.y).toBe(200);
  });

  it("正方形（宽=高）：size = displayW，x = 0，y = 0", () => {
    const box = defaultCenteredSquare(600, 600);
    expect(box.size).toBe(600);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
  });

  it("奇数宽高居中取整正确（400×225）", () => {
    // 225 为较小边，x = round((400-225)/2) = 88
    const box = defaultCenteredSquare(400, 225);
    expect(box.size).toBe(225);
    expect(box.x).toBe(88);
    expect(box.y).toBe(0);
  });
});

// ---- clampBox ----
describe("clampBox", () => {
  it("正常框无需 clamp 时原样返回", () => {
    const box = { x: 10, y: 10, size: 100 };
    const result = clampBox(box, 400, 300);
    expect(result).toEqual({ x: 10, y: 10, size: 100 });
  });

  it("size 超过较小边时裁到 min(displayW, displayH)", () => {
    // displayH=300 为较小边，size=400 → 应 clamp 到 300
    const box = { x: 0, y: 0, size: 400 };
    const result = clampBox(box, 800, 300);
    expect(result.size).toBe(300);
  });

  it("size 超过 displayW 时裁到 displayW（竖图情形）", () => {
    // 竖图：displayW=200 < displayH=500，size=300 → clamp 到 200
    const box = { x: 0, y: 0, size: 300 };
    const result = clampBox(box, 200, 500);
    expect(result.size).toBe(200);
  });

  it("x 超出右边界时拉回", () => {
    // displayW=400, size=100, x=350 → 超出(350+100=450>400)，应 clamp 到 400-100=300
    const box = { x: 350, y: 0, size: 100 };
    const result = clampBox(box, 400, 300);
    expect(result.x).toBe(300);
    expect(result.y).toBe(0);
  });

  it("y 超出下边界时拉回", () => {
    // displayH=300, size=100, y=250 → 超出(250+100=350>300)，应 clamp 到 300-100=200
    const box = { x: 0, y: 250, size: 100 };
    const result = clampBox(box, 400, 300);
    expect(result.y).toBe(200);
  });

  it("x 为负数时 clamp 到 0", () => {
    const box = { x: -50, y: 0, size: 100 };
    const result = clampBox(box, 400, 300);
    expect(result.x).toBe(0);
  });

  it("y 为负数时 clamp 到 0", () => {
    const box = { x: 0, y: -30, size: 100 };
    const result = clampBox(box, 400, 300);
    expect(result.y).toBe(0);
  });

  it("size <= 0 时强制为 1", () => {
    const box = { x: 0, y: 0, size: 0 };
    const result = clampBox(box, 400, 300);
    expect(result.size).toBeGreaterThanOrEqual(1);
  });
});

// ---- mapCropToSource ----
describe("mapCropToSource", () => {
  // 典型用例：display 400×225，source 1280×720，scale = 1280/400 = 3.2
  const displayW = 400;
  const displayH = 225;
  const sourceW = 1280;
  const sourceH = 720;

  it("左上角满框（0,0,225）→ sx=0, sy=0, sSize≈720", () => {
    // box.size=225, scale=3.2, sSize=round(225*3.2)=720
    const result = mapCropToSource(
      { x: 0, y: 0, size: 225 },
      displayW,
      displayH,
      sourceW,
      sourceH
    );
    expect(result.sx).toBe(0);
    expect(result.sy).toBe(0);
    expect(result.sSize).toBe(720);
  });

  it("居中框：x=87.5, y=0, size=225 → sx≈280, sy=0, sSize=720", () => {
    // scale=3.2，sx=round(87.5*3.2)=280，sSize=720
    // 280+720=1000 <= 1280 → 无需 clamp
    const result = mapCropToSource(
      { x: 87.5, y: 0, size: 225 },
      displayW,
      displayH,
      sourceW,
      sourceH
    );
    expect(result.sx).toBe(280);
    expect(result.sy).toBe(0);
    expect(result.sSize).toBe(720);
  });

  it("越界用例：box 延伸超出 source 右边界时 sx+sSize 被 clamp", () => {
    // 故意让 sx+sSize > sourceW
    // box.x=300, size=200, scale=3.2 → sx=round(300*3.2)=960, sSize=640 → 960+640=1600>1280
    // 应 clamp sx 到 max(0, 1280-640)=640
    const result = mapCropToSource(
      { x: 300, y: 0, size: 200 },
      displayW,
      displayH,
      sourceW,
      sourceH
    );
    // sx + sSize 不超过 sourceW
    expect(result.sx + result.sSize).toBeLessThanOrEqual(sourceW);
    expect(result.sx).toBeGreaterThanOrEqual(0);
  });

  it("小 display / 大 source（scale > 1）缩放正确", () => {
    // display 100×100, source 800×800, scale=8
    // box {x:10, y:10, size:80} → sx=80, sy=80, sSize=640
    const result = mapCropToSource(
      { x: 10, y: 10, size: 80 },
      100,
      100,
      800,
      800
    );
    expect(result.sx).toBe(80);
    expect(result.sy).toBe(80);
    expect(result.sSize).toBe(640);
  });

  it("sSize 不超过 min(sourceW, sourceH)", () => {
    // 超大 size 场景：display 100×100, source 200×300
    // box {x:0, y:0, size:100} → scale=2, sSize=200 = sourceW（较小值），合法
    const result = mapCropToSource(
      { x: 0, y: 0, size: 100 },
      100,
      100,
      200,
      300
    );
    expect(result.sSize).toBeLessThanOrEqual(Math.min(200, 300));
    expect(result.sx + result.sSize).toBeLessThanOrEqual(200);
    expect(result.sy + result.sSize).toBeLessThanOrEqual(300);
  });
});
