"use client";

// 视频历史客户端组件：网格展示已生成的 WebM 视频，模仿 HistoryClient.tsx 风格
// 兼容 import 模式（aspectRatio/resolution/duration 可能为 undefined，prompt 可能为空）
import type { VideoHistoryItem } from "@/lib/videoStorage";
import CopyButton from "@/components/CopyButton";

interface VideoHistoryClientProps {
  items: VideoHistoryItem[];
}

// 格式化时间显示
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// 模式标签配置（含 import 模式）
function ModeTag({ mode }: { mode: string }) {
  if (mode === "t2v") {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-blue-50 text-blue-600">
        文生视频
      </span>
    );
  }
  if (mode === "i2v") {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-purple-50 text-purple-600">
        图生视频
      </span>
    );
  }
  // import 模式显示「下载」标签
  return (
    <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-50 text-green-600">
      下载
    </span>
  );
}

export default function VideoHistoryClient({ items }: VideoHistoryClientProps) {
  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">视频历史</h1>
          <div className="flex gap-3 text-sm">
            <a
              href="/video/import"
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              从链接下载
            </a>
            <a
              href="/video"
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              &larr; 生成新视频
            </a>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-12 text-center text-gray-400">
          <p className="text-lg mb-2">还没有生成或下载的视频</p>
          <p className="text-sm">
            前往{" "}
            <a href="/video" className="text-blue-500 hover:underline">
              AI Video
            </a>{" "}
            生成，或{" "}
            <a href="/video/import" className="text-blue-500 hover:underline">
              从链接下载
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          视频历史{" "}
          <span className="text-base font-normal text-gray-400">
            （{items.length} 个）
          </span>
        </h1>
        <div className="flex gap-3 text-sm">
          <a
            href="/video/import"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            从链接下载
          </a>
          <a
            href="/video"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            &larr; 生成新视频
          </a>
        </div>
      </div>

      {/* 视频卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => {
          const videoSrc = `/api/image/output/${item.webmPath}`;
          const downloadName = `${item.name}.webm`;
          const isImport = item.meta.mode === "import";

          return (
            <div
              key={item.name}
              className="rounded border border-gray-200 bg-white overflow-hidden flex flex-col"
            >
              {/* 视频预览 */}
              <div className="bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  controls
                  src={videoSrc}
                  className="w-full"
                  style={{ maxHeight: "240px" }}
                  preload="metadata"
                />
              </div>

              {/* 信息区 */}
              <div className="p-3 flex flex-col gap-2 flex-1">
                {/* 文件名 + 模式标签 */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-600 truncate">
                    {item.name}
                  </span>
                  <ModeTag mode={item.meta.mode} />
                </div>

                {/* import 模式：展示来源 URL */}
                {isImport && item.meta.sourceUrl && (
                  <div className="text-xs text-gray-500 truncate">
                    <span className="text-gray-400 mr-1">来源：</span>
                    <a
                      href={item.meta.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {item.meta.sourceUrl}
                    </a>
                  </div>
                )}

                {/* Prompt / 标题（有则显示，import 模式 prompt 存的是标题） */}
                {item.meta.prompt && (
                  <div className="relative">
                    <pre className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 rounded p-2 pr-12 max-h-20 overflow-auto border border-gray-100">
                      {item.meta.prompt}
                    </pre>
                    <div className="absolute top-1.5 right-1.5">
                      <CopyButton text={item.meta.prompt} />
                    </div>
                  </div>
                )}

                {/* 参数元信息（生成模式才显示 aspectRatio/resolution/duration） */}
                <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                  {item.meta.aspectRatio && <span>{item.meta.aspectRatio}</span>}
                  {item.meta.resolution && <span>{item.meta.resolution}</span>}
                  {item.meta.duration !== undefined && (
                    <span>{item.meta.duration}s</span>
                  )}
                  <span>{formatDate(item.meta.createdAt)}</span>
                </div>

                {/* 下载 + 截取封面按钮 */}
                <div className="mt-auto pt-1 flex gap-2 flex-wrap">
                  <a
                    href={videoSrc}
                    download={downloadName}
                    className="inline-block rounded bg-gray-100 hover:bg-blue-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-blue-700 transition-colors"
                  >
                    下载 .webm
                  </a>
                  {/* 截取封面入口：跳转到 /video/cover 并传入 webmPath */}
                  <a
                    href={`/video/cover?src=${encodeURIComponent(item.webmPath)}`}
                    className="inline-block rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    截取封面
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
