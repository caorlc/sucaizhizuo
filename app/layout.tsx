import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "素材制作 - 落地页配图生成工具",
  description: "通过 kie.ai 批量生成 aigazou.net 落地页配图",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-semibold text-gray-900">素材制作</span>
              <span className="ml-2 text-sm text-gray-500">落地页配图生成工具</span>
            </div>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="text-gray-600 hover:text-gray-900">
                生成
              </a>
              <a href="/history" className="text-gray-600 hover:text-gray-900">
                历史记录
              </a>
              <a href="/showcase" className="text-gray-600 hover:text-gray-900">
                Showcase 裁图
              </a>
              <a href="/video" className="text-gray-600 hover:text-gray-900">
                AI Video
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
