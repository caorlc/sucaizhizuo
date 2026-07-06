"use client";

// 封面截取核心组件：视频定格 + 1:1 裁切框 + 导出 800×800 WebP

import { useState, useRef, useCallback, useEffect } from "react";
import {
  COVER_SIZE,
  CropBox,
  defaultCenteredSquare,
  clampBox,
  mapCropToSource,
} from "@/lib/coverCrop";

interface CoverPickerClientProps {
  /** webm 相对路径，如 _videos/john-xxx.webm */
  src: string;
}

// 拖动交互状态枚举
type DragMode = "none" | "move" | "resize";

// 捕获到的帧信息
interface CapturedFrame {
  /** 帧图像数据所在的离屏 canvas */
  canvas: HTMLCanvasElement;
  sourceW: number;
  sourceH: number;
}

export default function CoverPickerClient({ src }: CoverPickerClientProps) {
  // 视频 URL（同源路由）
  const videoUrl = `/api/image/output/${src}`;

  // 下载文件名：去掉目录前缀和 .webm 扩展名
  const baseName = src.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  const downloadName = `${baseName}-cover.webp`;

  // 视频是否已 loadeddata（用于启用捕获按钮）
  const [videoReady, setVideoReady] = useState(false);

  // 已捕获的帧（null = 尚未捕获）
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);

  // 裁切框（显示坐标系，单位为 canvas 内部缓冲 px）
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, size: 100 });

  // 错误信息
  const [downloadError, setDownloadError] = useState("");

  // 当前帧时间（仅展示）
  const [currentTime, setCurrentTime] = useState(0);

  // video 元素引用
  const videoRef = useRef<HTMLVideoElement>(null);

  // 显示帧的容器（用于读取 CSS 宽度）
  const frameContainerRef = useRef<HTMLDivElement>(null);

  // 帧 canvas 元素（绘制帧 + 裁切框叠加）
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * capturedFrame 的镜像 ref，供 pointer 事件回调读取，避免 stale closure。
   * 每次 setCapturedFrame 时同步更新。
   */
  const capturedFrameRef = useRef<CapturedFrame | null>(null);

  // 拖动状态 ref（避免 pointermove 中 stale closure）
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startBox: CropBox;
    displayW: number;
    displayH: number;
  }>({
    mode: "none",
    startX: 0,
    startY: 0,
    startBox: { x: 0, y: 0, size: 100 },
    displayW: 1,
    displayH: 1,
  });

  // ---- 核心辅助：按视频真实宽高比推算显示尺寸 ----
  /**
   * 取容器当前 CSS 宽度（dw），然后按 sourceH/sourceW 推算 dh。
   * 这样 canvas 内部缓冲与真实视频比例完全一致，
   * 不再依赖容器的测量高度（容器高度由 canvas 自身撑开，首次可能不准）。
   */
  const computeDisplaySize = useCallback((): { dw: number; dh: number } => {
    const el = frameContainerRef.current;
    const cf = capturedFrameRef.current;
    if (!el || !cf) return { dw: 1, dh: 1 };
    const dw = el.getBoundingClientRect().width;
    // 按视频真实宽高比推算高度，消除 canvas 默认 300×150 带来的误差
    const dh = Math.round((dw * cf.sourceH) / cf.sourceW);
    return { dw, dh };
  }, []);

  // ---- 兜底：避免 videoReady 竞态 ----
  // 视频经 /api/image 提供且带 immutable 长缓存，可能在 React 绑定 onLoadedData
  // 之前就（从缓存）加载完成，导致 loadeddata 事件被漏掉、videoReady 卡在 false、
  // 「捕获当前帧」按钮永久禁用。挂载时主动检查 readyState，并冗余监听多种就绪事件。
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const markReady = () => setVideoReady(true);
    if (v.readyState >= 2) markReady(); // HAVE_CURRENT_DATA：已有当前帧数据
    v.addEventListener("loadedmetadata", markReady);
    v.addEventListener("loadeddata", markReady);
    v.addEventListener("canplay", markReady);
    return () => {
      v.removeEventListener("loadedmetadata", markReady);
      v.removeEventListener("loadeddata", markReady);
      v.removeEventListener("canplay", markReady);
    };
  }, []);

  // ---- 视频事件 ----

  function handleVideoLoaded() {
    setVideoReady(true);
  }

  function handleTimeUpdate() {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }

  /** 上一帧（-1/30 秒） */
  function handlePrevFrame() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime - 1 / 30);
  }

  /** 下一帧（+1/30 秒） */
  function handleNextFrame() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(v.duration || 0, v.currentTime + 1 / 30);
  }

  // ---- 捕获当前帧 ----

  function handleCapture() {
    const v = videoRef.current;
    if (!v || !videoReady) return;

    const w = v.videoWidth;
    const h = v.videoHeight;
    if (w === 0 || h === 0) return;

    // 离屏 canvas 存原始帧像素
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);

    const frame: CapturedFrame = { canvas: offscreen, sourceW: w, sourceH: h };
    // 先同步更新 ref，确保 computeDisplaySize 在 effect 里能读到最新值
    capturedFrameRef.current = frame;
    setCapturedFrame(frame);
    setDownloadError("");
  }

  // 当捕获帧后，等容器渲染一帧再初始化裁切框（居中正方形）
  useEffect(() => {
    if (!capturedFrame) return;

    requestAnimationFrame(() => {
      const { dw, dh } = computeDisplaySize();
      if (dw > 1 && dh > 1) {
        setCropBox(defaultCenteredSquare(dw, dh));
      }
    });
  }, [capturedFrame, computeDisplaySize]);

  // 每次 cropBox / capturedFrame 变化，重绘 preview canvas
  useEffect(() => {
    if (!capturedFrame || !previewCanvasRef.current) return;

    const { dw, dh } = computeDisplaySize();
    if (dw <= 1 || dh <= 1) return;

    const canvas = previewCanvasRef.current;
    // 设置内部缓冲尺寸为真实视频比例（消除拉伸）
    canvas.width = dw;
    canvas.height = dh;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y, size } = cropBox;

    // 1) 底层：原始帧按真实比例绘制（不拉伸）
    ctx.globalAlpha = 1;
    ctx.drawImage(capturedFrame.canvas, 0, 0, dw, dh);

    // 2) 全局半透明暗遮罩
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, dw, dh);

    // 3) 裁切区域：重新绘制原图（clip 到正方形区域，覆盖暗遮罩）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.drawImage(capturedFrame.canvas, 0, 0, dw, dh);
    ctx.restore();

    // 4) 裁切框边框（blue-500）
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

    // 5) 四角 handle（右下角可拖动改变大小）
    const hs = 10; // handle 半尺寸
    // 右下角（主要交互 handle，蓝色实心）
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(x + size - hs, y + size - hs, hs * 2, hs * 2);
    // 其余三角（仅视觉提示）
    ctx.fillStyle = "rgba(59,130,246,0.6)";
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.fillRect(x + size - hs / 2, y - hs / 2, hs, hs);
    ctx.fillRect(x - hs / 2, y + size - hs / 2, hs, hs);

    // 6) 尺寸提示文字
    ctx.fillStyle = "#3b82f6";
    ctx.font = "12px monospace";
    ctx.fillText(
      `${size}×${size} px`,
      x + 4,
      y - 6 > 12 ? y - 6 : y + 18
    );
  }, [capturedFrame, cropBox, computeDisplaySize]);

  // ---- 拖动交互（pointer 事件） ----

  // 用一个独立的 cropBoxRef 镜像 cropBox，供 pointerDown 中同步读取（避免 stale closure）
  const cropBoxRef = useRef<CropBox>(cropBox);
  useEffect(() => {
    cropBoxRef.current = cropBox;
  }, [cropBox]);

  const handlePointerDownReal = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!capturedFrameRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      const rect = e.currentTarget.getBoundingClientRect();
      // 将 CSS px 转换到 canvas 内部缓冲 px（正常情况下比例≈1，保险起见仍做换算）
      const scaleX = e.currentTarget.width / rect.width;
      const scaleY = e.currentTarget.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;

      const { dw, dh } = computeDisplaySize();
      const { x, y, size } = cropBoxRef.current;
      const hs = 14; // handle 点击热区（canvas 内部 px）

      // 判断是否点中右下角 resize handle
      const inResizeHandle =
        px >= x + size - hs &&
        px <= x + size + hs &&
        py >= y + size - hs &&
        py <= y + size + hs;

      // 判断是否点中框体（move）
      const inBox = px >= x && px <= x + size && py >= y && py <= y + size;

      if (inResizeHandle) {
        dragRef.current = {
          mode: "resize",
          startX: px,
          startY: py,
          startBox: { ...cropBoxRef.current },
          displayW: dw,
          displayH: dh,
        };
      } else if (inBox) {
        dragRef.current = {
          mode: "move",
          startX: px,
          startY: py,
          startBox: { ...cropBoxRef.current },
          displayW: dw,
          displayH: dh,
        };
      } else {
        dragRef.current = {
          mode: "none",
          startX: 0,
          startY: 0,
          startBox: cropBoxRef.current,
          displayW: dw,
          displayH: dh,
        };
      }
    },
    [computeDisplaySize]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { mode, startX, startY, startBox, displayW, displayH } =
        dragRef.current;
      if (mode === "none") return;

      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = e.currentTarget.width / rect.width;
      const scaleY = e.currentTarget.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;

      const dx = px - startX;
      const dy = py - startY;

      if (mode === "move") {
        const newBox = clampBox(
          { x: startBox.x + dx, y: startBox.y + dy, size: startBox.size },
          displayW,
          displayH
        );
        setCropBox(newBox);
      } else if (mode === "resize") {
        // 取 dx/dy 中较大者作为 size 增量（右下角拖动保持正方形）
        const delta = Math.max(dx, dy);
        const newSize = Math.max(20, startBox.size + delta);
        const newBox = clampBox(
          { x: startBox.x, y: startBox.y, size: newSize },
          displayW,
          displayH
        );
        setCropBox(newBox);
      }
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current.mode = "none";
  }, []);

  // ---- 下载 800×800 WebP ----

  function handleDownload() {
    if (!capturedFrame) return;
    const { canvas: srcCanvas, sourceW, sourceH } = capturedFrame;

    // 用推算的显示尺寸（和绘制时保持一致）
    const { dw, dh } = computeDisplaySize();
    if (dw <= 1 || dh <= 1) return;

    // 把显示坐标映射到源像素坐标
    const { sx, sy, sSize } = mapCropToSource(
      cropBox,
      dw,
      dh,
      sourceW,
      sourceH
    );

    // 新建 800×800 输出 canvas
    const outCanvas = document.createElement("canvas");
    outCanvas.width = COVER_SIZE;
    outCanvas.height = COVER_SIZE;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) {
      setDownloadError("无法创建 canvas 上下文，请检查浏览器支持");
      return;
    }

    // 从源帧 canvas 裁切并缩放到 800×800
    ctx.drawImage(srcCanvas, sx, sy, sSize, sSize, 0, 0, COVER_SIZE, COVER_SIZE);

    // 导出 WebP 并触发下载
    try {
      outCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setDownloadError(
              "导出 WebP 失败：blob 为空，请检查浏览器是否支持 image/webp"
            );
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          // 延迟释放，确保浏览器下载对话框已弹出
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          setDownloadError("");
        },
        "image/webp",
        0.92
      );
    } catch (err) {
      setDownloadError(
        `导出失败：${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ---- 格式化时间 ----
  function formatTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  }

  // ---- 「源像素」实时显示（用推算尺寸）----
  function renderSourceInfo(): string {
    if (!capturedFrame) return "—";
    const { dw, dh } = computeDisplaySize();
    if (dw <= 1) return "—";
    const { sx, sy, sSize } = mapCropToSource(
      cropBox,
      dw,
      dh,
      capturedFrame.sourceW,
      capturedFrame.sourceH
    );
    return `(${sx}, ${sy}) ${sSize}×${sSize}`;
  }

  return (
    <div className="max-w-3xl">
      {/* 顶部导航 */}
      <div className="mb-6 flex items-center gap-4 text-sm">
        <a
          href="/video/history"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          &larr; 视频历史
        </a>
        <a
          href="/video"
          className="text-gray-500 hover:text-gray-700 hover:underline"
        >
          AI Video
        </a>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">截取视频封面</h1>
      <p className="text-gray-500 text-sm mb-6">
        拖到目标画面 &rarr; 捕获帧 &rarr; 调整裁切框 &rarr; 下载{" "}
        {COVER_SIZE}&times;{COVER_SIZE} WebP
      </p>

      {/* 视频文件名提示 */}
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 mb-4 text-xs font-mono text-gray-600 truncate">
        {src}
      </div>

      {/* 视频播放器 */}
      <div className="rounded border border-gray-200 bg-black overflow-hidden mb-3">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full"
          style={{ maxHeight: "360px" }}
          onLoadedData={handleVideoLoaded}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>

      {/* 帧微调 + 时间显示 + 捕获按钮 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={handlePrevFrame}
          disabled={!videoReady}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="上一帧（-1/30s）"
        >
          &#9664; 上一帧
        </button>
        <button
          type="button"
          onClick={handleNextFrame}
          disabled={!videoReady}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="下一帧（+1/30s）"
        >
          下一帧 &#9654;
        </button>
        <span className="text-xs font-mono text-gray-400">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCapture}
          disabled={!videoReady}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          捕获当前帧
        </button>
      </div>

      {/* 未捕获提示 */}
      {!capturedFrame && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-400 text-sm">
          先拖动视频到想要的画面，点「捕获当前帧」后在此调整裁切区域
        </div>
      )}

      {/* 捕获帧 + 裁切框 */}
      {capturedFrame && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">调整裁切框</p>
            <p className="text-xs text-gray-400">
              拖动框体移动位置 · 拖动右下角调整大小（锁定 1:1 正方形）
            </p>
          </div>

          {/* 帧容器：block 布局，canvas 的 CSS 宽度由 w-full 决定，高度由内部缓冲比例自然撑开 */}
          <div
            ref={frameContainerRef}
            className="relative rounded border border-gray-200 overflow-hidden bg-black select-none"
            style={{ lineHeight: 0 }} // 消除 inline 元素底部空白
          >
            {/* 交互 canvas（绘制帧 + 裁切框）；CSS w-full 自适应宽度，高度由缓冲比例撑开 */}
            <canvas
              ref={previewCanvasRef}
              className="block w-full cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDownReal}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              aria-label="视频帧裁切区域，拖动调整裁切框位置和大小"
            />
          </div>

          {/* 裁切框尺寸信息 */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>
              裁切框：({Math.round(cropBox.x)}, {Math.round(cropBox.y)}) 大小{" "}
              {Math.round(cropBox.size)}px
            </span>
            <span>源像素：{renderSourceInfo()}</span>
          </div>

          {/* 下载错误提示 */}
          {downloadError && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {downloadError}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              下载 {COVER_SIZE}&times;{COVER_SIZE} WebP
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={!videoReady}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              重新捕获
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
