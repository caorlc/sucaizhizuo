"use client";

import { useState } from "react";
import type { HistoryItem } from "@/lib/storage";
import { getAspectConfig } from "@/lib/aspect";
import CopyButton from "@/components/CopyButton";
import Lightbox from "@/components/Lightbox";

interface HistoryClientProps {
  groups: Record<string, HistoryItem[]>;
  totalCount: number;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HistoryClient({ groups, totalCount }: HistoryClientProps) {
  const landingNames = Object.keys(groups).sort();
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (totalCount === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-lg">还没有生成过图片</p>
        <a
          href="/"
          className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          去生成第一张
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">历史记录</h1>
          <p className="text-sm text-gray-500 mt-1">共 {totalCount} 张已定稿图片</p>
        </div>
        <a
          href="/"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新建生成
        </a>
      </div>

      <div className="space-y-10">
        {landingNames.map((landing) => (
          <section key={landing}>
            <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">
              <span className="font-mono">{landing}</span>
              <span className="ml-2 text-xs font-normal text-gray-400">
                {groups[landing].length} 张
              </span>
            </h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {groups[landing].map((item) => {
                const keyword = item.meta.keyword ?? "-";

                return (
                  <div
                    key={`${item.landing}-${item.name}`}
                    className="rounded border border-gray-200 bg-white overflow-hidden flex flex-col"
                  >
                    <div
                      className="relative bg-gray-100"
                      style={{ aspectRatio: getAspectConfig(item.meta.aspect).cssRatio }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/image/output/${item.webpPath}`}
                        alt={item.name}
                        className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                        loading="lazy"
                        onClick={() =>
                          setLightbox({
                            src: `/api/image/output/${item.webpPath}`,
                            alt: item.name,
                          })
                        }
                      />
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                      <p className="text-xs font-mono text-gray-700 truncate">
                        {item.name}
                      </p>

                      {/* Prompt 完整显示 + 复制按钮 */}
                      <div className="relative">
                        <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 rounded p-2 pr-12 max-h-24 overflow-auto border border-gray-100">
                          {item.meta.prompt}
                        </pre>
                        <div className="absolute top-1 right-1">
                          <CopyButton text={item.meta.prompt} />
                        </div>
                      </div>

                      <p className="text-xs text-gray-300">keyword: {keyword}</p>
                      <p className="text-xs text-gray-300">
                        {formatDate(item.meta.createdAt)}
                      </p>
                      <div className="mt-auto pt-1">
                        <a
                          href={`/api/image/output/${item.webpPath}`}
                          download={`${item.name}.webp`}
                          className="inline-block rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                        >
                          下载 .webp
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
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
