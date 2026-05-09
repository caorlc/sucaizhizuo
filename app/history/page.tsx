import { listHistory } from "@/lib/storage";
import type { HistoryItem } from "@/lib/storage";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  let items: HistoryItem[] = [];
  try {
    items = await listHistory();
  } catch {
    // output/ 目录为空时静默返回空列表
  }

  // 按落地页分组
  const groups: Record<string, HistoryItem[]> = {};
  for (const item of items) {
    if (!groups[item.landing]) groups[item.landing] = [];
    groups[item.landing].push(item);
  }

  return <HistoryClient groups={groups} totalCount={items.length} />;
}
