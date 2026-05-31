# Seedream V4 Edit Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bytedance/seedream-v4-edit` as a selectable KIE edit model in the `image-edit` skill (sizes aligned with nano-banana), remove the flux-kontext models everywhere, drop the silent default model (model becomes mandatory), and update the decoupled web app to offer Seedream with a correct per-model `image_size`.

**Architecture:** Follows the existing model-registry + provider-adapter design (`lib/models.ts` `ModelDef.sizeParam` absorbs each model's `image_size` vocabulary; the shared `lib/kie.ts` `createTask`/`pollTaskResult` handle the unified KIE `/jobs` API). Seedream is just one more `MODELS` row with its own `sizeParam`. The web app (`app/page.tsx` → `/api/generate` → `lib/worker.ts`) is routed through `getModel().sizeParam()` so any registered model gets a valid `image_size`.

**Tech Stack:** TypeScript, Next.js 14, Node, `tsx` (CLI), `sharp` (post-process), `vitest` (tests), KIE.AI jobs API.

**Spec:** [docs/superpowers/specs/2026-05-31-seedream-v4-edit-integration-design.md](../specs/2026-05-31-seedream-v4-edit-integration-design.md)

**Branch:** `feat/seedream-v4-edit` (already created; the spec commit lives here). Execute all tasks on this branch.

**Commit convention:** Every commit message below should append the trailer line `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (omitted from the commands for brevity).

**Key reference — Seedream V4 Edit API** (`bytedance/seedream-v4-edit`, https://docs.kie.ai/market/seedream/seedream-v4-edit):
- Same unified endpoints as existing models: `POST /api/v1/jobs/createTask`, poll `GET /api/v1/jobs/recordInfo` → `resultJson` → `resultUrls[0]`.
- `input.image_size` enum: `square`, `square_hd`, `portrait_4_3`, `portrait_3_2`, `portrait_16_9`, `landscape_4_3`, `landscape_3_2`, `landscape_16_9`, `landscape_21_9`. (We use `square_hd` / `portrait_16_9` / `landscape_16_9` to mirror nano-banana's `1:1` / `9:16` / `16:9`.)
- Schema has no `additionalProperties:false`, so the existing `output_format:"png"` field is ignored by Seedream (result is re-encoded to webp locally anyway).

---

## File Structure

**Modify:**
- `lib/models.ts` — registry: add `SEEDREAM_SIZE` + Seedream row; remove the two flux rows; remove `DEFAULT_MODEL`; drop "（默认）" from nano label.
- `lib/models.test.ts` — registry tests: add Seedream test; replace flux test with exact-contents assertion; drop `DEFAULT_MODEL` usage.
- `lib/kie.ts` — `createTask` `imageSize` param `KieImageSize` → `string`; remove the now-unused `KieImageSize` type.
- `lib/providers/kie.ts` — drop the `as KieImageSize` cast + its import.
- `lib/providers/kie.test.ts` — add a Seedream-size passthrough assertion.
- `scripts/lib/args.ts` — make `--model` required (throw if missing); remove `DEFAULT_MODEL` import + fallback.
- `scripts/lib/args.test.ts` — add `--model` to success cases; add a missing-`--model` throw test.
- `lib/aspect.ts` — add `ASPECT_TO_BIZSIZE: Record<Aspect, BizSize>` (import `BizSize` type).
- `lib/worker.ts` — add pure `resolveImageSize(modelId, aspect)`; use it for `createTask` `imageSize`.
- `app/page.tsx` — model dropdown: drop flux, add Seedream.
- `.claude/skills/image-edit/SKILL.md` — "可用模型" → 2 models; mandate model selection; fix "默认" wording.

**Create:**
- `lib/worker.test.ts` — unit tests for `resolveImageSize`.

**Untouched (verify no breakage):** `scripts/lib/run.ts`, `lib/postprocess.ts`, `lib/unsplash.ts`, `lib/storage.ts`, `app/api/**`, `app/history|preview|showcase`.

---

## Task 1: Register the Seedream model

**Files:**
- Modify: `lib/models.ts`
- Test: `lib/models.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("models registry", ...)` block in `lib/models.test.ts`, immediately after the existing `it("maps business sizes to KIE image_size params", ...)` test:

```ts
  it("registers seedream-v4-edit with Seedream image_size vocabulary", () => {
    const m = getModel("bytedance/seedream-v4-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
    expect(m.sizeParam("800x800")).toBe("square_hd");
    expect(m.sizeParam("800x1200")).toBe("portrait_16_9");
    expect(m.sizeParam("1200x800")).toBe("landscape_16_9");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/models.test.ts`
Expected: FAIL — `getModel("bytedance/seedream-v4-edit")` throws `未知模型：bytedance/seedream-v4-edit，可用：...` (model not registered yet).

- [ ] **Step 3: Add the size table + model row**

In `lib/models.ts`, add `SEEDREAM_SIZE` right after the `KIE_SIZE` constant:

```ts
// Seedream V4 用自己的 image_size 词表；比例与 KIE_SIZE 对齐（1:1 / 9:16 / 16:9）
const SEEDREAM_SIZE: Record<BizSize, string> = {
  "800x800": "square_hd",
  "800x1200": "portrait_16_9",
  "1200x800": "landscape_16_9",
};
```

Then add the Seedream row to `MODELS`, immediately after the `google/nano-banana-edit` row:

```ts
  { id: "bytedance/seedream-v4-edit", label: "Seedream V4 Edit", provider: "kie", kind: "edit", sizeParam: (s) => SEEDREAM_SIZE[s] },
```

(Leave the flux rows and `DEFAULT_MODEL` in place for now — removed in Tasks 3 and 4.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/models.test.ts`
Expected: PASS (all tests green, including the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/models.ts lib/models.test.ts
git commit -m "feat(image-edit): register bytedance/seedream-v4-edit model with size mapping"
```

---

## Task 2: Pass any `image_size` string through KIE (type cleanup)

This is a type-safety refactor: the current `input.size as KieImageSize` cast already lets Seedream's `square_hd` reach the API at runtime, but lies to the type system. We widen the type so the cast is unnecessary. The added test is a **regression guard** — it passes before and after; there is no red phase.

**Files:**
- Modify: `lib/kie.ts:39-46`
- Modify: `lib/providers/kie.ts:1,12`
- Test: `lib/providers/kie.test.ts`

- [ ] **Step 1: Add the regression-guard test**

In `lib/providers/kie.test.ts`, add this test inside the `describe("kie provider", ...)` block, after the existing `it("creates a task with mapped params ...")` test:

```ts
  it("passes a Seedream image_size string through to createTask unchanged", async () => {
    await kieProvider.generate({
      model: "bytedance/seedream-v4-edit",
      prompt: "edit it",
      imageUrls: ["https://src/b.jpg"],
      size: "landscape_16_9",
    });
    expect(createTask).toHaveBeenCalledWith({
      model: "bytedance/seedream-v4-edit",
      prompt: "edit it",
      imageUrl: "https://src/b.jpg",
      imageSize: "landscape_16_9",
    });
  });
```

- [ ] **Step 2: Run the test (it passes already)**

Run: `npx vitest run lib/providers/kie.test.ts`
Expected: PASS. (Guards the passthrough behavior we're about to make type-safe.)

- [ ] **Step 3: Widen the `createTask` type in `lib/kie.ts`**

Delete the `KieImageSize` type declaration (line 39):

```ts
export type KieImageSize = "1:1" | "16:9" | "9:16" | "auto";
```

And change the `createTask` `imageSize` param type from `KieImageSize` to `string`:

```ts
export async function createTask(params: {
  model: string;
  prompt: string;
  imageUrl: string;
  imageSize?: string;
}): Promise<string> {
```

(Leave the body line `image_size: params.imageSize ?? "auto",` unchanged.)

- [ ] **Step 4: Drop the cast in `lib/providers/kie.ts`**

Change the import (line 1) to remove `type KieImageSize`:

```ts
import { createTask, pollTaskResult } from "../kie";
```

And change the `imageSize` line (line 12) to remove the cast:

```ts
      imageSize: input.size,
```

- [ ] **Step 5: Verify tests + types**

Run: `npx vitest run lib/providers/kie.test.ts lib/models.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors (no remaining references to `KieImageSize`).

- [ ] **Step 6: Commit**

```bash
git add lib/kie.ts lib/providers/kie.ts lib/providers/kie.test.ts
git commit -m "refactor(kie): widen createTask image_size to string for Seedream vocab"
```

---

## Task 3: Remove the flux-kontext models

**Files:**
- Modify: `lib/models.ts`
- Test: `lib/models.test.ts`

- [ ] **Step 1: Update the registry test (red)**

In `lib/models.test.ts`, **delete** this test entirely:

```ts
  it("exposes the flux kontext models too", () => {
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-pro");
    expect(MODELS.map((m) => m.id)).toContain("black-forest-labs/flux-kontext-max");
  });
```

And **add** this test in its place:

```ts
  it("contains exactly nano-banana-edit and seedream-v4-edit", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "google/nano-banana-edit",
      "bytedance/seedream-v4-edit",
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/models.test.ts`
Expected: FAIL — `MODELS.map(...)` still includes the two `black-forest-labs/...` ids, so `toEqual([...])` does not match.

- [ ] **Step 3: Remove the flux rows from `lib/models.ts`**

Delete these two lines from the `MODELS` array:

```ts
  { id: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
  { id: "black-forest-labs/flux-kontext-max", label: "Flux Kontext Max", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
```

`MODELS` should now contain exactly the nano-banana and seedream rows.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/models.ts lib/models.test.ts
git commit -m "feat(image-edit): remove flux-kontext models from registry"
```

---

## Task 4: Require an explicit `--model` (remove the silent default)

**Files:**
- Modify: `lib/models.ts` (remove `DEFAULT_MODEL`, fix nano label)
- Modify: `scripts/lib/args.ts`
- Modify: `lib/models.test.ts` (drop `DEFAULT_MODEL` usage)
- Test: `scripts/lib/args.test.ts`

- [ ] **Step 1: Replace `scripts/lib/args.test.ts` with the model-required version**

Overwrite `scripts/lib/args.test.ts` with this exact content (adds `--model` to every success case and a new missing-`--model` throw test):

```ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  it("parses a result run with sensible defaults", () => {
    const o = parseArgs(["--model", "google/nano-banana-edit", "--prompt", "make figure", "--source", "puppy", "--slug", "afg", "--mode", "result", "--count", "4", "--size", "800x1200"]);
    expect(o).toMatchObject({
      model: "google/nano-banana-edit",
      mode: "result",
      count: 4,
      size: "800x1200",
      start: 1,
      orientation: "portrait",
      out: "output/image-edit/afg",
      noAi: false,
    });
  });

  it("defaults compare size to 1200x800 and orientation to portrait", () => {
    const o = parseArgs(["--model", "google/nano-banana-edit", "--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "compare"]);
    expect(o.size).toBe("1200x800");
    expect(o.orientation).toBe("portrait");
  });

  it("requires --model (no silent default)", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "afg"])).toThrow(/model/);
  });

  it("requires slug and source", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x"])).toThrow(/slug/);
    expect(() => parseArgs(["--prompt", "p", "--slug", "afg"])).toThrow(/source/);
  });

  it("requires prompt unless --no-ai", () => {
    expect(() => parseArgs(["--source", "x", "--slug", "afg"])).toThrow(/prompt/);
    const o = parseArgs(["--model", "google/nano-banana-edit", "--source", "dog", "--slug", "afg", "--mode", "single", "--size", "800x800", "--no-ai"]);
    expect(o.noAi).toBe(true);
  });

  it("rejects invalid mode and size", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--mode", "weird"])).toThrow(/mode/);
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--size", "100x100"])).toThrow(/size/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/lib/args.test.ts`
Expected: FAIL — `it("requires --model ...")` does not throw yet (parseArgs currently falls back to `DEFAULT_MODEL`).

- [ ] **Step 3: Make `--model` required in `scripts/lib/args.ts`**

Change the import (line 1) from:

```ts
import { DEFAULT_MODEL, type BizSize } from "../../lib/models";
```

to:

```ts
import type { BizSize } from "../../lib/models";
```

Add a required-field check immediately after the existing `if (!m.source) ...` line:

```ts
  if (!m.model) throw new Error("缺少 --model（请指定模型，不再使用默认）");
```

Change the returned `model` field from:

```ts
    model: m.model ?? DEFAULT_MODEL,
```

to:

```ts
    model: m.model,
```

- [ ] **Step 4: Remove `DEFAULT_MODEL` from `lib/models.ts`**

Delete this line:

```ts
export const DEFAULT_MODEL = "google/nano-banana-edit";
```

And drop the "（默认）" suffix from the nano-banana label so the registry implies no silent default:

```ts
  { id: "google/nano-banana-edit", label: "Nano Banana Edit", provider: "kie", kind: "edit", sizeParam: (s) => KIE_SIZE[s] },
```

- [ ] **Step 5: Remove `DEFAULT_MODEL` usage from `lib/models.test.ts`**

Change the import line from:

```ts
import { getModel, MODELS, DEFAULT_MODEL } from "./models";
```

to:

```ts
import { getModel, MODELS } from "./models";
```

In the first test, change its title and body to not use `DEFAULT_MODEL`:

```ts
  it("has nano-banana-edit as a KIE edit model", () => {
    const m = getModel("google/nano-banana-edit");
    expect(m.id).toBe("google/nano-banana-edit");
    expect(m.provider).toBe("kie");
    expect(m.kind).toBe("edit");
  });
```

In the second test, change `getModel(DEFAULT_MODEL)` to the literal id:

```ts
  it("maps business sizes to nano-banana KIE image_size params", () => {
    const m = getModel("google/nano-banana-edit");
    expect(m.sizeParam("800x800")).toBe("1:1");
    expect(m.sizeParam("800x1200")).toBe("9:16");
    expect(m.sizeParam("1200x800")).toBe("16:9");
  });
```

- [ ] **Step 6: Run the tests + typecheck to verify all pass**

Run: `npx vitest run scripts/lib/args.test.ts lib/models.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors (no remaining references to `DEFAULT_MODEL`).

- [ ] **Step 7: Commit**

```bash
git add lib/models.ts lib/models.test.ts scripts/lib/args.ts scripts/lib/args.test.ts
git commit -m "feat(image-edit)!: require explicit --model, remove silent default"
```

---

## Task 5: Resolve `image_size` per model in the web app worker

The web app currently always sends `aspectCfg.kieImageSize` (`1:1`/`9:16`/`16:9`), which Seedream rejects. Route it through the registry so each model gets its own vocabulary.

**Files:**
- Modify: `lib/aspect.ts`
- Modify: `lib/worker.ts`
- Test: `lib/worker.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/worker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveImageSize } from "./worker";

describe("resolveImageSize", () => {
  it("maps aspect to nano-banana image_size", () => {
    expect(resolveImageSize("google/nano-banana-edit", "landscape")).toBe("16:9");
    expect(resolveImageSize("google/nano-banana-edit", "square")).toBe("1:1");
    expect(resolveImageSize("google/nano-banana-edit", "portrait")).toBe("9:16");
  });

  it("maps aspect to Seedream image_size vocabulary", () => {
    expect(resolveImageSize("bytedance/seedream-v4-edit", "landscape")).toBe("landscape_16_9");
    expect(resolveImageSize("bytedance/seedream-v4-edit", "square")).toBe("square_hd");
    expect(resolveImageSize("bytedance/seedream-v4-edit", "portrait")).toBe("portrait_16_9");
  });

  it("defaults an undefined aspect to square", () => {
    expect(resolveImageSize("google/nano-banana-edit", undefined)).toBe("1:1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/worker.test.ts`
Expected: FAIL — `resolveImageSize` is not exported from `./worker` (import error / not a function).

- [ ] **Step 3: Add `ASPECT_TO_BIZSIZE` to `lib/aspect.ts`**

Add the `BizSize` type import just below the two leading comment lines (above `export type Aspect`):

```ts
import type { BizSize } from "./models";
```

Add this constant immediately after `export const DEFAULT_ASPECT: Aspect = "square";`:

```ts

// Aspect → skill 业务尺寸（供模型注册表 sizeParam 解析各模型的 image_size 词表）
export const ASPECT_TO_BIZSIZE: Record<Aspect, BizSize> = {
  landscape: "1200x800",
  square: "800x800",
  portrait: "800x1200",
};
```

- [ ] **Step 4: Add `resolveImageSize` and use it in `lib/worker.ts`**

Update the aspect import (line 8) to also pull in the new symbols, and add a `getModel` import below it:

```ts
import { getAspectConfig, ASPECT_TO_BIZSIZE, DEFAULT_ASPECT, type Aspect } from "./aspect";
import { getModel } from "./models";
```

Add this exported function just after the `OUTPUT_DIR` constant (before `generateCandidate`):

```ts
/**
 * 业务比例 → 该模型的 image_size（经模型注册表，按模型词表解析）
 */
export function resolveImageSize(modelId: string, aspect: Aspect | undefined): string {
  return getModel(modelId).sizeParam(ASPECT_TO_BIZSIZE[aspect ?? DEFAULT_ASPECT]);
}
```

Change the `createTask` call's `imageSize` from:

```ts
      imageSize: aspectCfg.kieImageSize,
```

to:

```ts
      imageSize: resolveImageSize(run.model, run.aspect),
```

(`aspectCfg` is still used for `width`/`height`/`unsplashOrientation`, so keep `getAspectConfig`. The `kieImageSize` field on `AspectConfig` is now unused but left in place — harmless.)

- [ ] **Step 5: Run the test + typecheck to verify they pass**

Run: `npx vitest run lib/worker.test.ts`
Expected: PASS (all three tests).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/aspect.ts lib/worker.ts lib/worker.test.ts
git commit -m "fix(web): resolve image_size per model so Seedream gets a valid size"
```

---

## Task 6: Swap the web app model dropdown

**Files:**
- Modify: `app/page.tsx:22-32`

- [ ] **Step 1: Replace the `MODELS` constant**

In `app/page.tsx`, replace the entire `MODELS` array (the three-entry list with the two `black-forest-labs/flux-kontext-*` objects) with:

```ts
const MODELS = [
  { value: "google/nano-banana-edit", label: "google/nano-banana-edit（默认）" },
  { value: "bytedance/seedream-v4-edit", label: "bytedance/seedream-v4-edit" },
];
```

`MODELS[0]` is still nano-banana, so `useState(MODELS[0].value)` keeps the same default selection. No other change needed (the `<select>` maps over `MODELS`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(web): swap flux dropdown options for seedream-v4-edit"
```

---

## Task 7: Update `SKILL.md`

**Files:**
- Modify: `.claude/skills/image-edit/SKILL.md`

No tests (documentation). Make these five edits.

- [ ] **Step 1: frontmatter `description`**

Replace:

```
或要求用 nano-banana-edit 等模型按 prompt 改图时，必须使用本 skill。模型可插拔（默认 google/nano-banana-edit，经 KIE）。
```

with:

```
或要求用 nano-banana-edit / seedream 等模型按 prompt 改图时，必须使用本 skill。模型可插拔（经 KIE；未指定模型则询问，不静默默认）。
```

- [ ] **Step 2: 概述**

Replace:

```
用所选模型（默认 KIE `google/nano-banana-edit`）出图
```

with:

```
用所选模型（经 KIE；**未指定则先问你用哪个**）出图
```

- [ ] **Step 3: 工作流「收集输入」step 1 — model line**

Replace:

```
   - 模型：默认 `google/nano-banana-edit`；用户可换（见「可用模型」）。
```

with:

```
   - 模型：**必填**。用户指定则用；**未指定时用 `AskUserQuestion` 列出「可用模型」让用户选，不静默默认**。
```

- [ ] **Step 4: 「可用模型」section**

Replace the whole section body:

```
## 可用模型

- `google/nano-banana-edit`（默认）
- `black-forest-labs/flux-kontext-pro`
- `black-forest-labs/flux-kontext-max`

加模型：编辑 `lib/models.ts`；加非 KIE 厂商：在 `lib/providers/` 加适配器（实现 `GenProvider`）并注册。
```

with:

```
## 可用模型

未指定模型时，用 `AskUserQuestion` 列出下面两项让用户选（附简介），不静默默认：

- `google/nano-banana-edit` —— 通用、稳、快
- `bytedance/seedream-v4-edit` —— Seedream 4.0，多主体一致性 / 复杂编辑强

加模型：编辑 `lib/models.ts`；加非 KIE 厂商：在 `lib/providers/` 加适配器（实现 `GenProvider`）并注册。
```

- [ ] **Step 5: 「何时提问」section**

Replace:

```
URL 与文案明确时做合理假设直接干。仅在以下情况简短提问：URL 抓不到且无文案/截图；区块数量与默认不符导致资产数不明；用户需要特定目录/命名/视觉风格而页面无法判断。
```

with:

```
URL 与文案明确时做合理假设直接干。仅在以下情况简短提问：**用户未指定模型（必须先选模型再出图）**；URL 抓不到且无文案/截图；区块数量与默认不符导致资产数不明；用户需要特定目录/命名/视觉风格而页面无法判断。
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/image-edit/SKILL.md
git commit -m "docs(image-edit): SKILL.md — add Seedream, mandate model selection"
```

---

## Task 8: Full verification

No code changes — confirm the whole change set is consistent.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all files green (`lib/models.test.ts`, `lib/providers/kie.test.ts`, `lib/worker.test.ts`, `scripts/lib/args.test.ts`, and the untouched `lib/postprocess.test.ts`, `lib/unsplash.test.ts`, `scripts/lib/run.test.ts`).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors (covers `app/page.tsx` and the rest).

- [ ] **Step 3: Confirm no flux/kontext or DEFAULT_MODEL residue in code/skill**

Run: `grep -rni "flux\|kontext" lib scripts app .claude 2>/dev/null; grep -rn "DEFAULT_MODEL" lib scripts app .claude 2>/dev/null`
Expected: no output (only historical files under `docs/` may still mention them — that's fine).

- [ ] **Step 4 (optional, manual — costs KIE credits, needs `.env`): smoke-test Seedream via the CLI**

Run (only if you want a live check; do not run automatically):

```bash
npm run edit -- --model "bytedance/seedream-v4-edit" --prompt "make the subject a collectible blister-pack action figure" --source "puppy" --mode result --count 1 --size 800x1200 --slug smoke-seedream --start 1
```

Expected: prints JSON with `results[0].ok === true` and a `.webp` written under `output/image-edit/smoke-seedream/`. Verify size: `sips -g pixelWidth -g pixelHeight output/image-edit/smoke-seedream/smoke-seedream-1.webp` → 800 × 1200. Delete the smoke output afterward.

- [ ] **Step 5: Wrap up the branch**

All tasks are committed on `feat/seedream-v4-edit`. Use the **superpowers:finishing-a-development-branch** skill to choose how to integrate (merge to `main`, open a PR, or keep the branch).

---

## Self-Review (plan vs spec)

- **Spec §2 #1 (route 1 passthrough):** Task 2. ✓
- **Spec §2 #2 + §4 (size mapping aligned with nano-banana):** Task 1 (`SEEDREAM_SIZE`) + Task 1 test. ✓
- **Spec §2 #3 (no default, `--model` required):** Task 4. ✓
- **Spec §2 #4 (no extra params):** Nothing added — `createTask` body unchanged beyond the type widen. ✓
- **Spec §2 #5 (final webp sizes unchanged):** `run.ts`/`worker.ts` post-process untouched; only the generation `image_size` changes. ✓
- **Spec §2 #6 + §3 (remove flux):** Task 3 (registry/test) + Task 6 (web dropdown) + Task 8 grep. ✓
- **Spec §2 #7 + §3 web blocks (web app worker + dropdown + `ASPECT_TO_BIZSIZE`):** Task 5 + Task 6. ✓
- **Spec §5 (SKILL.md):** Task 7. ✓
- **Spec §7 (tests — models, args, worker, provider passthrough):** Tasks 1, 2, 4, 5. ✓
- **Spec §8 risk (historical flux run regenerate):** No code needed — `generateCandidate`'s existing try/catch marks such candidates `failed` with the `getModel` "未知模型" message. ✓

No placeholders; types/method names (`SEEDREAM_SIZE`, `resolveImageSize`, `ASPECT_TO_BIZSIZE`) are consistent across tasks.
