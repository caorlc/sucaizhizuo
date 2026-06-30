// 视频封面截取页面（Server Component 入口）
// useSearchParams 必须包在 Suspense 边界里，否则 Next.js 会报错

import { Suspense } from "react";
import CoverPageInner from "./CoverPageInner";

/** 加载态占位 */
function CoverPageFallback() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4 text-sm">
        <a
          href="/video/history"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          &larr; 视频历史
        </a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">截取视频封面</h1>
      <div className="rounded border border-gray-200 bg-gray-50 p-8 text-center text-gray-400 text-sm">
        加载中…
      </div>
    </div>
  );
}

export default function CoverPage() {
  return (
    <Suspense fallback={<CoverPageFallback />}>
      <CoverPageInner />
    </Suspense>
  );
}
