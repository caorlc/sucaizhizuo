import { describe, it, expect, vi } from "vitest";
import { runEdit, type RunDeps } from "./run";
import { parseArgs } from "./args";

function fakeDeps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    getModel: () => ({ id: "m", label: "m", provider: "kie", kind: "edit", sizeParam: () => "9:16" }),
    getProvider: () => ({ generate: vi.fn(async () => ({ imageUrl: "https://res/x.png" })) }),
    fetchSources: vi.fn(async (_k, _o, n) => Array.from({ length: n }, (_v, i) => ({ imageUrl: `https://src/${i}.jpg` }))),
    download: vi.fn(async () => Buffer.from("img")),
    toWebp: vi.fn(async () => Buffer.from("webp")),
    compose: vi.fn(async () => Buffer.from("composed")),
    writeFile: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runEdit", () => {
  it("result mode: writes N files named slug-<start..>", async () => {
    const writeFile = vi.fn(async () => {});
    const opts = parseArgs(["--prompt", "p", "--source", "puppy", "--slug", "afg", "--mode", "result", "--count", "3", "--start", "2", "--size", "800x1200", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ writeFile }));
    expect(res.map((r) => r.index)).toEqual([2, 3, 4]);
    expect(res.every((r) => r.ok)).toBe(true);
    const names = writeFile.mock.calls.map((c) => c[0]);
    expect(names).toContain("out/afg-2.webp");
    expect(names).toContain("out/afg-4.webp");
  });

  it("compare mode: composes instead of plain webp", async () => {
    const compose = vi.fn(async () => Buffer.from("c"));
    const opts = parseArgs(["--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "compare", "--count", "1", "--out", "out"]);
    await runEdit(opts, fakeDeps({ compose }));
    expect(compose).toHaveBeenCalledOnce();
  });

  it("no-ai single: skips provider.generate, crops the source", async () => {
    const generate = vi.fn();
    const opts = parseArgs(["--source", "dog", "--slug", "afg", "--mode", "single", "--size", "800x800", "--no-ai", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ getProvider: () => ({ generate }) }));
    expect(generate).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
  });

  it("records a failed item instead of throwing when generate rejects", async () => {
    const opts = parseArgs(["--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "result", "--count", "1", "--out", "out"]);
    const res = await runEdit(opts, fakeDeps({ getProvider: () => ({ generate: vi.fn(async () => { throw new Error("boom"); }) }) }));
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toBe("boom");
  });
});
