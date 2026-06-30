// 视频结果页（Server Component）：读取 run 记录，传给客户端轮询组件
// 模仿 app/preview/[runId]/page.tsx 的模式
import { notFound } from "next/navigation";
import { getVideoRun } from "@/lib/videoStorage";
import VideoResultClient from "./VideoResultClient";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export const dynamic = "force-dynamic";

export default async function VideoResultPage({ params }: PageProps) {
  const { runId } = await params;

  let record;
  try {
    record = await getVideoRun(runId);
  } catch {
    notFound();
  }

  return <VideoResultClient initialRecord={record} />;
}
