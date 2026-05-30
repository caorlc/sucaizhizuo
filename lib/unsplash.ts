// Unsplash API 封装：根据关键词搜索图片，随机返回一张

export interface UnsplashPhoto {
  id: string;
  urls: {
    regular: string;
    small: string;
  };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
  links: {
    html: string;
  };
}

export interface UnsplashAttribution {
  photographerName: string;
  photographerUrl: string;
  photoUrl: string;
  imageUrl: string;
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
  total: number;
}

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? "";

export type UnsplashOrientation = "landscape" | "portrait" | "squarish";

export async function searchUnsplashPhoto(
  keyword: string,
  orientation: UnsplashOrientation = "landscape"
): Promise<UnsplashAttribution> {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY 未配置，请在 .env.local 中设置");
  }

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", keyword);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", "10");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  });

  if (res.status === 429) {
    throw new Error("Unsplash API 配额超限（429），请明天再试");
  }
  if (!res.ok) {
    throw new Error(`Unsplash 搜索失败：HTTP ${res.status}`);
  }

  const data = (await res.json()) as UnsplashSearchResponse;

  if (!data.results || data.results.length === 0) {
    throw new Error(`Unsplash 没有找到关键词「${keyword}」相关的图片`);
  }

  // 随机取一张
  const photo = data.results[Math.floor(Math.random() * data.results.length)];

  return {
    photographerName: photo.user.name,
    photographerUrl: photo.user.links.html,
    photoUrl: photo.links.html,
    imageUrl: photo.urls.regular,
  };
}

// 从 prompt 中提取主题词作为搜索关键词
export function extractKeywordFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0].trim();
  // 取前 3 个英文单词
  const words = firstLine
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return words.length > 0 ? words.join(" ") : "photo";
}

// 按 id 去重并随机洗牌，最多取 n 张
export function pickDistinct(photos: UnsplashPhoto[], n: number): UnsplashPhoto[] {
  const seen = new Set<string>();
  const distinct: UnsplashPhoto[] = [];
  for (const p of photos) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      distinct.push(p);
    }
  }
  for (let i = distinct.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distinct[i], distinct[j]] = [distinct[j], distinct[i]];
  }
  return distinct.slice(0, n);
}

// 搜索一批图片，去重后返回 count 张归属信息（用于 showcase 主体多样性）
export async function searchUnsplashPhotos(
  keyword: string,
  orientation: UnsplashOrientation,
  count: number,
  perPage = 30
): Promise<UnsplashAttribution[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY ?? "";
  if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY 未配置，请在 .env.local 中设置");

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", keyword);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url.toString(), { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (res.status === 429) throw new Error("Unsplash API 配额超限（429），请稍后再试");
  if (!res.ok) throw new Error(`Unsplash 搜索失败：HTTP ${res.status}`);

  const data = (await res.json()) as UnsplashSearchResponse;
  const distinct = pickDistinct(data.results ?? [], count);
  if (distinct.length === 0) throw new Error(`Unsplash 没有找到关键词「${keyword}」相关的图片`);

  return distinct.map((photo) => ({
    photographerName: photo.user.name,
    photographerUrl: photo.user.links.html,
    photoUrl: photo.links.html,
    imageUrl: photo.urls.regular,
  }));
}
