"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ASPECT_CONFIG, DEFAULT_ASPECT, type Aspect } from "@/lib/aspect";
import { MODELS as MODEL_DEFS } from "@/lib/models";

const KEYWORD_PRESETS: { label: string; value: string }[] = [
  { label: "人像", value: "portrait" },
  { label: "风景", value: "landscape" },
  { label: "建筑", value: "architecture" },
  { label: "城市", value: "cityscape" },
  { label: "自然", value: "nature" },
  { label: "动物", value: "animal" },
  { label: "美食", value: "food" },
  { label: "街拍", value: "street photography" },
  { label: "时尚", value: "fashion" },
  { label: "旅行", value: "travel" },
  { label: "运动", value: "sports" },
  { label: "科技", value: "technology" },
];

const MODELS = MODEL_DEFS.map((m, i) => ({
  value: m.id,
  label: i === 0 ? `${m.id}（默认）` : m.id,
}));

const PLACEHOLDER = `Clean Line Drawing
Convert this photo into a minimalist black line drawing.
Clean continuous black outlines on pure white background.
keyword: portrait

---

Pencil Sketch
Soft pencil sketch with cross-hatching and gentle shading.

---

Watercolor
Transform into watercolor painting with soft pastel colors.`;

// 与服务端 parsePromptsText 保持一致的客户端简版（只计数用）
function countPrompts(text: string): number {
  const segments = text.split(/\n\s*---\s*\n/);
  return segments.filter((s) => s.trim().length > 0).length;
}

// 从 localStorage 读取已有落地页列表
function getSavedLandings(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("landings");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLanding(landing: string): void {
  const landings = getSavedLandings();
  if (!landings.includes(landing)) {
    landings.unshift(landing);
    localStorage.setItem("landings", JSON.stringify(landings.slice(0, 20)));
  }
}

export default function HomePage() {
  const router = useRouter();
  const [landing, setLanding] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [aspect, setAspect] = useState<Aspect>(DEFAULT_ASPECT);
  const [globalKeyword, setGlobalKeyword] = useState("");
  const [promptsText, setPromptsText] = useState("");
  const [savedLandings, setSavedLandings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const promptCount = countPrompts(promptsText);

  // 点击快捷标签：把 value 追加到 globalKeyword 末尾（已存在则忽略）
  const addPresetKeyword = (value: string): void => {
    const current = globalKeyword.trim();
    const existing = current
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (existing.includes(value)) return;
    setGlobalKeyword(current ? `${current}, ${value}` : value);
  };

  useEffect(() => {
    setSavedLandings(getSavedLandings());
  }, []);

  // 从 URL 参数恢复（历史页"重新生成"功能）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pLanding = params.get("landing");
    const pModel = params.get("model");
    if (pLanding) setLanding(pLanding);
    if (pModel) setModel(pModel);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landing: landing.trim(),
            model,
            aspect,
            globalKeyword: globalKeyword.trim(),
            promptsText: promptsText.trim(),
          }),
        });

        const data = (await res.json()) as { runId?: string; error?: string };

        if (!res.ok || !data.runId) {
          setError(data.error ?? "生成失败，请重试");
          return;
        }

        saveLanding(landing.trim());
        router.push(`/preview/${data.runId}`);
      } catch {
        setError("网络错误，请检查连接后重试");
      } finally {
        setLoading(false);
      }
    },
    [landing, model, aspect, globalKeyword, promptsText, router]
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">批量生成落地页配图</h1>
      <p className="text-gray-500 text-sm mb-8">
        输入多个 Prompt（用 --- 分隔），所有 Prompt 共用同一个落地页和源图主题，
        每个 Prompt 各自生成 1 张候选
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 落地页 */}
        <div>
          <label
            htmlFor="landing"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            落地页 <span className="text-red-500">*</span>
          </label>
          <input
            id="landing"
            type="text"
            list="landings-list"
            value={landing}
            onChange={(e) => setLanding(e.target.value)}
            placeholder="如：photo-to-sketch"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <datalist id="landings-list">
            {savedLandings.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <p className="text-xs text-gray-400 mt-1">
            对应 aigazou.net 的落地页路径，如 photo-to-sketch
          </p>
        </div>

        {/* 模型 */}
        <div>
          <label
            htmlFor="model"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            模型
          </label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 输出比例 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            输出比例 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ASPECT_CONFIG) as Aspect[]).map((key) => {
              const cfg = ASPECT_CONFIG[key];
              const active = aspect === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAspect(key)}
                  className={`rounded border px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 ${active ? "border-blue-500" : "border-gray-400"}`}
                      style={{
                        display: "inline-block",
                        width: key === "landscape" ? "20px" : key === "portrait" ? "10px" : "14px",
                        height: key === "landscape" ? "14px" : key === "portrait" ? "16px" : "14px",
                        border: `1.5px solid ${active ? "#3b82f6" : "#9ca3af"}`,
                        borderRadius: "2px",
                      }}
                    />
                    <span className="font-medium">{cfg.shortLabel}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {cfg.width}×{cfg.height}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            正方形适合滤镜卡片网格；横图适合 hero / SEO 配图；竖图适合移动端 / 小红书
          </p>
        </div>

        {/* 全局源图主题 */}
        <div>
          <label
            htmlFor="globalKeyword"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            源图主题 <span className="text-red-500">*</span>
          </label>
          <input
            id="globalKeyword"
            type="text"
            value={globalKeyword}
            onChange={(e) => setGlobalKeyword(e.target.value)}
            placeholder="如 portrait / 或多个用逗号分隔：portrait, landscape, food"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            支持多个主题用逗号分隔（中英文都行），每个 Prompt 随机选一个；单段内 keyword: 仍可单独覆盖
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs text-gray-400 self-center">快捷选择：</span>
            {KEYWORD_PRESETS.map((kw) => (
              <button
                key={kw.value}
                type="button"
                onClick={() => addPresetKeyword(kw.value)}
                title={`添加「${kw.value}」到主题`}
                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 transition-colors"
              >
                {kw.label}
              </button>
            ))}
          </div>
        </div>

        {/* 批量 Prompt */}
        <div>
          <label
            htmlFor="promptsText"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            批量 Prompt <span className="text-red-500">*</span>
            {promptCount > 0 && (
              <span className="ml-2 text-xs font-normal text-blue-600">
                （已识别 {promptCount} 个）
              </span>
            )}
          </label>
          <textarea
            id="promptsText"
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            placeholder={PLACEHOLDER}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
            style={{ minHeight: "400px" }}
          />
          <div className="text-xs text-gray-400 mt-1.5 space-y-0.5">
            <p>用 <code className="bg-gray-100 px-1 rounded">---</code> 单独一行分隔每个 Prompt</p>
            <p>每段第一行作为文件名（自动转成 slug）</p>
            <p>
              想给某条单独换源图主题：在该段内加一行{" "}
              <code className="bg-gray-100 px-1 rounded">keyword: 主题词</code>
              （覆盖全局）
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || promptCount === 0}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? "提交中..."
            : promptCount > 0
            ? `批量生成 ${promptCount} 张候选`
            : "请填写 Prompt"}
        </button>
      </form>
    </div>
  );
}
