"use client";

// 视频结果页客户端组件：轮询任务状态 + 预览 + 下载
// 支持两种流程：
//   - t2v/i2v 生成模式：mp4 预览 → 用户确认 → 转 webm 下载
//   - import 模式：worker 直接输出 webm → 直接展示下载

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { VideoRunRecord } from "@/lib/videoStorage";

interface VideoResultClientProps {
  initialRecord: VideoRunRecord;
}

// Spinner 组件（复用 PreviewClient.tsx 风格）
function Spinner() {
  return (
    <div className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  );
}

// 状态是否已终态
function isTerminal(status: VideoRunRecord["status"]): boolean {
  return status === "success" || status === "failed";
}

// 模式标签（中文）
function modeLabel(mode: VideoRunRecord["mode"]): string {
  if (mode === "t2v") return "文生视频";
  if (mode === "i2v") return "图生视频";
  return "链接下载";
}

export default function VideoResultClient({ initialRecord }: VideoResultClientProps) {
  const router = useRouter();
  const [record, setRecord] = useState<VideoRunRecord>(initialRecord);

  // 转码（finalize）状态（仅 t2v/i2v 流程使用）
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [finalized, setFinalized] = useState(false);  // 转码完成标志
  const [downloadUrl, setDownloadUrl] = useState("");  // 下载链接

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 开始轮询 /api/video/runs/[runId]，每 2 秒一次，直到终态
  const startPolling = useCallback((runId: string) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/runs/${runId}`, { cache: "no-store" });
        if (!res.ok) return;
        const fresh = (await res.json()) as VideoRunRecord;
        setRecord(fresh);
        if (isTerminal(fresh.status)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      } catch {
        // 网络错误时静默继续
      }
    }, 2000);
  }, []);

  // 初始化：如果还未终态，开始轮询
  useEffect(() => {
    if (!isTerminal(record.status)) {
      startPolling(record.runId);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 确认并转 WebM 下载（仅 t2v/i2v 生成模式用）
  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError("");
    try {
      const res = await fetch("/api/video/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: record.runId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        webmPath?: string;
        name?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.webmPath) {
        setFinalizeError(data.error ?? "转码失败，请重试");
        return;
      }

      // 记录下载信息，程序化触发浏览器下载
      const url = `/api/image/output/${data.webmPath}`;
      setDownloadUrl(url);
      setFinalized(true);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name ?? "video"}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setFinalizeError("网络错误，请重试");
    } finally {
      setFinalizing(false);
    }
  };

  // ---- 路径计算 ----
  // import 模式：worker 直接写入 webmPath，不需要 finalize
  const isImport = record.mode === "import";
  const webmSrc = record.webmPath
    ? `/api/image/output/${record.webmPath}`
    : null;
  const mp4Src = record.rawMp4Path
    ? `/api/image/output/${record.rawMp4Path}`
    : null;

  return (
    <div className="max-w-2xl">
      {/* 返回链接 */}
      <div className="mb-6 flex gap-4 text-sm">
        {isImport ? (
          <a
            href="/video/import"
            className="text-gray-500 hover:text-gray-700 underline"
          >
            重新下载
          </a>
        ) : (
          <a href="/video" className="text-gray-500 hover:text-gray-700 underline">
            重新生成
          </a>
        )}
        <a
          href="/video/history"
          className="text-gray-500 hover:text-gray-700 underline"
        >
          视频历史
        </a>
      </div>

      {/* 任务信息卡 */}
      <div className="rounded border border-gray-200 bg-white p-4 mb-6 space-y-2 text-sm">
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">模式</span>
          <span className="text-gray-700">{modeLabel(record.mode)}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">模型</span>
          <span className="text-gray-700 font-mono">{record.model}</span>
        </div>

        {/* import 模式：展示来源 URL 和标题 */}
        {isImport && record.sourceUrl && (
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 shrink-0">来源</span>
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-xs break-all"
            >
              {record.sourceUrl}
            </a>
          </div>
        )}
        {isImport && record.sourceTitle && (
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 shrink-0">标题</span>
            <span className="text-gray-700 break-all">{record.sourceTitle}</span>
          </div>
        )}

        {/* 生成模式：展示 prompt / imageUrl / 参数 */}
        {!isImport && record.prompt && (
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 shrink-0">Prompt</span>
            <span className="text-gray-700 break-all">{record.prompt}</span>
          </div>
        )}
        {!isImport && record.imageUrl && (
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 shrink-0">图片 URL</span>
            <span className="text-gray-600 text-xs break-all font-mono">
              {record.imageUrl}
            </span>
          </div>
        )}
        {!isImport && (
          <div className="flex gap-4 text-xs text-gray-400 pt-1">
            {record.aspectRatio && <span>{record.aspectRatio}</span>}
            {record.resolution && <span>{record.resolution}</span>}
            {record.duration !== undefined && <span>{record.duration}s</span>}
          </div>
        )}
      </div>

      {/* ---- 状态区域 ---- */}

      {/* 处理中（pending） */}
      {record.status === "pending" && (
        <div className="rounded border border-blue-100 bg-blue-50 p-6 flex flex-col items-center gap-3 text-center">
          <Spinner />
          <p className="text-blue-700 font-medium">
            {isImport ? "正在下载并转码..." : "视频生成中..."}
          </p>
          <p className="text-blue-500 text-sm">
            {isImport
              ? "正在从链接下载视频，转码为 WebM，可能需要数分钟"
              : "可能需要数分钟，请耐心等待"}
          </p>
        </div>
      )}

      {/* 失败（failed） */}
      {record.status === "failed" && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <p className="text-red-700 font-medium mb-1">
            {isImport ? "下载失败" : "生成失败"}
          </p>
          <p className="text-red-600 text-sm">{record.error ?? "未知错误"}</p>
          <button
            onClick={() => router.push(isImport ? "/video/import" : "/video")}
            className="mt-3 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            {isImport ? "重新下载" : "重新生成"}
          </button>
        </div>
      )}

      {/* 成功 + 已有 webmPath（import 模式，或生成后已转码） */}
      {record.status === "success" && webmSrc && (
        <div className="space-y-4">
          {/* WebM 成片展示 */}
          <div className="rounded border border-gray-200 bg-white overflow-hidden">
            <div className="p-3 border-b border-gray-100 text-xs text-gray-500">
              成片（WebM）
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              src={webmSrc}
              className="w-full"
              style={{ maxHeight: "480px" }}
            />
          </div>

          {/* 下载按钮（程序化 <a download>） */}
          <div className="flex gap-3 flex-wrap">
            <a
              href={webmSrc}
              download={`${record.name}.webm`}
              className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              下载 WebM
            </a>
            {/* 截取封面入口：跳转到 /video/cover 并传入 webmPath */}
            {record.webmPath && (
              <a
                href={`/video/cover?src=${encodeURIComponent(record.webmPath)}`}
                className="inline-block rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                截取封面
              </a>
            )}
            <button
              onClick={() => router.push(isImport ? "/video/import" : "/video")}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {isImport ? "再下载一个" : "重新生成"}
            </button>
          </div>
        </div>
      )}

      {/* 成功 + 只有 rawMp4Path（t2v/i2v 生成成功但尚未转码） */}
      {record.status === "success" && !webmSrc && mp4Src && (
        <div className="space-y-4">
          {/* 原始 mp4 预览 */}
          <div className="rounded border border-gray-200 bg-white overflow-hidden">
            <div className="p-3 border-b border-gray-100 text-xs text-gray-500">
              原始预览（mp4）- 确认满意后再转 WebM
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              src={mp4Src}
              className="w-full"
              style={{ maxHeight: "480px" }}
            />
          </div>

          {/* 转码结果提示 */}
          {finalized && (
            <div className="rounded border border-green-200 bg-green-50 p-3 flex items-center justify-between">
              <span className="text-green-700 text-sm font-medium">
                已生成 WebM，下载已开始
              </span>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={`${record.name}.webm`}
                  className="text-xs text-green-600 hover:underline"
                >
                  重新下载
                </a>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {finalizeError && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {finalizeError}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {finalizing
                ? "转码中（请稍等）..."
                : finalized
                  ? "再次下载 WebM"
                  : "确认并转 WebM 下载"}
            </button>
            <button
              onClick={() => router.push("/video")}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              重新生成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
