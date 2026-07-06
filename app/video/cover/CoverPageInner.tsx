"use client";

// 内层客户端组件：使用 useSearchParams 读取 src 参数
// 必须由父级 page.tsx 包在 <Suspense> 内

import { useSearchParams } from "next/navigation";
import CoverPickerClient from "./CoverPickerClient";

export default function CoverPageInner() {
  const searchParams = useSearchParams();
  const src = searchParams.get("src");

  // 无 src 参数时显示友好提示
  if (!src) {
    return (
      <div className="max-w-3xl">
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
        <h1 className="text-2xl font-bold text-gray-900 mb-4">截取视频封面</h1>
        <div className="rounded border border-yellow-200 bg-yellow-50 px-4 py-6 text-center">
          <p className="text-yellow-800 font-medium mb-2">未指定视频来源</p>
          <p className="text-yellow-700 text-sm mb-4">
            请从「视频历史」或「视频结果页」点击「截取封面」进入此页面。
          </p>
          <a
            href="/video/history"
            className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            前往视频历史
          </a>
        </div>
      </div>
    );
  }

  return <CoverPickerClient src={src} />;
}
