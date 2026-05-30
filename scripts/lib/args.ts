import { DEFAULT_MODEL, type BizSize } from "../../lib/models";

export type Mode = "single" | "result" | "compare";
export type Orientation = "portrait" | "landscape" | "squarish";

export interface EditOptions {
  model: string;
  prompt: string;
  source: string; // keyword | http(s) url
  mode: Mode;
  size: BizSize;
  count: number;
  slug: string;
  start: number;
  out: string;
  orientation: Orientation;
  noAi: boolean;
}

const SIZES: BizSize[] = ["800x800", "800x1200", "1200x800"];
const MODES: Mode[] = ["single", "result", "compare"];

function defaultOrientation(mode: Mode, size: BizSize): Orientation {
  if (mode === "compare") return "landscape";
  if (size === "800x800") return "squarish";
  if (size === "1200x800") return "landscape";
  return "portrait";
}

export function parseArgs(argv: string[]): EditOptions {
  const m: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      m[key] = next;
      i++;
    } else {
      flags.add(key);
    }
  }

  const mode = (m.mode ?? "result") as Mode;
  if (!MODES.includes(mode)) throw new Error(`--mode 只能是 ${MODES.join("|")}`);

  const size = (m.size ?? (mode === "compare" ? "1200x800" : "800x1200")) as BizSize;
  if (!SIZES.includes(size)) throw new Error(`--size 只能是 ${SIZES.join("|")}`);

  const noAi = flags.has("no-ai");
  if (!m.prompt && !noAi) throw new Error("缺少 --prompt（或加 --no-ai 仅裁切）");
  if (!m.slug) throw new Error("缺少 --slug");
  if (!m.source) throw new Error("缺少 --source");

  return {
    model: m.model ?? DEFAULT_MODEL,
    prompt: m.prompt ?? "",
    source: m.source,
    mode,
    size,
    count: m.count ? Math.max(1, parseInt(m.count, 10)) : 1,
    slug: m.slug,
    start: m.start ? parseInt(m.start, 10) : 1,
    out: m.out ?? `output/image-edit/${m.slug}`,
    orientation: (m.orientation as Orientation) ?? defaultOrientation(mode, size),
    noAi,
  };
}
