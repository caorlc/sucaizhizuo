// 懒清理：删除 _candidates/ 下 7 天以上的文件
import path from "path";
import fs from "fs/promises";

const OUTPUT_DIR = path.join(process.cwd(), "output");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export async function cleanupOldCandidates(): Promise<void> {
  let landings: string[];
  try {
    landings = await fs.readdir(OUTPUT_DIR);
  } catch {
    return; // output/ 目录不存在时静默跳过
  }

  const now = Date.now();

  for (const landing of landings) {
    const candidatesDir = path.join(OUTPUT_DIR, landing, "_candidates");
    let files: string[];
    try {
      files = await fs.readdir(candidatesDir);
    } catch {
      continue; // 目录不存在时跳过
    }

    for (const file of files) {
      const filePath = path.join(candidatesDir, file);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          await fs.unlink(filePath);
        }
      } catch {
        // 文件已被删或权限问题，忽略
      }
    }
  }
}
