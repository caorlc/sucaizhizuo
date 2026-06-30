"use client";

// AI Video 表单页：支持文生视频（t2v）和图生视频（i2v）切换
// 模仿 app/page.tsx 的表单风格与交互模式

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VIDEO_ASPECTS, VIDEO_RESOLUTIONS } from "@/lib/videoModels";
import type { VideoMode, VideoAspect, VideoResolution } from "@/lib/videoModels";

// duration 可选值（秒）
const DURATION_OPTIONS = [6, 8, 10, 15];

// 宽高比标签映射（人类可读）
const ASPECT_LABELS: Record<string, string> = {
  "2:3": "竖版 2:3",
  "3:2": "横版 3:2",
  "1:1": "正方形 1:1",
  "16:9": "宽屏 16:9",
  "9:16": "竖屏 9:16",
};

export default function VideoPage() {
  const router = useRouter();

  // 模式：文生视频 / 图生视频
  const [mode, setMode] = useState<VideoMode>("t2v");

  // 表单字段
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState<VideoAspect>("2:3");
  const [resolution, setResolution] = useState<VideoResolution>("480p");
  const [duration, setDuration] = useState(6);

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/video/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            prompt: prompt.trim(),
            imageUrl: imageUrl.trim() || undefined,
            aspectRatio,
            resolution,
            duration,
          }),
        });

        const data = (await res.json()) as { runId?: string; error?: string };

        if (!res.ok || !data.runId) {
          setError(data.error ?? "提交失败，请重试");
          return;
        }

        // 跳转到结果轮询页
        router.push(`/video/${data.runId}`);
      } catch {
        setError("网络错误，请检查连接后重试");
      } finally {
        setLoading(false);
      }
    },
    [mode, prompt, imageUrl, aspectRatio, resolution, duration, router]
  );

  return (
    <div className="max-w-2xl">
      {/* 页面标题 + 右上角导航 */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">AI Video 生成</h1>
        <div className="flex gap-3 text-sm">
          <a
            href="/video/import"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            从链接下载视频 &rarr;
          </a>
          <a
            href="/video/history"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            视频历史 &rarr;
          </a>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        基于 KIE.AI grok-imagine 模型，支持文生视频与图生视频。生成后在本地预览，确认满意后再转换为 WebM 格式下载。
      </p>

      {/* 模式切换：文生视频 / 图生视频 */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setMode("t2v")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            mode === "t2v"
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-300 text-gray-600 hover:border-gray-400"
          }`}
        >
          文生视频
        </button>
        <button
          type="button"
          onClick={() => setMode("i2v")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            mode === "i2v"
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-300 text-gray-600 hover:border-gray-400"
          }`}
        >
          图生视频
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Prompt */}
        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {mode === "t2v" ? (
              <>
                视频描述 <span className="text-red-500">*</span>
              </>
            ) : (
              <span>
                运动描述{" "}
                <span className="text-gray-400 font-normal">（可选）</span>
              </span>
            )}
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "t2v"
                ? "描述你想生成的视频内容，如：A cat playing on a rooftop at sunset"
                : "描述运动方式或镜头变化，如：Slow zoom in, gentle camera pan left，留空则由模型自动推断"
            }
            required={mode === "t2v"}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            style={{ minHeight: "100px" }}
          />
          <p className="text-xs text-gray-400 mt-1">
            建议使用英文，最长 5000 字符
          </p>
        </div>

        {/* 图片 URL（仅 i2v 模式显示） */}
        {mode === "i2v" && (
          <div>
            <label
              htmlFor="imageUrl"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              图片 URL <span className="text-red-500">*</span>
            </label>
            <input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              必须是公网可访问的 http(s) 图片地址（jpg / png / webp）
            </p>
          </div>
        )}

        {/* 宽高比 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            宽高比
          </label>
          <div className="flex flex-wrap gap-2">
            {VIDEO_ASPECTS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                  aspectRatio === ratio
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                {ASPECT_LABELS[ratio] ?? ratio}
              </button>
            ))}
          </div>
        </div>

        {/* 分辨率 */}
        <div>
          <label
            htmlFor="resolution"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            分辨率
          </label>
          <select
            id="resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as VideoResolution)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {VIDEO_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
                {r === "480p" ? "（默认，生成较快）" : "（更清晰，耗时更长）"}
              </option>
            ))}
          </select>
        </div>

        {/* 时长 */}
        <div>
          <label
            htmlFor="duration"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            时长（秒）
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} 秒{d === 6 ? "（默认）" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "提交中..." : `开始生成${mode === "t2v" ? "文生视频" : "图生视频"}`}
        </button>
      </form>
    </div>
  );
}
