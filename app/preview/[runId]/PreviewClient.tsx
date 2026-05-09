"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RunRecord, CandidateRecord } from "@/lib/storage";
import { getAspectConfig } from "@/lib/aspect";
import CopyButton from "@/components/CopyButton";
import Lightbox from "@/components/Lightbox";

interface PreviewClientProps {
  initialRun: RunRecord;
}

function isTerminal(status: CandidateRecord["status"]): boolean {
  return status === "success" || status === "failed";
}

function allTerminal(candidates: CandidateRecord[]): boolean {
  return candidates.every((c) => isTerminal(c.status));
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-gray-600 whitespace-nowrap">
        {done} / {total}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  );
}

function CandidateCard({
  candidate,
  runId,
  cssRatio,
  onRegenerate,
  onOpenLightbox,
}: {
  candidate: CandidateRecord;
  runId: string;
  cssRatio: string;
  onRegenerate: (index: number) => void;
  onOpenLightbox: (src: string, alt: string) => void;
}) {
  const [adopting, setAdopting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [adoptError, setAdoptError] = useState("");

  const imageSrc =
    candidate.status === "success" && candidate.candidatePath
      ? `/api/image/output/${candidate.candidatePath}`
      : null;

  const handleAdopt = async () => {
    if (!candidate.candidatePath) return;
    setAdopting(true);
    setAdoptError("");
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, index: candidate.index }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setAdoptError(data.error ?? "采用失败");
        return;
      }
      setAdopted(true);
    } catch {
      setAdoptError("网络错误，请重试");
    } finally {
      setAdopting(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, index: candidate.index }),
      });
      onRegenerate(candidate.index);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded border border-gray-200 bg-white overflow-hidden flex flex-col md:flex-row">
      {/* 图片区 */}
      <div
        className="relative bg-gray-100 shrink-0 md:w-72"
        style={{ aspectRatio: cssRatio }}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={candidate.name}
            className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
            loading="lazy"
            onClick={() => onOpenLightbox(imageSrc, candidate.name)}
          />
        ) : candidate.status === "pending" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400">
            <Spinner />
            <span className="text-xs">生成中...</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
            生成失败
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
        {/* 标题行 */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-gray-800 text-sm font-mono truncate">
            {candidate.name}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {adopted && (
              <span className="text-xs text-green-600 font-medium">
                ✓ 已采用
              </span>
            )}
            {!adopted && candidate.status === "success" && (
              <span className="text-xs text-green-500">成功</span>
            )}
            {candidate.status === "pending" && (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <Spinner /> 生成中
              </span>
            )}
            {candidate.status === "failed" && (
              <span className="text-xs text-red-500">失败</span>
            )}
          </div>
        </div>

        {/* Prompt 完整显示 + 复制按钮 */}
        <div className="relative">
          <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 rounded p-2.5 pr-14 max-h-40 overflow-auto border border-gray-100">
            {candidate.prompt}
          </pre>
          <div className="absolute top-1.5 right-1.5">
            <CopyButton text={candidate.prompt} />
          </div>
        </div>

        {/* 元信息 */}
        <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
          {candidate.keywordUsed && (
            <span>keyword: {candidate.keywordUsed}</span>
          )}
          {candidate.keywordOverride && !candidate.keywordUsed && (
            <span className="text-amber-500">
              keyword: {candidate.keywordOverride}（待生成）
            </span>
          )}
          {candidate.source && (
            <span>
              来源:{" "}
              <a
                href={candidate.source.photographerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                @{candidate.source.photographerName}
              </a>
            </span>
          )}
        </div>

        {candidate.status === "failed" && candidate.error && (
          <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">
            {candidate.error}
          </p>
        )}
        {adoptError && (
          <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">
            {adoptError}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="mt-auto pt-1 flex gap-2">
          {candidate.status === "success" && (
            <button
              onClick={handleAdopt}
              disabled={adopting || adopted}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {adopted ? "已采用 ✓" : adopting ? "采用中..." : "选这条"}
            </button>
          )}
          {(candidate.status === "success" || candidate.status === "failed") && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {regenerating
                ? "提交中..."
                : candidate.status === "failed"
                ? "重试"
                : "重生这条"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PreviewClient({ initialRun }: PreviewClientProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunRecord>(initialRun);
  const [adoptingAll, setAdoptingAll] = useState(false);
  const [adoptAllError, setAdoptAllError] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((runId: string) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!res.ok) return;
        const fresh = (await res.json()) as RunRecord;
        setRun(fresh);
        if (allTerminal(fresh.candidates)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      } catch {
        // 网络错误时静默继续
      }
    }, 2000);
  }, []);

  useEffect(() => {
    if (!allTerminal(run.candidates)) {
      startPolling(run.runId);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = useCallback(
    (_index: number) => {
      startPolling(run.runId);
    },
    [run.runId, startPolling]
  );

  const handleOpenLightbox = useCallback((src: string, alt: string) => {
    setLightbox({ src, alt });
  }, []);

  const handleAdoptAll = async () => {
    setAdoptingAll(true);
    setAdoptAllError("");
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.runId, all: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setAdoptAllError(data.error ?? "批量采用失败");
        return;
      }
      // 跳到历史页统一管理 + 下载
      router.push("/history");
    } catch {
      setAdoptAllError("网络错误，请重试");
    } finally {
      setAdoptingAll(false);
    }
  };

  const { candidates } = run;
  const doneCnt = candidates.filter((c) => isTerminal(c.status)).length;
  const successCnt = candidates.filter((c) => c.status === "success").length;
  const total = candidates.length;
  const aspectCfg = getAspectConfig(run.aspect);

  return (
    <div>
      {/* 顶部信息 + 进度 */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-gray-400 w-16 shrink-0">落地页</span>
              <span className="font-mono text-gray-800">{run.landing}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-16 shrink-0">模型</span>
              <span className="text-gray-700">{run.model}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-16 shrink-0">全局 keyword</span>
              <span className="text-gray-700">{run.globalKeyword}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-16 shrink-0">输出比例</span>
              <span className="text-gray-700">
                {aspectCfg.shortLabel}（{aspectCfg.width}×{aspectCfg.height}）
              </span>
            </div>
          </div>

          <button
            onClick={handleAdoptAll}
            disabled={adoptingAll || successCnt === 0}
            className="shrink-0 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adoptingAll ? "采用中..." : `全部采用 (${successCnt})`}
          </button>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">
            {doneCnt === total
              ? `全部完成（${successCnt} 成功 / ${total - successCnt} 失败）`
              : `生成中... ${doneCnt} / ${total} 完成`}
          </p>
          <ProgressBar done={doneCnt} total={total} />
        </div>
      </div>

      {adoptAllError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {adoptAllError}
        </div>
      )}

      {/* 候选卡片列表 */}
      <div className="space-y-4">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.index}
            candidate={candidate}
            runId={run.runId}
            cssRatio={aspectCfg.cssRatio}
            onRegenerate={handleRegenerate}
            onOpenLightbox={handleOpenLightbox}
          />
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700 underline">
          新建生成
        </a>
        <a
          href="/history"
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          查看历史
        </a>
      </div>

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
