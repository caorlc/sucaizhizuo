"use client";

import { useState, useMemo } from "react";
import Lightbox from "@/components/Lightbox";

// 把模型名转成 slug（与后端保持一致）
function toSlug(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface SuccessItem {
  index: number;
  filename: string;
  sourceUrl: string;
  success: true;
  previewUrl: string;
  sizeBytes: number;
}

interface FailItem {
  index: number;
  sourceUrl: string;
  success: false;
  error: string;
}

type ResultItem = SuccessItem | FailItem;

const URL_PLACEHOLDER = `https://picsum.photos/seed/abc/1024/768
https://picsum.photos/seed/def/600/900
https://picsum.photos/seed/xyz/800/600`;

export default function ShowcasePage() {
  const [model, setModel] = useState("");
  const [startIndex, setStartIndex] = useState(1);
  const [urlsText, setUrlsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ResultItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  // 实时文件名预览
  const filenamePreviews = useMemo(() => {
    const slug = toSlug(model);
    if (!slug) return "";
    const urls = urlsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) return `${slug}-${startIndex}.webp`;
    if (urls.length === 1) return `${slug}-${startIndex}.webp`;
    return `${slug}-${startIndex}.webp … ${slug}-${startIndex + urls.length - 1}.webp`;
  }, [model, startIndex, urlsText]);

  const visibleItems = items.filter((item) => !dismissed.has(item.index));
  const successItems = visibleItems.filter(
    (item): item is SuccessItem => item.success
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setItems([]);
    setDismissed(new Set());
    setLoading(true);

    const urls = urlsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.trim(), startIndex, urls }),
      });

      const data = (await res.json()) as {
        items?: ResultItem[];
        error?: string;
      };

      if (!res.ok || !data.items) {
        setError(data.error ?? "处理失败，请重试");
        return;
      }

      setItems(data.items);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss(index: number) {
    setDismissed((prev) => new Set(prev).add(index));
  }

  async function handleDownloadAll() {
    for (let i = 0; i < successItems.length; i++) {
      const item = successItems[i];
      const a = document.createElement("a");
      a.href = item.previewUrl;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (i < successItems.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Showcase 裁图</h1>
      <p className="text-gray-500 text-sm mb-8">
        输入图片 URL，自动裁成 800×1200 webp 竖图
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 模型名 */}
        <div>
          <label
            htmlFor="model"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            模型名 <span className="text-red-500">*</span>
          </label>
          <input
            id="model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如：seedream 4.5"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 起始序号 */}
        <div>
          <label
            htmlFor="startIndex"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            起始序号 <span className="text-red-500">*</span>
          </label>
          <input
            id="startIndex"
            type="number"
            value={startIndex}
            min={1}
            onChange={(e) => setStartIndex(parseInt(e.target.value, 10) || 1)}
            required
            className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 文件名预览 */}
        {model.trim() && (
          <div className="rounded bg-gray-50 border border-gray-200 px-3 py-2">
            <span className="text-xs text-gray-400 mr-2">文件名预览：</span>
            <span className="text-xs font-mono text-gray-700">
              {filenamePreviews || `${toSlug(model)}-${startIndex}.webp`}
            </span>
          </div>
        )}

        {/* URL 列表 */}
        <div>
          <label
            htmlFor="urlsText"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            图片 URL 列表 <span className="text-red-500">*</span>
            {urlsText.split("\n").filter((l) => l.trim()).length > 0 && (
              <span className="ml-2 text-xs font-normal text-blue-600">
                （
                {urlsText.split("\n").filter((l) => l.trim()).length} 个 URL）
              </span>
            )}
          </label>
          <textarea
            id="urlsText"
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder={URL_PLACEHOLDER}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
            style={{ minHeight: "160px" }}
          />
          <p className="text-xs text-gray-400 mt-1">每行一个 URL，仅支持 http / https</p>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "处理中…" : "开始处理"}
        </button>
      </form>

      {/* 处理中状态 */}
      {loading && (
        <div className="mt-8 text-center py-12 text-gray-400 text-sm">
          正在下载并裁剪图片，请稍候…
        </div>
      )}

      {/* 处理结果 */}
      {!loading && items.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              共处理 {items.length} 张，成功{" "}
              {items.filter((i) => i.success).length} 张
              {dismissed.size > 0 && `，已剔除 ${dismissed.size} 张`}
            </p>
            {successItems.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                全部下载（{successItems.length} 张）
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {visibleItems.map((item) => {
              if (!item.success) {
                return (
                  <div
                    key={item.index}
                    className="rounded border border-red-300 bg-red-50 p-2 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-red-600">
                        #{item.index}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismiss(item.index)}
                        className="text-red-400 hover:text-red-600 text-xs leading-none"
                        title="剔除"
                      >
                        ✗
                      </button>
                    </div>
                    <p className="text-xs text-red-500 break-all leading-relaxed">
                      {item.error}
                    </p>
                    <p className="text-xs text-red-300 break-all">
                      {item.sourceUrl}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={item.index}
                  className="rounded border border-gray-200 bg-white overflow-hidden flex flex-col"
                >
                  {/* 缩略图：800×1200 比例容器 */}
                  <button
                    type="button"
                    onClick={() => setLightbox({ src: item.previewUrl, alt: item.filename })}
                    className="relative bg-gray-100 w-full cursor-zoom-in group"
                    style={{ aspectRatio: "800 / 1200" }}
                    title="点击查看大图"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </button>
                  <div className="p-1.5 flex flex-col gap-1">
                    <p className="text-xs font-mono text-gray-700 truncate">
                      {item.filename}
                    </p>
                    <div className="flex gap-1">
                      <a
                        href={item.previewUrl}
                        download={item.filename}
                        className="flex-1 text-center rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        下载
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDismiss(item.index)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
                        title="剔除"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {visibleItems.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              所有结果已剔除
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <Lightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
