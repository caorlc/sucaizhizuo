// 视频历史页（Server Component）：列出所有已生成的 WebM 视频，模仿 app/history/page.tsx
import { listVideos } from "@/lib/videoStorage";
import type { VideoHistoryItem } from "@/lib/videoStorage";
import VideoHistoryClient from "./VideoHistoryClient";

export const dynamic = "force-dynamic";

export default async function VideoHistoryPage() {
  let items: VideoHistoryItem[] = [];
  try {
    items = await listVideos();
  } catch {
    // output/_videos/ 目录不存在时静默返回空列表
  }

  return <VideoHistoryClient items={items} />;
}
