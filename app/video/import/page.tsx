"use client";

// 视频链接导入页：粘贴 URL → 提交 → 跳转到结果轮询页
// 模仿 app/video/page.tsx 的表单风格与交互模式

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// 清晰度上限选项（undefined = 最佳原始）
interface HeightOption {
  label: string;
  value: number | undefined;
}

const HEIGHT_OPTIONS: HeightOption[] = [
  { label: "最佳/原始（默认）", value: undefined },
  { label: "≤ 1080p", value: 1080 },
  { label: "≤ 720p", value: 720 },
];

export default function VideoImportPage() {
  const router = useRouter();

  // 表单字段
  const [url, setUrl] = useState("");
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      // 前端基础校验
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        setError("请粘贴视频链接");
        return;
      }
      if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
        setError("链接必须以 http:// 或 https:// 开头");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/video/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: trimmedUrl,
            maxHeight,
          }),
        });

        const data = (await res.json()) as { runId?: string; error?: string };

        if (!res.ok || !data.runId) {
          setError(data.error ?? "提交失败，请重试");
          return;
        }

        // 跳转到结果轮询页（复用现有轮询 + 预览逻辑）
        router.push(`/video/${data.runId}`);
      } catch {
        setError("网络错误，请检查连接后重试");
      } finally {
        setLoading(false);
      }
    },
    [url, maxHeight, router]
  );

  return (
    <div className="max-w-2xl">
      {/* 页面标题 + 导航链接 */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">从链接下载视频</h1>
        <div className="flex gap-3 text-sm">
          <a
            href="/video"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            AI 生成
          </a>
          <a
            href="/video/history"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            视频历史
          </a>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-8">
        支持 X / YouTube / TikTok 等 yt-dlp 支持的站点。仅支持公开视频；下载他人内容请确保已获得使用授权。
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 视频链接输入 */}
        <div>
          <label
            htmlFor="url"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            视频链接 <span className="text-red-500">*</span>
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://x.com/xxx/status/... 或 https://youtube.com/watch?v=..."
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            粘贴 X、YouTube、TikTok 等平台的视频链接
          </p>
        </div>

        {/* 清晰度上限 */}
        <div>
          <label
            htmlFor="maxHeight"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            清晰度上限
          </label>
          <select
            id="maxHeight"
            value={maxHeight ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              setMaxHeight(val === "" ? undefined : Number(val));
            }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {HEIGHT_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            限制清晰度可减少下载时间和文件大小
          </p>
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
          {loading ? "获取视频信息中..." : "开始下载"}
        </button>
      </form>
    </div>
  );
}
