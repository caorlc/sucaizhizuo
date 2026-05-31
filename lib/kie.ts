// KIE.AI API 类型定义与调用封装

export interface KieCreateTaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

export interface KieRecordInfoResponse {
  code: number;
  data: {
    taskId: string;
    state: "waiting" | "queuing" | "generating" | "success" | "fail";
    resultJson: string; // JSON 字符串，需二次 JSON.parse 取 resultUrls[0]
    failCode: string;
    failMsg: string;
  };
}

export interface KieResultJson {
  resultUrls: string[];
}

const KIE_API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai";
const KIE_API_KEY = process.env.KIE_API_KEY ?? "";

function getHeaders(): HeadersInit {
  if (!KIE_API_KEY) {
    throw new Error("KIE_API_KEY 未配置，请在 .env.local 中设置");
  }
  return {
    Authorization: `Bearer ${KIE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function createTask(params: {
  model: string;
  prompt: string;
  imageUrl: string;
  imageSize?: string;
}): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: params.model,
      input: {
        prompt: params.prompt,
        image_urls: [params.imageUrl],
        output_format: "png",
        image_size: params.imageSize ?? "auto",
      },
    }),
  });

  if (res.status === 429) {
    throw new Error("KIE.AI 接口限流（429），请稍候再试");
  }
  if (!res.ok) {
    throw new Error(`KIE.AI createTask 失败：HTTP ${res.status}`);
  }

  const json = (await res.json()) as KieCreateTaskResponse;
  if (json.code !== 200) {
    throw new Error(`KIE.AI createTask 错误：${json.msg}`);
  }

  return json.data.taskId;
}

export async function pollTaskResult(taskId: string): Promise<string> {
  const MAX_ATTEMPTS = 100; // 最长 5 分钟（100 次 × 3 秒）
  const POLL_INTERVAL_MS = 3000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(
      `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: getHeaders() }
    );

    if (res.status === 429) {
      throw new Error("KIE.AI 接口限流（429），请稍候再试");
    }
    if (!res.ok) {
      throw new Error(`KIE.AI recordInfo 失败：HTTP ${res.status}`);
    }

    const json = (await res.json()) as KieRecordInfoResponse;
    const { state, failMsg, resultJson } = json.data;

    if (state === "fail") {
      throw new Error(`KIE.AI 生成失败：${failMsg || "未知错误"}`);
    }

    if (state === "success") {
      // resultJson 是 JSON 字符串，需要二次 JSON.parse 才能取到 resultUrls
      const parsed = JSON.parse(resultJson) as KieResultJson;
      const url = parsed.resultUrls[0];
      if (!url) {
        throw new Error("KIE.AI 返回的结果 URL 为空");
      }
      return url;
    }
  }

  throw new Error("KIE.AI 生成超时（超过 5 分钟），请重试");
}
